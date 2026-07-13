import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CodLedgerEntryType,
  CodSettlementStatus,
  DeliveryResolutionAction,
  DeliveryResolutionStatus,
  PaymentMethod,
  PaymentStatus,
  PickupChallengeStatus,
  PickupVerificationMethod,
  Prisma,
  Role,
  prisma,
} from "@aagam/database";
import { DeliveryJobStatus, NotificationEventTypeType } from "@aagam/types";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import { OutboxService } from "../notifications/outbox.service";
import {
  CollectCodDto,
  CompleteDeliveryOperationDto,
  ConfirmStoreHandoffDto,
  DeliveryFailureReason,
  IssuePickupChallengeDto,
  PickupVerificationMethodDto,
  RecordDeliveryFailureDto,
  ResolveDeliveryFailureDto,
  ReturnDisposition,
  ReturnInspectionDto,
  SettleCodDto,
  VerifyPickupProofDto,
} from "./delivery-operations.dto";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import {
  decideFailureResolution,
  FAILURE_POLICY_VERSION,
} from "./delivery-failure-policy";

type DbClient = Prisma.TransactionClient | typeof prisma;
type Actor = { id: string; role: Role };

type DeliveryOperationType =
  | "OTP_ISSUED"
  | "OTP_ATTEMPT_FAILED"
  | "OTP_VERIFIED"
  | "DELIVERY_FAILURE_RECORDED"
  | "RETURN_STARTED"
  | "RETURN_CONFIRMED"
  | "RETURN_INSPECTION_COMPLETED"
  | "COD_COLLECTED"
  | "COD_SETTLED"
  | "PICKUP_CHALLENGE_ISSUED"
  | "PICKUP_VERIFIED"
  | "DELIVERY_PROOF_RECORDED"
  | "FAILURE_RESOLUTION_DECIDED"
  | "FAILURE_RESOLUTION_APPLIED"
  | "COD_VARIANCE_RECORDED";

type DeliveryOperationStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "SUPERSEDED";

type DeliveryOperationRow = {
  id: string;
  deliveryJobId: string;
  orderId: string;
  type: DeliveryOperationType;
  status: DeliveryOperationStatus;
  actorUserId: string | null;
  actorRole: Role | null;
  idempotencyKey: string;
  details: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
};

type OperationInput = {
  deliveryJobId: string;
  orderId: string;
  type: DeliveryOperationType;
  status?: DeliveryOperationStatus;
  actor?: Actor | null;
  idempotencyKey: string;
  details?: Record<string, unknown>;
};

const FAILURE_STATUSES = new Set<string>([
  DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
  DeliveryJobStatus.RIDER_AT_STORE,
  DeliveryJobStatus.OUT_FOR_DELIVERY,
  DeliveryJobStatus.RIDER_AT_CUSTOMER,
]);
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const PICKUP_TTL_MS = 15 * 60 * 1000;
const PICKUP_MAX_ATTEMPTS = 5;

@Injectable()
export class DeliveryOperationsService {
  constructor(
    private readonly workflow: DeliveryWorkflowService,
    private readonly outbox: OutboxService
  ) {}

  private enabled(name: string) {
    return (
      String(process.env[name] || "")
        .trim()
        .toLowerCase() === "true"
    );
  }

  private otpSecret() {
    const configured = String(process.env.DELIVERY_OTP_SECRET || "").trim();
    if (configured) return configured;
    if (process.env.NODE_ENV === "production") {
      throw new Error("DELIVERY_OTP_SECRET is required in production");
    }
    return "aagam-local-development-delivery-otp-secret";
  }

