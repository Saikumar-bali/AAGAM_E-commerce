/**
 * Shared helpers for the delivery-operations services.
 *
 * Split out of the former delivery-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CodLedgerEntryType, DeliveryResolutionStatus, PaymentMethod, PickupVerificationMethod, Prisma, Role } from "@aagam/database";
import { NotificationEventTypeType } from "@aagam/types";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { Actor, DbClient, DeliveryOperationRow, DeliveryOperationType, DeliveryOperationStatus, OperationInput, OTP_MAX_ATTEMPTS } from "./delivery-operations.types";
import { DeliveryWorkflowService } from "./delivery-workflow.service";
import { OutboxService } from "../notifications/outbox.service";
import { SubscriptionCashFundingService } from "../subscriptions/subscription-cash-funding.service";

export abstract class DeliveryOperationsBase {
  constructor(
    protected readonly workflow: DeliveryWorkflowService,
    protected readonly outbox: OutboxService,
    protected readonly subscriptionFunding: SubscriptionCashFundingService
  ) {}

  protected async ensureCodLedger(tx: DbClient, job: any, actor: Actor) {
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

  protected enabled(name: string) {
    return (
      String(process.env[name] || "")
        .trim()
        .toLowerCase() === "true"
    );
  }

  protected otpSecret() {
    const configured = String(process.env.DELIVERY_OTP_SECRET || "").trim();
    if (configured) return configured;
    if (process.env.NODE_ENV === "production") {
      throw new Error("DELIVERY_OTP_SECRET is required in production");
    }
    return "aagam-local-development-delivery-otp-secret";
  }

  protected otpCode(deliveryJobId: string, nonce: string) {
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

  protected otpHash(code: string, salt: string) {
    return createHash("sha256").update(`${salt}:${code}`).digest("hex");
  }

  protected pickupCode(method: PickupVerificationMethod) {
    if (method === PickupVerificationMethod.STORE_PICKUP_PIN) {
      // Use unbiased random number generation to avoid cryptographic bias
      const max = 1_000_000;
      const bytes = randomBytes(4);
      // Rejection sampling to avoid modulo bias
      let value = bytes.readUInt32BE(0);
      const limit = Math.floor(0x100000000 / max) * max;
      while (value >= limit) {
        value = randomBytes(4).readUInt32BE(0);
      }
      return String(value % max).padStart(
        6,
        "0"
      );
    }
    return `AAGAM-PICKUP-${randomBytes(24).toString("base64url")}`;
  }

  protected pickupHash(code: string, salt: string) {
    return createHash("sha256")
      .update(`${salt}:${String(code).trim()}`)
      .digest("hex");
  }

  protected assertCoordinates(latitude?: number, longitude?: number) {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException(
        "Latitude and longitude must be provided together"
      );
    }
  }

  protected async queryRows<T>(tx: DbClient, query: Prisma.Sql): Promise<T[]> {
    return (await tx.$queryRaw(query)) as T[];
  }

  protected async lock(tx: DbClient, key: string) {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS "lock"
    `);
  }

  protected async findOperationByKey(tx: DbClient, idempotencyKey: string) {
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

  protected async createOperation(tx: DbClient, input: OperationInput) {
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

  protected async updateOperationStatus(
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

  protected listOperations(tx: DbClient, deliveryJobId: string) {
    return this.queryRows<DeliveryOperationRow>(
      tx,
      Prisma.sql`
      SELECT * FROM "DeliveryOperation"
      WHERE "deliveryJobId" = ${deliveryJobId}
      ORDER BY "createdAt" DESC, "id" DESC
    `
    );
  }

  protected publicOperation(operation: DeliveryOperationRow) {
    if (operation.type !== "OTP_ISSUED") return operation;
    const details = { ...(operation.details || {}) };
    delete details.nonce;
    delete details.salt;
    delete details.codeHash;
    return { ...operation, details };
  }

  protected async latestOperation(
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

  protected async job(tx: DbClient, deliveryJobId: string) {
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
            subscription: { select: { id: true, deliveryMethod: true, dropPointTokenHash: true } },
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

  protected assertRiderOrAdmin(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role !== Role.RIDER || job.currentRider?.userId !== actor.id) {
      throw new ForbiddenException(
        "Only the assigned rider or an administrator can perform this action"
      );
    }
  }

  protected assertStoreOrAdmin(job: any, actor: Actor) {
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

  protected assertCustomerOrAdmin(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role !== Role.CUSTOMER || job.order.customerId !== actor.id) {
      throw new ForbiddenException(
        "Only the order customer can access this handoff code"
      );
    }
  }

  /**
   * Reconciles a subscription occurrence after a delivery job completed through
   * the plain order flow. Never fails the already-completed delivery: any
   * reconciliation problem is recorded as a subscription audit entry so it
   * surfaces in subscription reporting instead of blocking delivery.
   */
  protected async reconcileSubscriptionAfterDelivery(tx: DbClient, job: any, actor: Actor) {
    const deliveryId = job.order?.subscriptionDeliveryId;
    if (!deliveryId) return;
    const delivery = await tx.subscriptionDelivery.findUnique({
      where: { deliveryJobId: job.id },
      select: { id: true, subscriptionId: true },
    });
    if (!delivery) return;
    try {
      await this.subscriptionFunding.reconcileDeliveredWithinTransaction(tx, job, actor);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await tx.subscriptionAuditEntry
        .create({
          data: {
            subscriptionId: delivery.subscriptionId,
            actorUserId: actor.id,
            actorRole: actor.role,
            action: "SUBSCRIPTION_RECONCILIATION_FAILED",
            reason: `Reconciliation after order delivery failed: ${message}`,
            metadata: { subscriptionDeliveryId: delivery.id, deliveryJobId: job.id },
            idempotencyKey: `reconcile-failed:${delivery.id}:${job.id}`,
          },
        })
        .catch(() => undefined);
    }
  }

  protected async notify(
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

  protected async verifyOtpWithinTransaction(
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

  protected async completeActiveFailureDecisions(
    tx: Prisma.TransactionClient,
    deliveryJobId: string,
    actor: Actor
  ) {
    await tx.deliveryFailureDecision.updateMany({
      where: { deliveryJobId, status: DeliveryResolutionStatus.IN_PROGRESS },
      data: {
        status: DeliveryResolutionStatus.COMPLETED,
        appliedByUserId: actor.id,
        appliedAt: new Date(),
      },
    });
  }

}
