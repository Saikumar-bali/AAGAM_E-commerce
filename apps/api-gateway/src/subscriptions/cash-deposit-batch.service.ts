import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashDepositBatchStatus,
  CodLedgerEntryType,
  CodSettlementStatus,
  DeliveryRunStatus,
  Prisma,
  Role,
  prisma,
} from '@aagam/database';
import {
  CreateCashDepositBatchDto,
  ResolveCashVarianceDto,
  SubmitCashDepositBatchDto,
  VerifyCashDepositBatchDto,
} from './subscriptions.dto';
import { nullableJson } from '../common/prisma-json';

type Actor = { id: string; role: Role };

@Injectable()
export class CashDepositBatchService {
  private async riderProfile(actor: Actor) {
    if (actor.role !== Role.RIDER) throw new ForbiddenException('Rider role is required');
    const rider = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
    if (!rider) throw new ForbiddenException('Rider profile not found');
    return rider;
  }

  async create(runId: string, dto: CreateCashDepositBatchDto, actor: Actor, idempotencyKey?: string) {
    const rider = await this.riderProfile(actor);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`cash-batch-create:${runId}`}))`);
      const run = await tx.deliveryRun.findFirst({ where: { id: runId, riderId: rider.id } });
      if (!run) throw new NotFoundException('Assigned delivery run not found');
      if (run.version !== dto.version) throw new ConflictException('Delivery run changed; refresh and try again');
      if (run.status !== DeliveryRunStatus.AWAITING_SETTLEMENT) {
        throw new BadRequestException('Finish the route before creating a cash deposit batch');
      }
      const existing = await tx.cashDepositBatch.findUnique({
        where: { deliveryRunId: runId },
        include: { entries: { include: { codLedger: true } }, audits: true },
      });
      if (existing) return existing;
      const requestedIds = [...new Set(dto.codLedgerIds)];
      const ledgers = await tx.codLedger.findMany({
        where: {
          id: { in: requestedIds },
          riderId: rider.id,
          riderHoldingBalancePaise: { gt: 0 },
          status: { in: [CodSettlementStatus.HELD_BY_RIDER, CodSettlementStatus.PARTIALLY_DEPOSITED] },
          deliveryJob: { deliveryRunStop: { deliveryRunId: runId } },
        },
      });
      if (ledgers.length !== requestedIds.length) {
        throw new BadRequestException('One or more COD ledgers are not eligible for this route batch');
      }
      const expectedAmountPaise = ledgers.reduce((sum, ledger) => sum + ledger.riderHoldingBalancePaise, 0);
      if (expectedAmountPaise < 1) throw new BadRequestException('No rider-held cash is available for deposit');
      const reference = `CASH-${run.routeCode}-${Date.now().toString(36).toUpperCase()}`;
      const batch = await tx.cashDepositBatch.create({
        data: {
          reference,
          riderId: rider.id,
          storeId: run.storeId,
          deliveryRunId: run.id,
          expectedAmountPaise,
          entries: {
            create: ledgers.map((ledger) => ({
              codLedgerId: ledger.id,
              allocatedAmountPaise: 0,
              holdingBeforePaise: ledger.riderHoldingBalancePaise,
              holdingAfterPaise: ledger.riderHoldingBalancePaise,
              depositedBeforePaise: ledger.depositedAmountPaise,
              depositedAfterPaise: ledger.depositedAmountPaise,
            })),
          },
        },
      });
      await tx.cashDepositAuditEntry.create({
        data: {
          cashDepositBatchId: batch.id,
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'BATCH_CREATED',
          amountPaise: expectedAmountPaise,
          metadata: { codLedgerIds: requestedIds },
          idempotencyKey: idempotencyKey || `cash-batch-created:${run.id}`,
        },
      });
      return tx.cashDepositBatch.findUnique({ where: { id: batch.id }, include: { entries: true, audits: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async submit(batchId: string, dto: SubmitCashDepositBatchDto, actor: Actor, idempotencyKey?: string) {
    const rider = await this.riderProfile(actor);
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`cash-batch-submit:${batchId}`}))`);
      const batch = await tx.cashDepositBatch.findUnique({ where: { id: batchId } });
      if (!batch || batch.riderId !== rider.id) throw new NotFoundException('Cash deposit batch not found');
      if (batch.version !== dto.version) throw new ConflictException('Cash batch changed; refresh and try again');
      if (batch.status === CashDepositBatchStatus.SUBMITTED) return batch;
      if (batch.status !== CashDepositBatchStatus.DRAFT) throw new BadRequestException(`Cash batch cannot be submitted from ${batch.status}`);
      if (dto.submittedAmountPaise < 0) throw new BadRequestException('Submitted cash cannot be negative');
      const updated = await tx.cashDepositBatch.update({
        where: { id: batch.id },
        data: {
          submittedAmountPaise: dto.submittedAmountPaise,
          submittedById: actor.id,
          riderSubmittedAt: new Date(),
          receiptEvidence: nullableJson(dto.receiptEvidence, 'receiptEvidence'),
          status: CashDepositBatchStatus.SUBMITTED,
          version: { increment: 1 },
        },
      });
      await tx.cashDepositAuditEntry.create({
        data: {
          cashDepositBatchId: batch.id,
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'RIDER_SUBMITTED_PHYSICAL_CASH',
          amountPaise: dto.submittedAmountPaise,
          metadata: { expectedAmountPaise: batch.expectedAmountPaise },
          idempotencyKey: idempotencyKey || `cash-batch-submitted:${batch.id}`,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async verify(batchId: string, dto: VerifyCashDepositBatchDto, actor: Actor, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`cash-batch-verify:${batchId}`}))`);
      const batch = await tx.cashDepositBatch.findUnique({
        where: { id: batchId },
        include: {
          store: { select: { ownerId: true } },
          deliveryRun: true,
          entries: true,
        },
      });
      if (!batch) throw new NotFoundException('Cash deposit batch not found');
      if (actor.role !== Role.ADMIN && (actor.role !== Role.STORE_OWNER || batch.store.ownerId !== actor.id)) {
        throw new ForbiddenException('Only the owning store can verify this cash batch');
      }
      if (batch.version !== dto.version) throw new ConflictException('Cash batch changed; refresh and try again');
      if (batch.status === CashDepositBatchStatus.SETTLED || batch.status === CashDepositBatchStatus.VARIANCE_REVIEW) {
        return batch;
      }
      if (batch.status !== CashDepositBatchStatus.SUBMITTED) throw new BadRequestException('Rider must submit the batch before store verification');
      if (dto.verifiedAmountPaise !== batch.expectedAmountPaise && !dto.varianceReason?.trim()) {
        throw new BadRequestException('A variance reason is required when verified cash differs from expected cash');
      }
      const ledgers = await tx.codLedger.findMany({
        where: {
          id: { in: batch.entries.map((entry) => entry.codLedgerId) },
          riderId: batch.riderId,
          riderHoldingBalancePaise: { gt: 0 },
          deliveryJob: { deliveryRunStop: { deliveryRunId: batch.deliveryRunId } },
        },
        orderBy: [{ collectionTimestamp: 'asc' }, { createdAt: 'asc' }],
      });
      const eligibleTotal = ledgers.reduce((sum, ledger) => sum + ledger.riderHoldingBalancePaise, 0);
      if (eligibleTotal !== batch.expectedAmountPaise) {
        throw new ConflictException('Underlying COD ledger balances changed; recreate the batch');
      }
      let remainingDeposit = Math.min(dto.verifiedAmountPaise, batch.expectedAmountPaise);
      for (const ledger of ledgers) {
        const allocated = Math.min(remainingDeposit, ledger.riderHoldingBalancePaise);
        const holdingAfter = ledger.riderHoldingBalancePaise - allocated;
        const depositedAfter = ledger.depositedAmountPaise + allocated;
        const ledgerVariance = ledger.expectedAmountPaise - depositedAfter;
        const ledgerStatus = holdingAfter === 0 && ledgerVariance === 0
          ? CodSettlementStatus.SETTLED
          : CodSettlementStatus.VARIANCE_REVIEW;
        await tx.cashDepositBatchEntry.update({
          where: { codLedgerId: ledger.id },
          data: {
            allocatedAmountPaise: allocated,
            holdingBeforePaise: ledger.riderHoldingBalancePaise,
            holdingAfterPaise: holdingAfter,
            depositedBeforePaise: ledger.depositedAmountPaise,
            depositedAfterPaise: depositedAfter,
          },
        });
        await tx.codLedger.update({
          where: { id: ledger.id },
          data: {
            depositedAmountPaise: depositedAfter,
            riderHoldingBalancePaise: holdingAfter,
            settlementReference: dto.settlementReference.trim(),
            variancePaise: ledgerVariance,
            varianceReason: ledgerVariance ? dto.varianceReason?.trim() : null,
            status: ledgerStatus,
          },
        });
        await tx.codLedgerEntry.create({
          data: {
            codLedgerId: ledger.id,
            type: CodLedgerEntryType.DEPOSITED,
            amountPaise: allocated,
            holdingAfterPaise: holdingAfter,
            depositedAfterPaise: depositedAfter,
            actorUserId: actor.id,
            actorRole: actor.role,
            reference: dto.settlementReference.trim(),
            idempotencyKey: `cash-batch-deposit:${batch.id}:${ledger.id}`,
            metadata: { cashDepositBatchId: batch.id, verifiedAmountPaise: dto.verifiedAmountPaise },
          },
        });
        if (ledgerVariance !== 0) {
          await tx.codLedgerEntry.create({
            data: {
              codLedgerId: ledger.id,
              type: CodLedgerEntryType.VARIANCE_RECORDED,
              amountPaise: Math.abs(ledgerVariance),
              holdingAfterPaise: holdingAfter,
              depositedAfterPaise: depositedAfter,
              actorUserId: actor.id,
              actorRole: actor.role,
              reference: dto.settlementReference.trim(),
              idempotencyKey: `cash-batch-variance:${batch.id}:${ledger.id}`,
              metadata: { reason: dto.varianceReason?.trim(), cashDepositBatchId: batch.id },
            },
          });
        }
        remainingDeposit -= allocated;
      }
      const variancePaise = batch.expectedAmountPaise - dto.verifiedAmountPaise;
      const status = variancePaise === 0 ? CashDepositBatchStatus.SETTLED : CashDepositBatchStatus.VARIANCE_REVIEW;
      const updated = await tx.cashDepositBatch.update({
        where: { id: batch.id },
        data: {
          verifiedAmountPaise: dto.verifiedAmountPaise,
          variancePaise,
          varianceReason: dto.varianceReason?.trim() || null,
          verifiedById: actor.id,
          storeVerifiedAt: new Date(),
          settlementReference: dto.settlementReference.trim(),
          receiptEvidence: nullableJson(dto.receiptEvidence ?? batch.receiptEvidence, 'receiptEvidence'),
          status,
          version: { increment: 1 },
        },
      });
      await tx.cashDepositAuditEntry.create({
        data: {
          cashDepositBatchId: batch.id,
          actorUserId: actor.id,
          actorRole: actor.role,
          action: variancePaise === 0 ? 'STORE_VERIFIED_AND_SETTLED' : 'STORE_VERIFIED_VARIANCE',
          amountPaise: dto.verifiedAmountPaise,
          reason: dto.varianceReason?.trim() || null,
          metadata: { expectedAmountPaise: batch.expectedAmountPaise, variancePaise, settlementReference: dto.settlementReference },
          idempotencyKey: idempotencyKey || `cash-batch-verified:${batch.id}`,
        },
      });
      await tx.deliveryRun.update({
        where: { id: batch.deliveryRunId },
        data: {
          depositedCashPaise: Math.min(dto.verifiedAmountPaise, batch.expectedAmountPaise),
          varianceCashPaise: variancePaise,
          status: variancePaise === 0 ? DeliveryRunStatus.COMPLETED : DeliveryRunStatus.AWAITING_SETTLEMENT,
          version: { increment: 1 },
        },
      });
      if (variancePaise === 0) await tx.riderProfile.update({ where: { id: batch.riderId }, data: { status: 'ONLINE' } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resolveVariance(batchId: string, dto: ResolveCashVarianceDto, actor: Actor, idempotencyKey?: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only administrators can resolve cash variances');
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`cash-batch-resolve:${batchId}`}))`);
      const batch = await tx.cashDepositBatch.findUnique({ where: { id: batchId }, include: { entries: { include: { codLedger: true } } } });
      if (!batch) throw new NotFoundException('Cash deposit batch not found');
      if (batch.version !== dto.version) throw new ConflictException('Cash batch changed; refresh and try again');
      if (batch.status !== CashDepositBatchStatus.VARIANCE_REVIEW) throw new BadRequestException('Cash batch is not awaiting variance review');
      if (dto.adjustmentPaise !== batch.variancePaise) {
        throw new BadRequestException(`Compensating adjustment must equal the recorded variance of ${batch.variancePaise} paise`);
      }
      const key = idempotencyKey || `cash-batch-resolved:${batch.id}`;
      const existing = await tx.cashDepositAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return batch;
      let remaining = Math.max(0, dto.adjustmentPaise);
      for (const entry of batch.entries) {
        if (remaining <= 0) break;
        const ledger = await tx.codLedger.findUnique({ where: { id: entry.codLedgerId } });
        if (!ledger) throw new ConflictException('Individual COD ledger is missing');
        const allocation = Math.min(remaining, ledger.riderHoldingBalancePaise || ledger.variancePaise);
        if (allocation <= 0) continue;
        const depositedAfter = ledger.depositedAmountPaise + allocation;
        const holdingAfter = Math.max(0, ledger.riderHoldingBalancePaise - allocation);
        await tx.codLedger.update({
          where: { id: ledger.id },
          data: {
            depositedAmountPaise: depositedAfter,
            riderHoldingBalancePaise: holdingAfter,
            variancePaise: Math.max(0, ledger.expectedAmountPaise - depositedAfter),
            varianceReason: null,
            status: depositedAfter === ledger.expectedAmountPaise ? CodSettlementStatus.SETTLED : CodSettlementStatus.VARIANCE_REVIEW,
          },
        });
        await tx.codLedgerEntry.create({
          data: {
            codLedgerId: ledger.id,
            type: CodLedgerEntryType.COMPENSATING_ADJUSTMENT,
            amountPaise: allocation,
            holdingAfterPaise: holdingAfter,
            depositedAfterPaise: depositedAfter,
            actorUserId: actor.id,
            actorRole: actor.role,
            reference: batch.settlementReference,
            idempotencyKey: `cash-compensation:${batch.id}:${ledger.id}`,
            metadata: { reason: dto.reason.trim(), cashDepositBatchId: batch.id },
          },
        });
        remaining -= allocation;
      }
      if (remaining > 0) throw new ConflictException('Compensating cash cannot be allocated to the underlying ledgers');
      const resolvedVerified = batch.verifiedAmountPaise + dto.adjustmentPaise;
      if (resolvedVerified !== batch.expectedAmountPaise) throw new ConflictException('Compensating entry does not reconcile the batch');
      const updated = await tx.cashDepositBatch.update({
        where: { id: batch.id },
        data: {
          verifiedAmountPaise: resolvedVerified,
          variancePaise: 0,
          varianceReason: null,
          status: CashDepositBatchStatus.SETTLED,
          version: { increment: 1 },
        },
      });
      await tx.cashDepositAuditEntry.create({
        data: {
          cashDepositBatchId: batch.id,
          actorUserId: actor.id,
          actorRole: actor.role,
          action: 'ADMIN_VARIANCE_COMPENSATION',
          amountPaise: dto.adjustmentPaise,
          reason: dto.reason.trim(),
          metadata: { previousVariancePaise: batch.variancePaise },
          idempotencyKey: key,
        },
      });
      await tx.deliveryRun.update({
        where: { id: batch.deliveryRunId },
        data: {
          depositedCashPaise: batch.expectedAmountPaise,
          varianceCashPaise: 0,
          status: DeliveryRunStatus.COMPLETED,
          version: { increment: 1 },
        },
      });
      await tx.riderProfile.update({ where: { id: batch.riderId }, data: { status: 'ONLINE' } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async riderBatches(actor: Actor) {
    const rider = await this.riderProfile(actor);
    return prisma.cashDepositBatch.findMany({
      where: { riderId: rider.id },
      orderBy: { createdAt: 'desc' },
      include: { deliveryRun: true, entries: { include: { codLedger: true } }, audits: { orderBy: { createdAt: 'asc' } } },
    });
  }

  storeBatches(actor: Actor) {
    return prisma.cashDepositBatch.findMany({
      where: actor.role === Role.ADMIN ? {} : { store: { ownerId: actor.id } },
      orderBy: { createdAt: 'desc' },
      include: { rider: { include: { user: { select: { name: true, phone: true } } } }, deliveryRun: true, entries: true, audits: true },
      take: 200,
    });
  }
}