  private otpCode(deliveryJobId: string, nonce: string) {
    const digest = createHmac("sha256", this.otpSecret())
      .update(`${deliveryJobId}:${nonce}`)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, "0");
  }

  private otpHash(code: string, salt: string) {
    return createHash("sha256").update(`${salt}:${code}`).digest("hex");
  }

  private pickupCode(method: PickupVerificationMethod) {
    if (method === PickupVerificationMethod.STORE_PICKUP_PIN) {
      return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(
        6,
        "0"
      );
    }
    return `AAGAM-PICKUP-${randomBytes(24).toString("base64url")}`;
  }

  private pickupHash(code: string, salt: string) {
    return createHash("sha256")
      .update(`${salt}:${String(code).trim()}`)
      .digest("hex");
  }

  private assertCoordinates(latitude?: number, longitude?: number) {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException(
        "Latitude and longitude must be provided together"
      );
    }
  }

  private async queryRows<T>(tx: DbClient, query: Prisma.Sql): Promise<T[]> {
    return (await tx.$queryRaw(query)) as T[];
  }

  private async lock(tx: DbClient, key: string) {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS "lock"
    `);
  }

  private async findOperationByKey(tx: DbClient, idempotencyKey: string) {
    const rows = await this.queryRows<DeliveryOperationRow>(
      tx,
      Prisma.sql`
      SELECT * FROM "DeliveryOperation"
      WHERE "idempotencyKey" = ${idempotencyKey}
      LIMIT 1
    `
    );
    return rows[0] || null;
  }

  private async createOperation(tx: DbClient, input: OperationInput) {
    const existing = await this.findOperationByKey(tx, input.idempotencyKey);
    if (existing) return existing;

    const id = `dop_${randomUUID()}`;
    const details = JSON.stringify(input.details || {});
    const rows = await this.queryRows<DeliveryOperationRow>(
      tx,
      Prisma.sql`
      INSERT INTO "DeliveryOperation" (
        "id", "deliveryJobId", "orderId", "type", "status",
        "actorUserId", "actorRole", "idempotencyKey", "details",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${input.deliveryJobId}, ${input.orderId},
        ${input.type}::"DeliveryOperationType",
        ${input.status || "COMPLETED"}::"DeliveryOperationStatus",
        ${input.actor?.id || null}, ${input.actor?.role || null}::"Role",
        ${input.idempotencyKey}, ${details}::jsonb,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("idempotencyKey") DO NOTHING
      RETURNING *
    `
    );
    if (rows[0]) return rows[0];
    const raced = await this.findOperationByKey(tx, input.idempotencyKey);
    if (!raced)
      throw new ConflictException("Delivery operation could not be recorded");
    return raced;
  }

  private async updateOperationStatus(
    tx: DbClient,
    id: string,
    status: DeliveryOperationStatus,
    detailsPatch: Record<string, unknown> = {}
  ) {
    const patch = JSON.stringify(detailsPatch);
    const rows = await this.queryRows<DeliveryOperationRow>(
      tx,
      Prisma.sql`
      UPDATE "DeliveryOperation"
      SET "status" = ${status}::"DeliveryOperationStatus",
          "details" = "details" || ${patch}::jsonb,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING *
    `
    );
    return rows[0] || null;
  }

  private listOperations(tx: DbClient, deliveryJobId: string) {
    return this.queryRows<DeliveryOperationRow>(
      tx,
      Prisma.sql`
      SELECT * FROM "DeliveryOperation"
      WHERE "deliveryJobId" = ${deliveryJobId}
      ORDER BY "createdAt" DESC, "id" DESC
    `
    );
  }

  private publicOperation(operation: DeliveryOperationRow) {
    if (operation.type !== "OTP_ISSUED") return operation;
    const details = { ...(operation.details || {}) };
    delete details.nonce;
    delete details.salt;
    delete details.codeHash;
    return { ...operation, details };
  }

  private async latestOperation(
    tx: DbClient,
    deliveryJobId: string,
    type: DeliveryOperationType,
    statuses?: DeliveryOperationStatus[]
  ) {
    const statusFilter = statuses?.length
      ? Prisma.sql`AND "status"::text IN (${Prisma.join(statuses)})`
      : Prisma.empty;
    const rows = await this.queryRows<DeliveryOperationRow>(
      tx,
      Prisma.sql`
      SELECT * FROM "DeliveryOperation"
      WHERE "deliveryJobId" = ${deliveryJobId}
        AND "type" = ${type}::"DeliveryOperationType"
        ${statusFilter}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 1
    `
    );
    return rows[0] || null;
  }

  private async job(tx: DbClient, deliveryJobId: string) {
    const job = await tx.deliveryJob.findUnique({
      where: { id: deliveryJobId },
      include: {
        currentRider: { include: { user: true } },
        order: {
          include: {
            customer: { select: { id: true, name: true, email: true } },
            store: { select: { id: true, name: true, ownerId: true } },
            payment: true,
            items: { include: { product: true } },
          },
        },
        pickupProof: true,
        deliveryProof: true,
        codLedger: { include: { entries: { orderBy: { createdAt: "asc" } } } },
        failureDecisions: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!job) throw new NotFoundException("Delivery job not found");
    return job;
  }

  private assertRiderOrAdmin(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role !== Role.RIDER || job.currentRider?.userId !== actor.id) {
      throw new ForbiddenException(
        "Only the assigned rider or an administrator can perform this action"
      );
    }
  }

  private assertStoreOrAdmin(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (
      actor.role !== Role.STORE_OWNER ||
      job.order.store.ownerId !== actor.id
    ) {
      throw new ForbiddenException(
        "Only the owning store or an administrator can perform this action"
      );
    }
  }

  private assertCustomerOrAdmin(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role !== Role.CUSTOMER || job.order.customerId !== actor.id) {
      throw new ForbiddenException(
        "Only the order customer can access this handoff code"
      );
    }
  }

  private async notify(
    tx: DbClient,
    job: any,
    actor: Actor,
    eventType: NotificationEventTypeType,
    title: string,
    body: string,
    operation: DeliveryOperationRow,
    metadata: Record<string, unknown> = {}
  ) {
    await this.outbox.enqueue(
      {
        eventType,
        aggregateType: "DELIVERY_JOB",
        aggregateId: job.id,
        idempotencyKey: `delivery-operation:${operation.id}:${eventType}`,
        payload: {
          orderId: job.orderId,
          deliveryJobId: job.id,
          actorUserId: actor.id,
          actorRole: actor.role as any,
          title,
          body,
          metadata: {
            operationId: operation.id,
            operationType: operation.type,
            ...metadata,
          },
        },
      },
      tx
    );
  }

  async getSummary(deliveryJobId: string, actor: Actor) {
    const job = await this.job(prisma, deliveryJobId);
    if (actor.role === Role.RIDER) this.assertRiderOrAdmin(job, actor);
    else if (actor.role === Role.STORE_OWNER)
      this.assertStoreOrAdmin(job, actor);
    else if (actor.role === Role.CUSTOMER)
      this.assertCustomerOrAdmin(job, actor);
    else if (actor.role !== Role.ADMIN)
      throw new ForbiddenException("Role cannot access delivery operations");

    const operations = (await this.listOperations(prisma, deliveryJobId)).map(
      (operation) => this.publicOperation(operation)
    );
    const activeOtp = operations.find(
      (operation: DeliveryOperationRow) =>
        operation.type === "OTP_ISSUED" && operation.status === "PENDING"
    );
    const codCollected = operations.find(
      (operation: DeliveryOperationRow) =>
        operation.type === "COD_COLLECTED" && operation.status === "COMPLETED"
    );
    const codSettled = operations.find(
      (operation: DeliveryOperationRow) =>
        operation.type === "COD_SETTLED" && operation.status === "COMPLETED"
    );
    const inspection = operations.find(
      (operation: DeliveryOperationRow) =>
        operation.type === "RETURN_INSPECTION_COMPLETED" &&
        operation.status === "COMPLETED"
    );

    return {
      job,
      operations,
      requirements: {
        deliveryOtpRequired: true,
        codCollectionRequired: job.order.payment?.method === PaymentMethod.COD,
      },
      otp: activeOtp
        ? {
            issued: true,
            operationId: activeOtp.id,
            expiresAt: activeOtp.details?.expiresAt || null,
            maxAttempts: activeOtp.details?.maxAttempts || OTP_MAX_ATTEMPTS,
          }
        : { issued: false },
      cod: {
        applicable: job.order.payment?.method === PaymentMethod.COD,
        expectedAmountPaise:
          job.order.payment?.amountPaise || job.order.grandTotalPaise,
        collected: Boolean(codCollected),
        settled: Boolean(codSettled),
        ledger: job.codLedger || null,
      },
      pickupProof: job.pickupProof || null,
      deliveryProof: job.deliveryProof || null,
      failureDecision: job.failureDecisions?.[0] || null,
      returnInspection: inspection || null,
    };
  }

  async getQueue(actor: Actor) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException(
        "Only admin and store owners can view the delivery operations queue"
      );
    }
    const storeFilter =
      actor.role === Role.STORE_OWNER
        ? { order: { store: { ownerId: actor.id } } }
        : {};
    const jobs = await prisma.deliveryJob.findMany({
      where: {
        ...storeFilter,
        OR: [
          { status: "RIDER_AT_STORE" as any },
          {
            status: {
              in: [
                "DELIVERY_FAILED",
                "RETURNING_TO_STORE",
                "RETURNED_TO_STORE",
              ] as any,
            },
          },
          {
            order: {
              payment: {
                is: {
                  method: PaymentMethod.COD,
                  status: {
                    in: [PaymentStatus.PENDING_COD, PaymentStatus.CAPTURED],
                  },
                },
              },
            },
          },
        ],
      } as any,
      include: {
        currentRider: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        pickupProof: true,
        deliveryProof: true,
        codLedger: { include: { entries: { orderBy: { createdAt: "asc" } } } },
        failureDecisions: { orderBy: { createdAt: "desc" }, take: 10 },
        order: {
          include: {
            customer: { select: { id: true, name: true, email: true } },
            store: { select: { id: true, name: true, ownerId: true } },
            payment: true,
            items: { include: { product: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return Promise.all(
      jobs.map(async (job: any) => ({
        ...job,
        operations: (await this.listOperations(prisma, job.id)).map(
          (operation) => this.publicOperation(operation)
        ),
      }))
    );
  }

  private async assertPickupChecklist(tx: DbClient, job: any) {
    const task = await tx.riderPickupTask.findUnique({
      where: { deliveryJobId: job.id },
    });
    if (!task || task.status !== "VERIFIED") {
      throw new BadRequestException(
        "The Rider item and parcel checklist must be verified before handoff"
      );
    }
    return task;
  }

  async issuePickupChallenge(
    deliveryJobId: string,
    actor: Actor,
    input: IssuePickupChallengeDto
  ) {
    if (actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException(
        "Only the owning store user can issue pickup PIN or QR proof"
      );
    }
    if (input.method === PickupVerificationMethodDto.STORE_CONFIRMED_HANDOFF) {
      throw new BadRequestException(
        "Store-confirmed handoff does not use a challenge"
      );
    }
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `pickup-proof:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        if (
          job.status !== DeliveryJobStatus.RIDER_AT_STORE ||
          !job.currentRiderId
        ) {
          throw new BadRequestException(
            "Pickup proof is available only while the assigned Rider is at the store"
          );
        }
        await this.assertPickupChecklist(tx, job);
        if (job.pickupProof)
          throw new ConflictException("Pickup handoff is already verified");

        await tx.pickupChallenge.updateMany({
          where: { deliveryJobId, status: PickupChallengeStatus.PENDING },
          data: { status: PickupChallengeStatus.SUPERSEDED },
        });
        const method = input.method as PickupVerificationMethod;
        const code = this.pickupCode(method);
        const salt = randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + PICKUP_TTL_MS);
        const challenge = await tx.pickupChallenge.create({
          data: {
            deliveryJobId,
            method,
            codeHash: this.pickupHash(code, salt),
            salt,
            issuedByStoreUserId: actor.id,
            parcelCount: input.parcelCount,
            expiresAt,
          },
        });
        await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "PICKUP_CHALLENGE_ISSUED",
          actor,
          idempotencyKey: `pickup-challenge:${challenge.id}`,
          details: {
            challengeId: challenge.id,
            method,
            parcelCount: input.parcelCount,
            expiresAt: expiresAt.toISOString(),
          },
        });
        return {
          challengeId: challenge.id,
          method,
          code,
          expiresAt,
          parcelCount: input.parcelCount,
        };
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  private async recordPickupProof(
    tx: DbClient,
    job: any,
    actor: Actor,
    input: {
      method: PickupVerificationMethod;
      parcelCount: number;
      storeUserId: string;
      challengeId?: string;
      latitude?: number;
      longitude?: number;
      accuracyMetres?: number;
    }
  ) {
    this.assertCoordinates(input.latitude, input.longitude);
    if (!job.currentRiderId)
      throw new BadRequestException("Delivery has no assigned Rider");
    const existing = await tx.pickupProof.findUnique({
      where: { deliveryJobId: job.id },
    });
    if (existing) return existing;
    const verifiedAt = new Date();
    const proof = await tx.pickupProof.create({
      data: {
        deliveryJobId: job.id,
        orderId: job.orderId,
        riderId: job.currentRiderId,
        storeUserId: input.storeUserId,
        verifiedAt,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMetres: input.accuracyMetres,
        parcelCount: input.parcelCount,
        verificationMethod: input.method,
        challengeId: input.challengeId,
      },
    });
    await this.workflow.transitionWithinTransaction(
      tx,
      job.id,
      DeliveryJobStatus.PICKUP_VERIFIED,
      actor,
      {
        expectedStatus: DeliveryJobStatus.RIDER_AT_STORE,
        skipRoleCheck: true,
        metadata: {
          phase5ProofId: proof.id,
          pickupVerificationMethod: input.method,
          parcelCount: input.parcelCount,
          storeUserId: input.storeUserId,
          coordinatesRecorded: input.latitude != null,
        },
      }
    );
    await this.createOperation(tx, {
      deliveryJobId: job.id,
      orderId: job.orderId,
      type: "PICKUP_VERIFIED",
      actor,
      idempotencyKey: `pickup-proof:${job.id}`,
      details: {
        pickupProofId: proof.id,
        riderId: job.currentRiderId,
        storeUserId: input.storeUserId,
        verifiedAt: verifiedAt.toISOString(),
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyMetres: input.accuracyMetres ?? null,
        parcelCount: input.parcelCount,
        verificationMethod: input.method,
      },
    });
    return proof;
  }

  async verifyPickupChallenge(
    deliveryJobId: string,
    actor: Actor,
    input: VerifyPickupProofDto
  ) {
    const outcome = await prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `pickup-proof:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (actor.role !== Role.RIDER) {
          throw new ForbiddenException(
            "The assigned Rider must verify a pickup PIN or QR code"
          );
        }
        if (job.status !== DeliveryJobStatus.RIDER_AT_STORE) {
          throw new BadRequestException(
            "Pickup proof is available only at the store"
          );
        }
        await this.assertPickupChecklist(tx, job);
        const method = input.method as PickupVerificationMethod;
        if (method === PickupVerificationMethod.STORE_CONFIRMED_HANDOFF) {
          throw new BadRequestException(
            "Store-confirmed handoff must be submitted by the owning store"
          );
        }
        const challenge = await tx.pickupChallenge.findFirst({
          where: {
            deliveryJobId,
            method,
            status: PickupChallengeStatus.PENDING,
          },
          orderBy: { createdAt: "desc" },
        });
        if (!challenge)
          throw new NotFoundException("No active pickup challenge exists");
        if (challenge.expiresAt.getTime() <= Date.now()) {
          await tx.pickupChallenge.update({
            where: { id: challenge.id },
            data: { status: PickupChallengeStatus.EXPIRED },
          });
          return {
            error: {
              reason: "Pickup challenge expired",
              attempts: challenge.attempts,
            },
          };
        }
        if (challenge.parcelCount !== input.parcelCount) {
          throw new BadRequestException(
            `Parcel count must equal ${challenge.parcelCount}`
          );
        }
        const supplied = this.pickupHash(input.code, challenge.salt);
        const valid =
          supplied.length === challenge.codeHash.length &&
          timingSafeEqual(
            Buffer.from(supplied, "hex"),
            Buffer.from(challenge.codeHash, "hex")
          );
        if (!valid) {
          const attempts = challenge.attempts + 1;
          await tx.pickupChallenge.update({
            where: { id: challenge.id },
            data: {
              attempts,
              status:
                attempts >= PICKUP_MAX_ATTEMPTS
                  ? PickupChallengeStatus.FAILED
                  : PickupChallengeStatus.PENDING,
            },
          });
          return {
            error: {
              reason:
                attempts >= PICKUP_MAX_ATTEMPTS
                  ? "Pickup challenge attempt limit reached"
                  : "Pickup PIN or QR code is incorrect",
              attempts,
            },
          };
        }
        const proof = await this.recordPickupProof(tx, job, actor, {
          method,
          parcelCount: input.parcelCount,
          storeUserId: challenge.issuedByStoreUserId,
          challengeId: challenge.id,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMetres: input.accuracyMetres,
        });
        await tx.pickupChallenge.update({
          where: { id: challenge.id },
          data: { status: PickupChallengeStatus.USED, usedAt: new Date() },
        });
        return { proof };
      },
      { isolationLevel: "Serializable" as any }
    );
    if ("error" in outcome && outcome.error) {
      if (outcome.error.attempts >= PICKUP_MAX_ATTEMPTS) {
        throw new HttpException(
          outcome.error.reason,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw new BadRequestException(outcome.error.reason);
    }
    return outcome.proof;
  }

  async confirmStorePickup(
    deliveryJobId: string,
    actor: Actor,
    input: ConfirmStoreHandoffDto
  ) {
    if (actor.role !== Role.STORE_OWNER) {
      throw new ForbiddenException(
        "Only the owning store user can confirm physical handoff"
      );
    }
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `pickup-proof:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.RIDER_AT_STORE) {
          throw new BadRequestException(
            "Store handoff can be confirmed only while the Rider is at the store"
          );
        }
        await this.assertPickupChecklist(tx, job);
        return this.recordPickupProof(tx, job, actor, {
          method: PickupVerificationMethod.STORE_CONFIRMED_HANDOFF,
          parcelCount: input.parcelCount,
          storeUserId: actor.id,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMetres: input.accuracyMetres,
        });
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async issueOtp(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    const result = await prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-otp:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
          throw new BadRequestException(
            "Delivery OTP can be issued only after the rider arrives at the customer"
          );
        }

        const key =
          idempotencyKey || `otp-issued:${deliveryJobId}:${randomUUID()}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing) {
          if (
            existing.deliveryJobId !== deliveryJobId ||
            existing.type !== "OTP_ISSUED"
          ) {
            throw new ConflictException(
              "Idempotency key is already used by another operation"
            );
          }
          return {
            operation: existing,
            expiresAt: new Date(String(existing.details?.expiresAt)),
          };
        }

        await tx.$executeRaw(Prisma.sql`
        UPDATE "DeliveryOperation"
        SET "status" = 'SUPERSEDED'::"DeliveryOperationStatus",
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "deliveryJobId" = ${deliveryJobId}
          AND "type" = 'OTP_ISSUED'::"DeliveryOperationType"
          AND "status" = 'PENDING'::"DeliveryOperationStatus"
      `);

        const nonce = randomBytes(24).toString("hex");
        const salt = randomBytes(16).toString("hex");
        const code = this.otpCode(deliveryJobId, nonce);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "OTP_ISSUED",
          status: "PENDING",
          actor,
          idempotencyKey: key,
          details: {
            nonce,
            salt,
            codeHash: this.otpHash(code, salt),
            expiresAt: expiresAt.toISOString(),
            maxAttempts: OTP_MAX_ATTEMPTS,
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "RIDER_AT_CUSTOMER",
          "Delivery verification code ready",
          `Your verification code for order #${job.orderId
            .slice(-8)
            .toUpperCase()} is ready in the order screen.`,
          operation
        );
        return { operation, expiresAt };
      },
      { isolationLevel: "Serializable" as any }
    );

    return {
      issued: result.operation.status === "PENDING",
      operationId: result.operation.id,
      expiresAt: result.expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
    };
  }

  async getCustomerOtp(deliveryJobId: string, actor: Actor) {
    const job = await this.job(prisma, deliveryJobId);
    this.assertCustomerOrAdmin(job, actor);
    const issue = await this.latestOperation(
      prisma,
      deliveryJobId,
      "OTP_ISSUED",
      ["PENDING"]
    );
    if (!issue) throw new NotFoundException("No active delivery OTP exists");
    const expiresAt = new Date(String(issue.details?.expiresAt));
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        "Delivery OTP expired. Ask the rider to issue a new code."
      );
    }
    return {
      code: this.otpCode(deliveryJobId, String(issue.details.nonce)),
      expiresAt,
      orderId: job.orderId,
    };
  }

  private async verifyOtpWithinTransaction(
    tx: DbClient,
    job: any,
    actor: Actor,
    code: string
  ): Promise<
    | { ok: true; operation: DeliveryOperationRow }
    | { ok: false; reason: string; attempts: number }
  > {
    const issue = await this.latestOperation(tx, job.id, "OTP_ISSUED", [
      "PENDING",
    ]);
    if (!issue)
      return {
        ok: false,
        reason: "No active delivery OTP exists",
        attempts: 0,
      };

    const expiresAt = new Date(String(issue.details?.expiresAt));
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      await this.updateOperationStatus(tx, issue.id, "FAILED", {
        expiredAt: new Date().toISOString(),
      });
      return {
        ok: false,
        reason: "Delivery OTP expired",
        attempts: OTP_MAX_ATTEMPTS,
      };
    }

    const failedRows = await this.queryRows<{ count: bigint }>(
      tx,
      Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "DeliveryOperation"
      WHERE "deliveryJobId" = ${job.id}
        AND "type" = 'OTP_ATTEMPT_FAILED'::"DeliveryOperationType"
        AND "details"->>'otpIssueId' = ${issue.id}
    `
    );
    const attempts = Number(failedRows[0]?.count || 0);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      return {
        ok: false,
        reason: "Delivery OTP attempt limit reached",
        attempts,
      };
    }

    const suppliedHash = this.otpHash(
      String(code || "").trim(),
      String(issue.details?.salt || "")
    );
    const expectedHash = String(issue.details?.codeHash || "");
    const valid =
      expectedHash.length === suppliedHash.length &&
      expectedHash.length > 0 &&
      timingSafeEqual(
        Buffer.from(expectedHash, "hex"),
        Buffer.from(suppliedHash, "hex")
      );

    if (!valid) {
      const nextAttempts = attempts + 1;
      await this.createOperation(tx, {
        deliveryJobId: job.id,
        orderId: job.orderId,
        type: "OTP_ATTEMPT_FAILED",
        status: "FAILED",
        actor,
        idempotencyKey: `otp-failed:${issue.id}:${nextAttempts}`,
        details: { otpIssueId: issue.id, attemptNumber: nextAttempts },
      });
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        await this.updateOperationStatus(tx, issue.id, "FAILED", {
          attemptLimitReachedAt: new Date().toISOString(),
        });
      }
      return {
        ok: false,
        reason: "Delivery OTP is incorrect",
        attempts: nextAttempts,
      };
    }

    const verified = await this.createOperation(tx, {
      deliveryJobId: job.id,
      orderId: job.orderId,
      type: "OTP_VERIFIED",
      actor,
      idempotencyKey: `otp-verified:${issue.id}`,
      details: { otpIssueId: issue.id, verifiedAt: new Date().toISOString() },
    });
    await this.updateOperationStatus(tx, issue.id, "COMPLETED", {
      verifiedOperationId: verified.id,
    });
    return { ok: true, operation: verified };
  }

  async completeDelivery(
    deliveryJobId: string,
    actor: Actor,
    input: CompleteDeliveryOperationDto,
    idempotencyKey?: string
  ) {
    const outcome = await prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-complete:${deliveryJobId}`);
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (job.status === DeliveryJobStatus.DELIVERED) return { job };
        if (job.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
          throw new BadRequestException(
            "Rider must arrive at the customer before completing delivery"
          );
        }

        if (input.riderConfirmed !== true) {
          throw new BadRequestException("Rider confirmation is required");
        }
        if (!input.otpCode)
          throw new BadRequestException(
            "Customer delivery OTP/PIN is required"
          );
        this.assertCoordinates(input.latitude, input.longitude);
        const verified = await this.verifyOtpWithinTransaction(
          tx,
          job,
          actor,
          input.otpCode
        );
        if (!verified.ok) return { otpError: verified };

        const payment = job.order.payment;
        if (payment?.method === PaymentMethod.COD) {
          const ledger = await tx.codLedger.findUnique({
            where: { deliveryJobId },
          });
          if (
            payment.status !== PaymentStatus.CAPTURED ||
            !ledger ||
            ledger.collectedAmountPaise !== ledger.expectedAmountPaise
          ) {
          throw new BadRequestException(
            "Collect the full COD amount into the independent COD ledger before completing delivery"
          );
          }
        }

        if (!job.currentRiderId)
          throw new BadRequestException("Delivery has no assigned Rider");
        const riderConfirmedAt = new Date();
        const proof = await tx.deliveryProof.create({
          data: {
            deliveryJobId,
            orderId: job.orderId,
            riderId: job.currentRiderId,
            customerUserId: job.order.customerId,
            verificationMethod: "CUSTOMER_OTP_PIN",
            otpOperationId: verified.operation.id,
            riderConfirmedAt,
            verifiedAt: riderConfirmedAt,
            note: input.note,
            latitude: input.latitude,
            longitude: input.longitude,
            accuracyMetres: input.accuracyMetres,
          },
        });
        await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "DELIVERY_PROOF_RECORDED",
          actor,
          idempotencyKey: `delivery-proof:${deliveryJobId}`,
          details: {
            deliveryProofId: proof.id,
            riderId: job.currentRiderId,
            customerUserId: job.order.customerId,
            verificationMethod: "CUSTOMER_OTP_PIN",
            otpOperationId: verified.operation.id,
            riderConfirmedAt: riderConfirmedAt.toISOString(),
            verifiedAt: riderConfirmedAt.toISOString(),
            note: input.note || null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            accuracyMetres: input.accuracyMetres ?? null,
          },
        });

        const delivered = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.DELIVERED,
          actor,
          {
            expectedStatus: DeliveryJobStatus.RIDER_AT_CUSTOMER,
            metadata: {
              phase5DeliveryProofId: proof.id,
              proofType: "CUSTOMER_OTP_PIN",
              riderConfirmed: true,
              coordinatesRecorded: input.latitude != null,
              completionIdempotencyKey: idempotencyKey || null,
            },
          }
        );
        return { job: delivered };
      },
      { isolationLevel: "Serializable" as any }
    );

    if ("otpError" in outcome && outcome.otpError) {
      if (outcome.otpError.attempts >= OTP_MAX_ATTEMPTS) {
        throw new HttpException(
          outcome.otpError.reason,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      throw new BadRequestException(outcome.otpError.reason);
    }
    return outcome.job;
  }

  async recordFailure(
    deliveryJobId: string,
    actor: Actor,
    input: RecordDeliveryFailureDto,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-failure:${deliveryJobId}`);
        const key =
          idempotencyKey || `delivery-failure:${deliveryJobId}:${randomUUID()}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing)
          return {
            operation: existing,
            job: await this.job(tx, deliveryJobId),
          };

        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (!FAILURE_STATUSES.has(job.status)) {
          throw new BadRequestException(
            `Delivery failure cannot be recorded from ${job.status}`
          );
        }

        const changed = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.DELIVERY_FAILED,
          actor,
          {
            expectedStatus: job.status,
            metadata: {
              failureReason: input.reason,
              failureNote: input.note,
              phase3Operation: true,
            },
          }
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "DELIVERY_FAILURE_RECORDED",
          actor,
          idempotencyKey: key,
          details: {
            reason: input.reason,
            note: input.note || null,
            fromStatus: job.status,
          },
        });
        const policy = decideFailureResolution(input.reason);
        const decision = await tx.deliveryFailureDecision.create({
          data: {
            deliveryJobId,
            orderId: job.orderId,
            failureOperationId: operation.id,
            reason: input.reason,
            recommendedAction: policy.action,
            decidedAction: policy.action,
            status: DeliveryResolutionStatus.DECIDED,
            policyVersion: FAILURE_POLICY_VERSION,
            rationale: policy.rationale,
          },
        });
        await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "FAILURE_RESOLUTION_DECIDED",
          actor: null,
          idempotencyKey: `failure-decision:${decision.id}`,
          details: {
            decisionId: decision.id,
            reason: input.reason,
            recommendedAction: policy.action,
            decidedAction: policy.action,
            policyVersion: FAILURE_POLICY_VERSION,
            rationale: policy.rationale,
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_FAILED",
          "Delivery attempt unsuccessful",
          `Order #${job.orderId
            .slice(-8)
            .toUpperCase()} could not be delivered: ${input.reason
            .replaceAll("_", " ")
            .toLowerCase()}.`,
          operation,
          { failureReason: input.reason }
        );
        return { operation, decision, job: changed };
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async resolveFailure(
    deliveryJobId: string,
    actor: Actor,
    input: ResolveDeliveryFailureDto,
    idempotencyKey?: string
  ) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        "Only an administrator can apply or override a failure resolution"
      );
    }
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-failure-resolution:${deliveryJobId}`);
        const key =
          idempotencyKey ||
          `failure-resolution:${deliveryJobId}:${randomUUID()}`;
        const existingOperation = await this.findOperationByKey(tx, key);
        if (existingOperation) {
          return {
            operation: existingOperation,
            decision: await tx.deliveryFailureDecision.findFirst({
              where: { deliveryJobId },
              orderBy: { createdAt: "desc" },
            }),
            job: await this.job(tx, deliveryJobId),
          };
        }
        const job = await this.job(tx, deliveryJobId);
        if (job.status !== DeliveryJobStatus.DELIVERY_FAILED) {
          throw new BadRequestException(
            "Failure resolution requires a failed delivery"
          );
        }
        const decision = await tx.deliveryFailureDecision.findFirst({
          where: {
            deliveryJobId,
            status: {
              in: [
                DeliveryResolutionStatus.DECIDED,
                DeliveryResolutionStatus.IN_PROGRESS,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
        });
        if (!decision)
          throw new NotFoundException(
            "No active failure resolution decision exists"
          );
        const action = (input.action ||
          decision.decidedAction) as DeliveryResolutionAction;
        const overridden = action !== decision.recommendedAction;
        if (overridden && !input.overrideReason) {
          throw new BadRequestException(
            "An override reason is required when changing the system recommendation"
          );
        }

        let changed: any = job;
        let resolutionStatus: DeliveryResolutionStatus =
          DeliveryResolutionStatus.COMPLETED;
        if (action === DeliveryResolutionAction.RETRY_DELIVERY) {
          changed = await this.workflow.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.OUT_FOR_DELIVERY,
            actor,
            {
              expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
              skipRoleCheck: true,
              metadata: { phase5FailureDecisionId: decision.id },
            }
          );
      } else if (action === DeliveryResolutionAction.REASSIGN_RIDER) {
          const ledger = await tx.codLedger.findUnique({
            where: { deliveryJobId },
          });
        if (ledger && ledger.riderHoldingBalancePaise > 0) {
            throw new BadRequestException(
              "A Rider holding COD cash cannot be reassigned until cash is reconciled"
            );
        }
        const assignment = await tx.dispatchAssignment.findFirst({
          where: { deliveryJobId, status: "ACCEPTED" },
          orderBy: { createdAt: "desc" },
        });
        if (assignment) {
          await tx.dispatchAssignment.update({
            where: { id: assignment.id },
            data: { status: "REASSIGNED", respondedAt: new Date() },
          });
          await tx.deliveryEvent.create({
            data: {
              deliveryJobId,
              assignmentId: assignment.id,
              eventType: "ASSIGNMENT_REASSIGNED",
              actorUserId: actor.id,
              actorRole: actor.role,
              metadata: { phase5FailureDecisionId: decision.id },
            },
          });
        }
        changed = await this.workflow.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.WAITING_FOR_DISPATCH,
            actor,
            {
              expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
              skipRoleCheck: true,
              metadata: { phase5FailureDecisionId: decision.id },
            }
          );
        } else if (action === DeliveryResolutionAction.RETURN_TO_STORE) {
          changed = await this.workflow.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.RETURNING_TO_STORE,
            actor,
            {
              expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
              skipRoleCheck: true,
              metadata: { phase5FailureDecisionId: decision.id },
            }
          );
          await this.createOperation(tx, {
            deliveryJobId,
            orderId: job.orderId,
            type: "RETURN_STARTED",
            actor,
            idempotencyKey: `return-start:decision:${decision.id}`,
            details: {
              decisionId: decision.id,
              startedAt: new Date().toISOString(),
            },
          });
        } else if (action === DeliveryResolutionAction.CANCEL_AND_REFUND) {
          const ledger = await tx.codLedger.findUnique({
            where: { deliveryJobId },
          });
          if (ledger && ledger.riderHoldingBalancePaise > 0) {
            throw new BadRequestException(
              "COD held by the Rider must be deposited or reconciled before cancellation"
            );
          }
          const payment = job.order.payment;
          if (
            payment?.method === PaymentMethod.ONLINE &&
            payment.status === PaymentStatus.CAPTURED
          ) {
            const existingRefund = await tx.refund.findFirst({
              where: {
                paymentId: payment.id,
                amountPaise: payment.amountPaise,
              },
            });
            if (!existingRefund) {
              await tx.refund.create({
                data: {
                  orderId: job.orderId,
                  paymentId: payment.id,
                  amountPaise: payment.amountPaise,
                  status: "PENDING",
                  reason: `Phase 5 failed-delivery resolution ${decision.id}`,
                  requestedByUserId: actor.id,
                },
              });
            }
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: PaymentStatus.REFUND_PENDING },
            });
          }
          changed = await this.workflow.transitionWithinTransaction(
            tx,
            deliveryJobId,
            DeliveryJobStatus.CANCELLED,
            actor,
            {
              expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
              skipRoleCheck: true,
              metadata: { phase5FailureDecisionId: decision.id },
            }
          );
        } else {
          resolutionStatus = DeliveryResolutionStatus.IN_PROGRESS;
        }

        const appliedAt = new Date();
        const updatedDecision = await tx.deliveryFailureDecision.update({
          where: { id: decision.id },
          data: {
            decidedAction: action,
            status: resolutionStatus,
            overriddenByUserId: overridden ? actor.id : null,
            overrideReason: overridden ? input.overrideReason : null,
            appliedByUserId: actor.id,
            appliedAt,
          },
        });
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "FAILURE_RESOLUTION_APPLIED",
          actor,
          idempotencyKey: key,
          details: {
            decisionId: decision.id,
            action,
            systemRecommendation: decision.recommendedAction,
            overridden,
            overrideReason: input.overrideReason || null,
            resolutionStatus,
            appliedAt: appliedAt.toISOString(),
          },
        });
        return { operation, decision: updatedDecision, job: changed };
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async startReturn(
    deliveryJobId: string,
    actor: Actor,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-return:${deliveryJobId}`);
        const key =
          idempotencyKey || `return-start:${deliveryJobId}:${randomUUID()}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing)
          return {
            operation: existing,
            job: await this.job(tx, deliveryJobId),
          };
        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.DELIVERY_FAILED) {
          throw new BadRequestException(
            "Only a failed delivery can start returning to store"
          );
        }
        const decision = await tx.deliveryFailureDecision.findFirst({
          where: {
            deliveryJobId,
            status: {
              in: [
                DeliveryResolutionStatus.DECIDED,
                DeliveryResolutionStatus.IN_PROGRESS,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
        });
        if (
          !decision ||
          decision.decidedAction !== DeliveryResolutionAction.RETURN_TO_STORE
        ) {
          throw new BadRequestException(
            `System resolution is ${
              decision?.decidedAction || "not available"
            }; return-to-store is not authorized`
          );
        }
        const changed = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.RETURNING_TO_STORE,
          actor,
          {
            expectedStatus: DeliveryJobStatus.DELIVERY_FAILED,
            metadata: { phase3Operation: true },
          }
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "RETURN_STARTED",
          actor,
          idempotencyKey: key,
          details: {
            startedAt: new Date().toISOString(),
            decisionId: decision.id,
          },
        });
        await tx.deliveryFailureDecision.update({
          where: { id: decision.id },
          data: {
            status: DeliveryResolutionStatus.COMPLETED,
            appliedByUserId: actor.id,
            appliedAt: new Date(),
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_FAILED",
          "Order returning to store",
          `Order #${job.orderId.slice(-8).toUpperCase()} is being returned to ${
            job.order.store.name
          }.`,
          operation
        );
        return { operation, job: changed };
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async confirmReturn(
    deliveryJobId: string,
    actor: Actor,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-return:${deliveryJobId}`);
        const key =
          idempotencyKey || `return-confirm:${deliveryJobId}:${randomUUID()}`;
        const existing = await this.findOperationByKey(tx, key);
        if (existing)
          return {
            operation: existing,
            job: await this.job(tx, deliveryJobId),
          };
        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.RETURNING_TO_STORE) {
          throw new BadRequestException(
            "The parcel must be returning to store before receipt is confirmed"
          );
        }
        const changed = await this.workflow.transitionWithinTransaction(
          tx,
          deliveryJobId,
          DeliveryJobStatus.RETURNED_TO_STORE,
          actor,
          {
            expectedStatus: DeliveryJobStatus.RETURNING_TO_STORE,
            skipRoleCheck: true,
            metadata: { phase3Operation: true, returnedConfirmedBy: actor.id },
          }
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "RETURN_CONFIRMED",
          actor,
          idempotencyKey: key,
          details: { confirmedAt: new Date().toISOString() },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_FAILED",
          "Returned parcel received",
          `${
            job.order.store.name
          } received the returned parcel for order #${job.orderId
            .slice(-8)
            .toUpperCase()}.`,
          operation
        );
        return { operation, job: changed };
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async inspectReturn(
    deliveryJobId: string,
    actor: Actor,
    input: ReturnInspectionDto,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `delivery-inspection:${deliveryJobId}`);
        const key = idempotencyKey || `return-inspection:${deliveryJobId}`;
        const existingByKey = await this.findOperationByKey(tx, key);
        if (existingByKey) return existingByKey;
        const prior = await this.latestOperation(
          tx,
          deliveryJobId,
          "RETURN_INSPECTION_COMPLETED",
          ["COMPLETED"]
        );
        if (prior)
          throw new ConflictException("Return inspection is already completed");

        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        if (job.status !== DeliveryJobStatus.RETURNED_TO_STORE) {
          throw new BadRequestException(
            "Return inspection requires a parcel confirmed at the store"
          );
        }

        const orderItems = job.order.items as Array<any>;
        const itemById = new Map(orderItems.map((item) => [item.id, item]));
        const grouped = new Map<
          string,
          { total: number; sellable: number; lines: any[] }
        >();
        for (const line of input.lines) {
          const item = itemById.get(line.orderItemId);
          if (!item)
            throw new BadRequestException(
              `Order item not found: ${line.orderItemId}`
            );
          const current = grouped.get(line.orderItemId) || {
            total: 0,
            sellable: 0,
            lines: [],
          };
          current.total += line.quantity;
          if (line.disposition === ReturnDisposition.SELLABLE)
            current.sellable += line.quantity;
          current.lines.push({
            ...line,
            productId: item.productId,
            productName: item.product?.name || null,
          });
          grouped.set(line.orderItemId, current);
        }

        if (grouped.size !== orderItems.length) {
          throw new BadRequestException(
            "Inspection must account for every ordered item"
          );
        }
        for (const item of orderItems) {
          const group = grouped.get(item.id);
          if (!group || group.total !== item.quantity) {
            throw new BadRequestException(
              `Inspection quantity for ${
                item.product?.name || item.id
              } must equal ${item.quantity}`
            );
          }
        }

        for (const item of orderItems) {
          const sellable = grouped.get(item.id)?.sellable || 0;
          if (sellable <= 0) continue;
          const existing = await tx.inventory.findUnique({
            where: {
              storeId_productId: {
                storeId: job.order.storeId,
                productId: item.productId,
              },
            },
          });
          const previousQuantity = existing?.quantity || 0;
          if (existing) {
            await tx.inventory.update({
              where: {
                storeId_productId: {
                  storeId: job.order.storeId,
                  productId: item.productId,
                },
              },
              data: { quantity: { increment: sellable } },
            });
          } else {
            await tx.inventory.create({
              data: {
                storeId: job.order.storeId,
                productId: item.productId,
                quantity: sellable,
              },
            });
          }
          await tx.inventoryLedger.create({
            data: {
              storeId: job.order.storeId,
              productId: item.productId,
              orderId: job.orderId,
              reason: "ORDER_CANCEL_RESTORE",
              quantityDelta: sellable,
              previousQuantity,
              newQuantity: previousQuantity + sellable,
              actorUserId: actor.id,
              note: `Returned delivery inspection restored ${sellable} sellable unit(s)`,
            },
          });
        }

        const lines = Array.from(grouped.values()).flatMap(
          (group) => group.lines
        );
        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "RETURN_INSPECTION_COMPLETED",
          actor,
          idempotencyKey: key,
          details: {
            lines,
            note: input.note || null,
            inspectedAt: new Date().toISOString(),
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_FAILED",
          "Return inspection completed",
          `The returned items for order #${job.orderId
            .slice(-8)
            .toUpperCase()} were inspected at ${job.order.store.name}.`,
          operation
        );
        return operation;
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  private async ensureCodLedger(tx: DbClient, job: any, actor: Actor) {
    const existing = await tx.codLedger.findUnique({
      where: { deliveryJobId: job.id },
      include: { entries: { orderBy: { createdAt: "asc" } } },
    });
    if (existing) return existing;
    const payment = job.order.payment;
    if (!payment || payment.method !== PaymentMethod.COD) {
      throw new BadRequestException("This order is not a COD order");
    }
    const ledger = await tx.codLedger.create({
      data: {
        deliveryJobId: job.id,
        orderId: job.orderId,
        riderId: job.currentRiderId,
        currency: payment.currency,
        expectedAmountPaise: payment.amountPaise,
      },
    });
    await tx.codLedgerEntry.create({
      data: {
        codLedgerId: ledger.id,
        type: CodLedgerEntryType.EXPECTED,
        amountPaise: payment.amountPaise,
        holdingAfterPaise: 0,
        depositedAfterPaise: 0,
        actorUserId: actor.id,
        actorRole: actor.role,
        idempotencyKey: `cod-expected:${job.id}`,
        metadata: { source: "ORDER_PAYMENT", paymentId: payment.id },
      },
    });
    return { ...ledger, entries: [] };
  }

  async collectCod(
    deliveryJobId: string,
    actor: Actor,
    input: CollectCodDto,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `cod-collection:${deliveryJobId}`);
        const key = idempotencyKey || `cod-collected:${deliveryJobId}`;
        const existingByKey = await this.findOperationByKey(tx, key);
        if (existingByKey) return existingByKey;
        const existingCollection = await this.latestOperation(
          tx,
          deliveryJobId,
          "COD_COLLECTED",
          ["COMPLETED"]
        );
        if (existingCollection) return existingCollection;

        const job = await this.job(tx, deliveryJobId);
        this.assertRiderOrAdmin(job, actor);
        if (
          ![
            DeliveryJobStatus.OUT_FOR_DELIVERY,
            DeliveryJobStatus.RIDER_AT_CUSTOMER,
          ].includes(job.status)
        ) {
          throw new BadRequestException(
            "COD can be collected only during customer delivery"
          );
        }
        const payment = job.order.payment;
        if (!payment || payment.method !== PaymentMethod.COD) {
          throw new BadRequestException("This order is not a COD order");
        }
        if (input.amountPaise !== payment.amountPaise) {
          throw new BadRequestException(
            `COD amount must equal ${payment.amountPaise} paise`
          );
        }
        if (
          payment.status !== PaymentStatus.PENDING_COD &&
          payment.status !== PaymentStatus.CAPTURED
        ) {
          throw new BadRequestException(
            `COD payment cannot be collected from status ${payment.status}`
          );
        }
        const ledger = await this.ensureCodLedger(tx, job, actor);
        if (ledger.collectedAmountPaise > 0) {
          throw new ConflictException(
            "COD collection is already recorded in the ledger"
          );
        }
        if (payment.status !== PaymentStatus.CAPTURED) {
          const changed = await tx.payment.updateMany({
            where: { id: payment.id, status: PaymentStatus.PENDING_COD },
            data: { status: PaymentStatus.CAPTURED, verifiedAt: new Date() },
          });
          if (changed.count !== 1)
            throw new ConflictException(
              "COD payment changed during collection"
            );
        }

        const collectedAt = new Date();
        const updatedLedger = await tx.codLedger.update({
          where: { id: ledger.id },
          data: {
            riderId: job.currentRiderId,
            collectedAmountPaise: input.amountPaise,
            collectionTimestamp: collectedAt,
            riderHoldingBalancePaise: input.amountPaise,
            variancePaise: 0,
            status: CodSettlementStatus.HELD_BY_RIDER,
          },
        });
        await tx.codLedgerEntry.create({
          data: {
            codLedgerId: ledger.id,
            type: CodLedgerEntryType.COLLECTED,
            amountPaise: input.amountPaise,
            holdingAfterPaise: input.amountPaise,
            depositedAfterPaise: 0,
            actorUserId: actor.id,
            actorRole: actor.role,
            reference: input.collectionReference,
            idempotencyKey: `cod-ledger-collection:${key}`,
            metadata: {
              collectedAt: collectedAt.toISOString(),
              paymentId: payment.id,
            },
          },
        });

        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "COD_COLLECTED",
          actor,
          idempotencyKey: key,
          details: {
            amountPaise: input.amountPaise,
            codLedgerId: ledger.id,
            currency: payment.currency,
            collectionReference: input.collectionReference || null,
            collectedAt: collectedAt.toISOString(),
            riderHoldingBalancePaise: updatedLedger.riderHoldingBalancePaise,
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_COMPLETED",
          "COD payment collected",
          `₹${(input.amountPaise / 100).toFixed(
            2
          )} was collected for order #${job.orderId.slice(-8).toUpperCase()}.`,
          operation,
          { amountPaise: input.amountPaise }
        );
        return operation;
      },
      { isolationLevel: "Serializable" as any }
    );
  }

  async settleCod(
    deliveryJobId: string,
    actor: Actor,
    input: SettleCodDto,
    idempotencyKey?: string
  ) {
    return prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `cod-settlement:${deliveryJobId}`);
        const key =
          idempotencyKey ||
          `cod-settled:${deliveryJobId}:${input.settlementReference}`;
        const existingByKey = await this.findOperationByKey(tx, key);
        if (existingByKey) return existingByKey;

        const job = await this.job(tx, deliveryJobId);
        this.assertStoreOrAdmin(job, actor);
        const payment = job.order.payment;
        if (!payment || payment.method !== PaymentMethod.COD) {
          throw new BadRequestException("This order is not a COD order");
        }
        if (payment.status !== PaymentStatus.CAPTURED) {
          throw new BadRequestException(
            "COD must be collected before settlement"
          );
        }
        const collection = await this.latestOperation(
          tx,
          deliveryJobId,
          "COD_COLLECTED",
          ["COMPLETED"]
        );
        if (!collection)
          throw new BadRequestException("COD collection record is missing");
        const ledger = await tx.codLedger.findUnique({
          where: { deliveryJobId },
        });
        if (!ledger) throw new BadRequestException("COD ledger is missing");
        if (
          ledger.status === CodSettlementStatus.SETTLED ||
          ledger.status === CodSettlementStatus.VARIANCE_REVIEW
        ) {
          throw new ConflictException("COD ledger is already finalized");
        }
        if (input.amountPaise > ledger.riderHoldingBalancePaise) {
          throw new BadRequestException(
            `Deposit cannot exceed Rider holding balance of ${ledger.riderHoldingBalancePaise} paise`
          );
        }
        const depositedAmountPaise =
          ledger.depositedAmountPaise + input.amountPaise;
        const riderHoldingBalancePaise =
          ledger.riderHoldingBalancePaise - input.amountPaise;
        const variancePaise = ledger.expectedAmountPaise - depositedAmountPaise;
        if (input.finalize && variancePaise !== 0 && !input.varianceReason) {
          throw new BadRequestException(
            "A variance reason is required to finalize a non-zero COD variance"
          );
        }
        const status = input.finalize
          ? variancePaise === 0
            ? CodSettlementStatus.SETTLED
            : CodSettlementStatus.VARIANCE_REVIEW
          : riderHoldingBalancePaise === 0
          ? CodSettlementStatus.SETTLED
          : CodSettlementStatus.PARTIALLY_DEPOSITED;
        const settledAt = new Date();
        const updatedLedger = await tx.codLedger.update({
          where: { id: ledger.id },
          data: {
            depositedAmountPaise,
            riderHoldingBalancePaise,
            settlementReference: input.settlementReference,
            variancePaise: input.finalize ? variancePaise : 0,
            varianceReason: input.finalize ? input.varianceReason : null,
            status,
          },
        });
        await tx.codLedgerEntry.create({
          data: {
            codLedgerId: ledger.id,
            type: CodLedgerEntryType.DEPOSITED,
            amountPaise: input.amountPaise,
            holdingAfterPaise: riderHoldingBalancePaise,
            depositedAfterPaise: depositedAmountPaise,
            actorUserId: actor.id,
            actorRole: actor.role,
            reference: input.settlementReference,
            idempotencyKey: `cod-ledger-deposit:${key}`,
            metadata: {
              note: input.note || null,
              finalized: Boolean(input.finalize),
            },
          },
        });
        if (input.finalize && variancePaise !== 0) {
          await tx.codLedgerEntry.create({
            data: {
              codLedgerId: ledger.id,
              type: CodLedgerEntryType.VARIANCE_RECORDED,
              amountPaise: Math.abs(variancePaise),
              holdingAfterPaise: riderHoldingBalancePaise,
              depositedAfterPaise: depositedAmountPaise,
              actorUserId: actor.id,
              actorRole: actor.role,
              reference: input.settlementReference,
              idempotencyKey: `cod-ledger-variance:${key}`,
              metadata: { variancePaise, varianceReason: input.varianceReason },
            },
          });
          await this.createOperation(tx, {
            deliveryJobId,
            orderId: job.orderId,
            type: "COD_VARIANCE_RECORDED",
            actor,
            idempotencyKey: `cod-variance:${key}`,
            details: {
              codLedgerId: ledger.id,
              variancePaise,
              varianceReason: input.varianceReason,
              settlementReference: input.settlementReference,
            },
          });
        }

        const operation = await this.createOperation(tx, {
          deliveryJobId,
          orderId: job.orderId,
          type: "COD_SETTLED",
          actor,
          idempotencyKey: key,
          details: {
            amountPaise: input.amountPaise,
            codLedgerId: ledger.id,
            currency: payment.currency,
            settlementReference: input.settlementReference,
            note: input.note || null,
            collectionOperationId: collection.id,
            settledAt: settledAt.toISOString(),
            finalized: Boolean(input.finalize),
            depositedAmountPaise: updatedLedger.depositedAmountPaise,
            riderHoldingBalancePaise: updatedLedger.riderHoldingBalancePaise,
            variancePaise: updatedLedger.variancePaise,
            settlementStatus: updatedLedger.status,
          },
        });
        await this.notify(
          tx,
          job,
          actor,
          "DELIVERY_COMPLETED",
          "COD settlement recorded",
          `COD settlement for order #${job.orderId
            .slice(-8)
            .toUpperCase()} was recorded.`,
          operation,
          {
            amountPaise: input.amountPaise,
            settlementReference: input.settlementReference,
          }
        );
        return operation;
      },
      { isolationLevel: "Serializable" as any }
    );
  }
}

export { DeliveryFailureReason, ReturnDisposition };
