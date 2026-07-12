import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  TooManyRequestsException,
} from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  prisma,
} from '@aagam/database';
import { DeliveryJobStatus, NotificationEventTypeType } from '@aagam/types';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import { OutboxService } from '../notifications/outbox.service';
import {
  CollectCodDto,
  CompleteDeliveryOperationDto,
  DeliveryFailureReason,
  RecordDeliveryFailureDto,
  ReturnDisposition,
  ReturnInspectionDto,
  SettleCodDto,
} from './delivery-operations.dto';
import { DeliveryWorkflowService } from './delivery-workflow.service';

type DbClient = typeof prisma | any;
type Actor = { id: string; role: Role };

type DeliveryOperationType =
  | 'OTP_ISSUED'
  | 'OTP_ATTEMPT_FAILED'
  | 'OTP_VERIFIED'
  | 'DELIVERY_FAILURE_RECORDED'
  | 'RETURN_STARTED'
  | 'RETURN_CONFIRMED'
  | 'RETURN_INSPECTION_COMPLETED'
  | 'COD_COLLECTED'
  | 'COD_SETTLED';

type DeliveryOperationStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'SUPERSEDED';

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

const FAILURE_STATUSES = new Set([
  DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE,
  DeliveryJobStatus.RIDER_AT_STORE,
  DeliveryJobStatus.OUT_FOR_DELIVERY,
  DeliveryJobStatus.RIDER_AT_CUSTOMER,
]);

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class DeliveryOperationsService {
  constructor(
    private readonly workflow: DeliveryWorkflowService,
    private readonly outbox: OutboxService,
  ) {}

  private enabled(name: string) {
    return String(process.env[name] || '').trim().toLowerCase() === 'true';
  }

  private otpSecret() {
    const configured = String(process.env.DELIVERY_OTP_SECRET || '').trim();
    if (configured) return configured;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DELIVERY_OTP_SECRET is required in production');
    }
    return 'aagam-local-development-delivery-otp-secret';
  }

  private otpCode(deliveryJobId: string, nonce: string) {
    const digest = createHmac('sha256', this.otpSecret())
      .update(`${deliveryJobId}:${nonce}`)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
  }

  private otpHash(code: string, salt: string) {
    return createHash('sha256').update(`${salt}:${code}`).digest('hex');
  }

  private async lock(tx: DbClient, key: string) {
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${key}))::text AS "lock"
    `);
  }

  private async findOperationByKey(tx: DbClient, idempotencyKey: string) {
    const rows = await tx.$queryRaw<DeliveryOperationRow[]>(Prisma.sql`
      SELECT *
      FROM "DeliveryOperation"
      WHERE "idempotencyKey" = ${idempotencyKey}
      LIMIT 1
    `);
    return rows[0] || null;
  }

  private async createOperation(tx: DbClient, input: OperationInput) {
    const existing = await this.findOperationByKey(tx, input.idempotencyKey);
    if (existing) return existing;

    const id = `dop_${randomUUID()}`;
    const details = JSON.stringify(input.details || {});
    const rows = await tx.$queryRaw<DeliveryOperationRow[]>(Prisma.sql`
      INSERT INTO "DeliveryOperation" (
        "id", "deliveryJobId", "orderId", "type", "status",
        "actorUserId", "actorRole", "idempotencyKey", "details",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id},
        ${input.deliveryJobId},
        ${input.orderId},
        ${input.type}::"DeliveryOperationType",
        ${(input.status || 'COMPLETED')}::"DeliveryOperationStatus",
        ${input.actor?.id || null},
        ${input.actor?.role || null}::"Role",
        ${input.idempotencyKey},
        ${details}::jsonb,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("idempotencyKey") DO NOTHING
      RETURNING *
    `);
    if (rows[0]) return rows[0];
    const raced = await this.findOperationByKey(tx, input.idempotencyKey);
    if (!raced) throw new ConflictException('Delivery operation could not be recorded');
    return raced;
  }

  private async updateOperationStatus(
    tx: DbClient,
    id: string,
    status: DeliveryOperationStatus,
    detailsPatch?: Record<string, unknown>,
  ) {
    const patch = JSON.stringify(detailsPatch || {});
    const rows = await tx.$queryRaw<DeliveryOperationRow[]>(Prisma.sql`
      UPDATE "DeliveryOperation"
      SET "status" = ${status}::"DeliveryOperationStatus",
          "details" = "details" || ${patch}::jsonb,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
      RETURNING *
    `);
    return rows[0] || null;
  }

  private async listOperations(tx: DbClient, deliveryJobId: string) {
    return tx.$queryRaw<DeliveryOperationRow[]>(Prisma.sql`
      SELECT *
      FROM "DeliveryOperation"
      WHERE "deliveryJobId" = ${deliveryJobId}
      ORDER BY "createdAt" DESC, "id" DESC
    `);
  }

  private async latestOperation(
    tx: DbClient,
    deliveryJobId: string,
    type: DeliveryOperationType,
    statuses?: DeliveryOperationStatus[],
  ) {
    const statusFilter = statuses?.length
      ? Prisma.sql`AND "status"::text IN (${Prisma.join(statuses)})`
      : Prisma.empty;
    const rows = await tx.$queryRaw<DeliveryOperationRow[]>(Prisma.sql`
      SELECT *
      FROM "DeliveryOperation"
      WHERE "deliveryJobId" = ${deliveryJobId}
        AND "type" = ${type}::"DeliveryOperationType"
        ${statusFilter}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT 1
    `);
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
      },
    });
    if (!job) throw new NotFoundException('Delivery job not found');
    return job;
  }

  private assertRiderOrAdmin(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role !== Role.RIDER || job.currentRider?.userId !== actor.id) {
      throw new ForbiddenException('Only the assigned rider or an administrator can perform this action');
    }
  }

  private assertStoreOrAdmin(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role !== Role.STORE_OWNER || job.order.store.ownerId !== actor.id) {
      throw new ForbiddenException('Only the owning store or an administrator can perform this action');
    }
  }

  private assertCustomerOrAdmin(job: any, actor: Actor) {
    if (actor.role === Role.ADMIN) return;
    if (actor.role !== Role.CUSTOMER || job.order.customerId !== actor.id) {
      throw new ForbiddenException('Only the order customer can access this handoff code');
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
    metadata: Record<string, unknown> = {},
  ) {
    await this.outbox.enqueue({
      eventType,
      aggregateType: 'DELIVERY_JOB',
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
    }, tx);
  }

  async getSummary(deliveryJobId: string, actor: Actor) {
    const job = await this.job(prisma, deliveryJobId);
    if (actor.role === Role.RIDER) this.assertRiderOrAdmin(job, actor);
    else if (actor.role === Role.STORE_OWNER) this.assertStoreOrAdmin(job, actor);
    else if (actor.role === Role.CUSTOMER) this.assertCustomerOrAdmin(job, actor);
    else if (actor.role !== Role.ADMIN) throw new ForbiddenException('Role cannot access delivery operations');

    const operations = await this.listOperations(prisma, deliveryJobId);
    const activeOtp = operations.find((operation) => operation.type === 'OTP_ISSUED' && operation.status === 'PENDING');
    const codCollected = operations.find((operation) => operation.type === 'COD_COLLECTED' && operation.status === 'COMPLETED');
    const codSettled = operations.find((operation) => operation.type === 'COD_SETTLED' && operation.status === 'COMPLETED');
    const inspection = operations.find((operation) => operation.type === 'RETURN_INSPECTION_COMPLETED' && operation.status === 'COMPLETED');

    return {
      job,
      operations,
      requirements: {
        deliveryOtpRequired: this.enabled('DELIVERY_OTP_REQUIRED'),
        codCollectionRequired: this.enabled('COD_COLLECTION_REQUIRED'),
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
        expectedAmountPaise: job.order.payment?.amountPaise || job.order.grandTotalPaise,
        collected: Boolean(codCollected),
        settled: Boolean(codSettled),
      },
      returnInspection: inspection || null,
    };
  }

  async getQueue(actor: Actor) {
    if (![Role.ADMIN, Role.STORE_OWNER].includes(actor.role)) {
      throw new ForbiddenException('Only admin and store owners can view the delivery operations queue');
    }
    const storeFilter = actor.role === Role.STORE_OWNER
      ? { order: { store: { ownerId: actor.id } } }
      : {};
    const jobs = await prisma.deliveryJob.findMany({
      where: {
        ...storeFilter,
        OR: [
          { status: { in: ['DELIVERY_FAILED', 'RETURNING_TO_STORE', 'RETURNED_TO_STORE'] as any } },
          { order: { payment: { is: { method: PaymentMethod.COD, status: { in: [PaymentStatus.PENDING_COD, PaymentStatus.CAPTURED] } } } } },
        ],
      } as any,
      include: {
        currentRider: { include: { user: { select: { id: true, name: true, email: true } } } },
        order: {
          include: {
            customer: { select: { id: true, name: true, email: true } },
            store: { select: { id: true, name: true, ownerId: true } },
            payment: true,
            items: { include: { product: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    return Promise.all(jobs.map(async (job) => ({
      ...job,
      operations: await this.listOperations(prisma, job.id),
    })));
  }

  async issueOtp(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    const result = await prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-otp:${deliveryJobId}`);
      const job = await this.job(tx, deliveryJobId);
      this.assertRiderOrAdmin(job, actor);
      if (job.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
        throw new BadRequestException('Delivery OTP can be issued only after the rider arrives at the customer');
      }

      await tx.$executeRaw(Prisma.sql`
        UPDATE "DeliveryOperation"
        SET "status" = 'SUPERSEDED'::"DeliveryOperationStatus",
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "deliveryJobId" = ${deliveryJobId}
          AND "type" = 'OTP_ISSUED'::"DeliveryOperationType"
          AND "status" = 'PENDING'::"DeliveryOperationStatus"
      `);

      const nonce = randomBytes(24).toString('hex');
      const salt = randomBytes(16).toString('hex');
      const code = this.otpCode(deliveryJobId, nonce);
      const expiresAt = new Date(Date.now() + OTP_TTL_MS);
      const operation = await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: 'OTP_ISSUED',
        status: 'PENDING',
        actor,
        idempotencyKey: idempotencyKey || `otp-issued:${deliveryJobId}:${randomUUID()}`,
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
        'RIDER_AT_CUSTOMER',
        'Delivery verification code ready',
        `Your verification code for order #${job.orderId.slice(-8).toUpperCase()} is ready in the order screen.`,
        operation,
      );
      return { operation, expiresAt };
    }, { isolationLevel: 'Serializable' as any });

    return {
      issued: true,
      operationId: result.operation.id,
      expiresAt: result.expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
    };
  }

  async getCustomerOtp(deliveryJobId: string, actor: Actor) {
    const job = await this.job(prisma, deliveryJobId);
    this.assertCustomerOrAdmin(job, actor);
    const issue = await this.latestOperation(prisma, deliveryJobId, 'OTP_ISSUED', ['PENDING']);
    if (!issue) throw new NotFoundException('No active delivery OTP exists');
    const expiresAt = new Date(String(issue.details?.expiresAt));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Delivery OTP expired. Ask the rider to issue a new code.');
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
    code: string,
  ): Promise<{ ok: true; operation: DeliveryOperationRow } | { ok: false; reason: string; attempts: number }> {
    const issue = await this.latestOperation(tx, job.id, 'OTP_ISSUED', ['PENDING']);
    if (!issue) return { ok: false, reason: 'No active delivery OTP exists', attempts: 0 };

    const expiresAt = new Date(String(issue.details?.expiresAt));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      await this.updateOperationStatus(tx, issue.id, 'FAILED', { expiredAt: new Date().toISOString() });
      return { ok: false, reason: 'Delivery OTP expired', attempts: OTP_MAX_ATTEMPTS };
    }

    const failedRows = await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "DeliveryOperation"
      WHERE "deliveryJobId" = ${job.id}
        AND "type" = 'OTP_ATTEMPT_FAILED'::"DeliveryOperationType"
        AND "details"->>'otpIssueId' = ${issue.id}
    `);
    const attempts = Number(failedRows[0]?.count || 0);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      return { ok: false, reason: 'Delivery OTP attempt limit reached', attempts };
    }

    const suppliedHash = this.otpHash(String(code || '').trim(), String(issue.details?.salt || ''));
    const expectedHash = String(issue.details?.codeHash || '');
    const valid = expectedHash.length === suppliedHash.length && timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(suppliedHash, 'hex'),
    );

    if (!valid) {
      const nextAttempts = attempts + 1;
      await this.createOperation(tx, {
        deliveryJobId: job.id,
        orderId: job.orderId,
        type: 'OTP_ATTEMPT_FAILED',
        status: 'FAILED',
        actor,
        idempotencyKey: `otp-failed:${issue.id}:${nextAttempts}`,
        details: { otpIssueId: issue.id, attemptNumber: nextAttempts },
      });
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        await this.updateOperationStatus(tx, issue.id, 'FAILED', { attemptLimitReachedAt: new Date().toISOString() });
      }
      return { ok: false, reason: 'Delivery OTP is incorrect', attempts: nextAttempts };
    }

    const verified = await this.createOperation(tx, {
      deliveryJobId: job.id,
      orderId: job.orderId,
      type: 'OTP_VERIFIED',
      actor,
      idempotencyKey: `otp-verified:${issue.id}`,
      details: { otpIssueId: issue.id, verifiedAt: new Date().toISOString() },
    });
    await this.updateOperationStatus(tx, issue.id, 'COMPLETED', { verifiedOperationId: verified.id });
    return { ok: true, operation: verified };
  }

  async completeDelivery(
    deliveryJobId: string,
    actor: Actor,
    input: CompleteDeliveryOperationDto,
    idempotencyKey?: string,
  ) {
    const outcome = await prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-complete:${deliveryJobId}`);
      const job = await this.job(tx, deliveryJobId);
      this.assertRiderOrAdmin(job, actor);
      if (job.status === DeliveryJobStatus.DELIVERED) return { job };
      if (job.status !== DeliveryJobStatus.RIDER_AT_CUSTOMER) {
        throw new BadRequestException('Rider must arrive at the customer before completing delivery');
      }

      const otpRequired = this.enabled('DELIVERY_OTP_REQUIRED');
      if (otpRequired && !input.otpCode) {
        throw new BadRequestException('Delivery OTP is required');
      }
      if (input.otpCode) {
        const verified = await this.verifyOtpWithinTransaction(tx, job, actor, input.otpCode);
        if (!verified.ok) return { otpError: verified };
      }

      const payment = job.order.payment;
      if (
        payment?.method === PaymentMethod.COD &&
        this.enabled('COD_COLLECTION_REQUIRED') &&
        payment.status !== PaymentStatus.CAPTURED
      ) {
        throw new BadRequestException('Collect the full COD amount before completing delivery');
      }

      const delivered = await this.workflow.transitionWithinTransaction(
        tx,
        deliveryJobId,
        DeliveryJobStatus.DELIVERED,
        actor,
        {
          expectedStatus: DeliveryJobStatus.RIDER_AT_CUSTOMER,
          metadata: {
            phase3Operation: true,
            proofType: input.proofType || 'OTP_OR_RIDER_CONFIRMATION',
            note: input.note,
            completionIdempotencyKey: idempotencyKey || null,
          },
        },
      );
      return { job: delivered };
    }, { isolationLevel: 'Serializable' as any });

    if ('otpError' in outcome && outcome.otpError) {
      if (outcome.otpError.attempts >= OTP_MAX_ATTEMPTS) {
        throw new TooManyRequestsException(outcome.otpError.reason);
      }
      throw new BadRequestException(outcome.otpError.reason);
    }
    return outcome.job;
  }

  async recordFailure(
    deliveryJobId: string,
    actor: Actor,
    input: RecordDeliveryFailureDto,
    idempotencyKey?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-failure:${deliveryJobId}`);
      const key = idempotencyKey || `delivery-failure:${deliveryJobId}:${randomUUID()}`;
      const existing = await this.findOperationByKey(tx, key);
      if (existing) return { operation: existing, job: await this.job(tx, deliveryJobId) };

      const job = await this.job(tx, deliveryJobId);
      this.assertRiderOrAdmin(job, actor);
      if (!FAILURE_STATUSES.has(job.status)) {
        throw new BadRequestException(`Delivery failure cannot be recorded from ${job.status}`);
      }

      const changed = await this.workflow.transitionWithinTransaction(
        tx,
        deliveryJobId,
        DeliveryJobStatus.DELIVERY_FAILED,
        actor,
        {
          expectedStatus: job.status,
          metadata: { failureReason: input.reason, failureNote: input.note, phase3Operation: true },
        },
      );
      const operation = await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: 'DELIVERY_FAILURE_RECORDED',
        actor,
        idempotencyKey: key,
        details: { reason: input.reason, note: input.note || null, fromStatus: job.status },
      });
      await this.notify(
        tx,
        job,
        actor,
        'DELIVERY_FAILED',
        'Delivery attempt unsuccessful',
        `Order #${job.orderId.slice(-8).toUpperCase()} could not be delivered: ${input.reason.replaceAll('_', ' ').toLowerCase()}.`,
        operation,
        { failureReason: input.reason },
      );
      return { operation, job: changed };
    }, { isolationLevel: 'Serializable' as any });
  }

  async startReturn(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-return:${deliveryJobId}`);
      const key = idempotencyKey || `return-start:${deliveryJobId}:${randomUUID()}`;
      const existing = await this.findOperationByKey(tx, key);
      if (existing) return { operation: existing, job: await this.job(tx, deliveryJobId) };
      const job = await this.job(tx, deliveryJobId);
      this.assertRiderOrAdmin(job, actor);
      if (job.status !== DeliveryJobStatus.DELIVERY_FAILED) {
        throw new BadRequestException('Only a failed delivery can start returning to store');
      }
      const changed = await this.workflow.transitionWithinTransaction(
        tx,
        deliveryJobId,
        DeliveryJobStatus.RETURNING_TO_STORE,
        actor,
        { expectedStatus: DeliveryJobStatus.DELIVERY_FAILED, metadata: { phase3Operation: true } },
      );
      const operation = await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: 'RETURN_STARTED',
        actor,
        idempotencyKey: key,
        details: { startedAt: new Date().toISOString() },
      });
      await this.notify(
        tx,
        job,
        actor,
        'DELIVERY_FAILED',
        'Order returning to store',
        `Order #${job.orderId.slice(-8).toUpperCase()} is being returned to ${job.order.store.name}.`,
        operation,
      );
      return { operation, job: changed };
    }, { isolationLevel: 'Serializable' as any });
  }

  async confirmReturn(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-return:${deliveryJobId}`);
      const key = idempotencyKey || `return-confirm:${deliveryJobId}:${randomUUID()}`;
      const existing = await this.findOperationByKey(tx, key);
      if (existing) return { operation: existing, job: await this.job(tx, deliveryJobId) };
      const job = await this.job(tx, deliveryJobId);
      this.assertStoreOrAdmin(job, actor);
      if (job.status !== DeliveryJobStatus.RETURNING_TO_STORE) {
        throw new BadRequestException('The parcel must be returning to store before receipt is confirmed');
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
        },
      );
      const operation = await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: 'RETURN_CONFIRMED',
        actor,
        idempotencyKey: key,
        details: { confirmedAt: new Date().toISOString() },
      });
      await this.notify(
        tx,
        job,
        actor,
        'DELIVERY_FAILED',
        'Returned parcel received',
        `${job.order.store.name} received the returned parcel for order #${job.orderId.slice(-8).toUpperCase()}.`,
        operation,
      );
      return { operation, job: changed };
    }, { isolationLevel: 'Serializable' as any });
  }

  async inspectReturn(
    deliveryJobId: string,
    actor: Actor,
    input: ReturnInspectionDto,
    idempotencyKey?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await this.lock(tx, `delivery-inspection:${deliveryJobId}`);
      const key = idempotencyKey || `return-inspection:${deliveryJobId}`;
      const existingByKey = await this.findOperationByKey(tx, key);
      if (existingByKey) return existingByKey;
      const prior = await this.latestOperation(tx, deliveryJobId, 'RETURN_INSPECTION_COMPLETED', ['COMPLETED']);
      if (prior) throw new ConflictException('Return inspection is already completed');

      const job = await this.job(tx, deliveryJobId);
      this.assertStoreOrAdmin(job, actor);
      if (job.status !== DeliveryJobStatus.RETURNED_TO_STORE) {
        throw new BadRequestException('Return inspection requires a parcel confirmed at the store');
      }

      const orderItems = job.order.items as Array<any>;
      const itemById = new Map(orderItems.map((item) => [item.id, item]));
      const grouped = new Map<string, { total: number; sellable: number; lines: any[] }>();
      for (const line of input.lines) {
        const item = itemById.get(line.orderItemId);
        if (!item) throw new BadRequestException(`Order item not found: ${line.orderItemId}`);
        const current = grouped.get(line.orderItemId) || { total: 0, sellable: 0, lines: [] };
        current.total += line.quantity;
        if (line.disposition === ReturnDisposition.SELLABLE) current.sellable += line.quantity;
        current.lines.push({ ...line, productId: item.productId, productName: item.product?.name || null });
        grouped.set(line.orderItemId, current);
      }

      if (grouped.size !== orderItems.length) {
        throw new BadRequestException('Inspection must account for every ordered item');
      }
      for (const item of orderItems) {
        const group = grouped.get(item.id);
        if (!group || group.total !== item.quantity) {
          throw new BadRequestException(`Inspection quantity for ${item.product?.name || item.id} must equal ${item.quantity}`);
        }
      }

      for (const item of orderItems) {
        const sellable = grouped.get(item.id)?.sellable || 0;
        if (sellable <= 0) continue;
        const existing = await tx.inventory.findUnique({
          where: { storeId_productId: { storeId: job.order.storeId, productId: item.productId } },
        });
        const previousQuantity = existing?.quantity || 0;
        if (existing) {
          await tx.inventory.update({
            where: { storeId_productId: { storeId: job.order.storeId, productId: item.productId } },
            data: { quantity: { increment: sellable } },
          });
        } else {
          await tx.inventory.create({
            data: { storeId: job.order.storeId, productId: item.productId, quantity: sellable },
          });
        }
        await tx.inventoryLedger.create({
          data: {
            storeId: job.order.storeId,
            productId: item.productId,
            orderId: job.orderId,
            reason: 'ORDER_CANCEL_RESTORE',
            quantityDelta: sellable,
            previousQuantity,
            newQuantity: previousQuantity + sellable,
            actorUserId: actor.id,
            note: `Returned delivery inspection restored ${sellable} sellable unit(s)`,
          },
        });
      }

      const lines = Array.from(grouped.values()).flatMap((group) => group.lines);
      const operation = await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: 'RETURN_INSPECTION_COMPLETED',
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
        'DELIVERY_FAILED',
        'Return inspection completed',
        `The returned items for order #${job.orderId.slice(-8).toUpperCase()} were inspected at ${job.order.store.name}.`,
        operation,
      );
      return operation;
    }, { isolationLevel: 'Serializable' as any });
  }

  async collectCod(
    deliveryJobId: string,
    actor: Actor,
    input: CollectCodDto,
    idempotencyKey?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await this.lock(tx, `cod-collection:${deliveryJobId}`);
      const key = idempotencyKey || `cod-collected:${deliveryJobId}`;
      const existingByKey = await this.findOperationByKey(tx, key);
      if (existingByKey) return existingByKey;
      const existingCollection = await this.latestOperation(tx, deliveryJobId, 'COD_COLLECTED', ['COMPLETED']);
      if (existingCollection) return existingCollection;

      const job = await this.job(tx, deliveryJobId);
      this.assertRiderOrAdmin(job, actor);
      if (![DeliveryJobStatus.OUT_FOR_DELIVERY, DeliveryJobStatus.RIDER_AT_CUSTOMER].includes(job.status)) {
        throw new BadRequestException('COD can be collected only during customer delivery');
      }
      const payment = job.order.payment;
      if (!payment || payment.method !== PaymentMethod.COD) {
        throw new BadRequestException('This order is not a COD order');
      }
      if (input.amountPaise !== payment.amountPaise) {
        throw new BadRequestException(`COD amount must equal ${payment.amountPaise} paise`);
      }
      if (payment.status !== PaymentStatus.PENDING_COD && payment.status !== PaymentStatus.CAPTURED) {
        throw new BadRequestException(`COD payment cannot be collected from status ${payment.status}`);
      }
      if (payment.status !== PaymentStatus.CAPTURED) {
        const changed = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING_COD },
          data: { status: PaymentStatus.CAPTURED, verifiedAt: new Date() },
        });
        if (changed.count !== 1) throw new ConflictException('COD payment changed during collection');
      }

      const operation = await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: 'COD_COLLECTED',
        actor,
        idempotencyKey: key,
        details: {
          amountPaise: input.amountPaise,
          currency: payment.currency,
          collectionReference: input.collectionReference || null,
          collectedAt: new Date().toISOString(),
        },
      });
      await this.notify(
        tx,
        job,
        actor,
        'DELIVERY_COMPLETED',
        'COD payment collected',
        `₹${(input.amountPaise / 100).toFixed(2)} was collected for order #${job.orderId.slice(-8).toUpperCase()}.`,
        operation,
        { amountPaise: input.amountPaise },
      );
      return operation;
    }, { isolationLevel: 'Serializable' as any });
  }

  async settleCod(
    deliveryJobId: string,
    actor: Actor,
    input: SettleCodDto,
    idempotencyKey?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await this.lock(tx, `cod-settlement:${deliveryJobId}`);
      const key = idempotencyKey || `cod-settled:${deliveryJobId}:${input.settlementReference}`;
      const existingByKey = await this.findOperationByKey(tx, key);
      if (existingByKey) return existingByKey;
      const existingSettlement = await this.latestOperation(tx, deliveryJobId, 'COD_SETTLED', ['COMPLETED']);
      if (existingSettlement) throw new ConflictException('COD is already settled');

      const job = await this.job(tx, deliveryJobId);
      this.assertStoreOrAdmin(job, actor);
      const payment = job.order.payment;
      if (!payment || payment.method !== PaymentMethod.COD) {
        throw new BadRequestException('This order is not a COD order');
      }
      if (payment.status !== PaymentStatus.CAPTURED) {
        throw new BadRequestException('COD must be collected before settlement');
      }
      if (input.amountPaise !== payment.amountPaise) {
        throw new BadRequestException(`Settlement amount must equal ${payment.amountPaise} paise`);
      }
      const collection = await this.latestOperation(tx, deliveryJobId, 'COD_COLLECTED', ['COMPLETED']);
      if (!collection) throw new BadRequestException('COD collection record is missing');

      const operation = await this.createOperation(tx, {
        deliveryJobId,
        orderId: job.orderId,
        type: 'COD_SETTLED',
        actor,
        idempotencyKey: key,
        details: {
          amountPaise: input.amountPaise,
          currency: payment.currency,
          settlementReference: input.settlementReference,
          note: input.note || null,
          collectionOperationId: collection.id,
          settledAt: new Date().toISOString(),
        },
      });
      await this.notify(
        tx,
        job,
        actor,
        'DELIVERY_COMPLETED',
        'COD settlement recorded',
        `COD settlement for order #${job.orderId.slice(-8).toUpperCase()} was recorded.`,
        operation,
        { amountPaise: input.amountPaise, settlementReference: input.settlementReference },
      );
      return operation;
    }, { isolationLevel: 'Serializable' as any });
  }
}

export { DeliveryFailureReason, ReturnDisposition };
