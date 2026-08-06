import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CodSettlementStatus,
  CustomerSubscriptionStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
  SubscriptionDeliveryStatus,
  SubscriptionFundingCycle,
  prisma,
} from '@aagam/database';
import { SubscriptionCalendarService } from './subscription-calendar.service';

type Actor = { id: string; role: Role };
type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class SubscriptionCashFundingService {
  constructor(private readonly calendar: SubscriptionCalendarService) {}

  async allocateAfterCodCollectionWithinTransaction(
    tx: TransactionClient,
    deliveryJobId: string,
    actor: Actor,
    idempotencyKey?: string,
  ) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-funding:${deliveryJobId}`}))`);
    const delivery = await tx.subscriptionDelivery.findUnique({
      where: { deliveryJobId },
      include: {
        subscription: { include: { planVersion: true } },
        deliveryJob: { include: { order: { include: { payment: true } }, codLedger: true } },
      },
    });
    if (!delivery) return null;
    const ledger = delivery.deliveryJob?.codLedger;
    const payment = delivery.deliveryJob?.order.payment;
    if (!ledger || !payment || payment.method !== PaymentMethod.COD) {
      throw new BadRequestException('Subscription cash funding requires the existing COD ledger');
    }
    if (payment.status !== PaymentStatus.CAPTURED || ledger.status !== CodSettlementStatus.HELD_BY_RIDER) {
      throw new BadRequestException('COD must be collected before subscription funding is allocated');
    }
    if (ledger.collectedAmountPaise !== ledger.expectedAmountPaise || ledger.expectedAmountPaise !== delivery.cashDuePaise) {
      throw new ConflictException('Collected cash does not match the subscription funding amount');
    }
    const key = idempotencyKey || `subscription-funding:${delivery.id}:${ledger.id}`;
    const existing = await tx.subscriptionFundingAllocation.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;

    const subscription = delivery.subscription;
    const remainingContractDeliveries = Math.max(
      0,
      subscription.planVersion.totalDeliveries - subscription.completedDeliveries,
    );
    const allocationCount = subscription.fundingCycle === SubscriptionFundingCycle.FULL_PLAN
      ? remainingContractDeliveries
      : Math.min(7, remainingContractDeliveries);
    if (allocationCount < 1) throw new BadRequestException('No remaining subscription deliveries can be funded');

    const startsAtSequence = delivery.sequenceNumber;
    const endsAtSequence = Math.min(
      subscription.planVersion.totalDeliveries,
      startsAtSequence + allocationCount - 1,
    );
    const fundedDeliveryCount = endsAtSequence - startsAtSequence + 1;
    const allocation = await tx.subscriptionFundingAllocation.create({
      data: {
        subscriptionId: subscription.id,
        codLedgerId: ledger.id,
        startsAtSequence,
        endsAtSequence,
        fundedDeliveryCount,
        amountPaise: ledger.collectedAmountPaise,
        idempotencyKey: key,
      },
    });
    const nextCash = await tx.subscriptionDelivery.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: SubscriptionDeliveryStatus.SCHEDULED,
        serviceDate: { gt: delivery.serviceDate },
        cashDuePaise: { gt: 0 },
      },
      orderBy: { serviceDate: 'asc' },
    });
    await tx.customerSubscription.update({
      where: { id: subscription.id },
      data: {
        status: CustomerSubscriptionStatus.ACTIVE,
        fundedDeliveryCount: { increment: fundedDeliveryCount },
        remainingFundedDeliveries: { increment: fundedDeliveryCount },
        amountDuePaise: 0,
        amountCollectedPaise: { increment: ledger.collectedAmountPaise },
        nextCashCollectionDate: nextCash?.serviceDate ?? null,
      },
    });
    await tx.subscriptionAuditEntry.create({
      data: {
        subscriptionId: subscription.id,
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'CASH_FUNDING_ALLOCATED',
        metadata: {
          allocationId: allocation.id,
          codLedgerId: ledger.id,
          startsAtSequence,
          endsAtSequence,
          fundedDeliveryCount,
          amountPaise: ledger.collectedAmountPaise,
        },
        idempotencyKey: `audit:${key}`,
      },
    });
    return allocation;
  }

  async allocateAfterCodCollection(deliveryJobId: string, actor: Actor, idempotencyKey?: string) {
    return prisma.$transaction(
      (tx) => this.allocateAfterCodCollectionWithinTransaction(tx, deliveryJobId, actor, idempotencyKey),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async consumeDeliveredWithinTransaction(
    tx: TransactionClient,
    subscriptionDeliveryId: string,
    actor: Actor,
    idempotencyKey?: string,
  ) {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-delivered:${subscriptionDeliveryId}`}))`);
    const delivery = await tx.subscriptionDelivery.findUnique({
      where: { id: subscriptionDeliveryId },
      include: { subscription: { include: { planVersion: true } } },
    });
    if (!delivery) throw new NotFoundException('Subscription delivery not found');
    if (delivery.status === SubscriptionDeliveryStatus.DELIVERED) return delivery;

    const subscription = delivery.subscription;
    if (subscription.remainingFundedDeliveries < 1) {
      throw new ConflictException('Subscription delivery has no funded entitlement');
    }
    const key = idempotencyKey || `subscription-delivered:${delivery.id}`;
    const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) return delivery;

    const completedDeliveries = subscription.completedDeliveries + 1;
    const remainingFundedDeliveries = Math.max(0, subscription.remainingFundedDeliveries - 1);
    const completed = completedDeliveries >= subscription.planVersion.totalDeliveries;
    const nextDelivery = await tx.subscriptionDelivery.findFirst({
      where: {
        subscriptionId: subscription.id,
        id: { not: delivery.id },
        status: SubscriptionDeliveryStatus.SCHEDULED,
        serviceDate: { gt: delivery.serviceDate },
      },
      orderBy: { serviceDate: 'asc' },
    });
    const nextCash = await tx.subscriptionDelivery.findFirst({
      where: {
        subscriptionId: subscription.id,
        status: SubscriptionDeliveryStatus.SCHEDULED,
        serviceDate: { gt: delivery.serviceDate },
        cashDuePaise: { gt: 0 },
      },
      orderBy: { serviceDate: 'asc' },
    });
    let status = CustomerSubscriptionStatus.ACTIVE;
    let amountDuePaise = 0;
    if (completed) status = CustomerSubscriptionStatus.COMPLETED;
    else if (remainingFundedDeliveries === 0) {
      status = CustomerSubscriptionStatus.PAYMENT_DUE;
      amountDuePaise = nextCash?.cashDuePaise ?? 0;
    }
    await tx.subscriptionDelivery.update({
      where: { id: delivery.id },
      data: { status: SubscriptionDeliveryStatus.DELIVERED, deliveredAt: new Date() },
    });
    await tx.customerSubscription.update({
      where: { id: subscription.id },
      data: {
        status,
        completedDeliveries,
        remainingFundedDeliveries,
        amountDuePaise,
        nextDeliveryDate: completed ? null : nextDelivery?.serviceDate ?? null,
        nextCashCollectionDate: completed ? null : nextCash?.serviceDate ?? null,
      },
    });
    await tx.subscriptionAuditEntry.create({
      data: {
        subscriptionId: subscription.id,
        actorUserId: actor.id,
        actorRole: actor.role,
        action: 'FUNDED_DELIVERY_CONSUMED',
        metadata: {
          subscriptionDeliveryId: delivery.id,
          completedDeliveries,
          remainingFundedDeliveries,
        },
        idempotencyKey: key,
      },
    });
    return tx.subscriptionDelivery.findUnique({ where: { id: delivery.id } });
  }

  async consumeDelivered(subscriptionDeliveryId: string, actor: Actor, idempotencyKey?: string) {
    return prisma.$transaction(
      (tx) => this.consumeDeliveredWithinTransaction(tx, subscriptionDeliveryId, actor, idempotencyKey),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordFailure(
    subscriptionDeliveryId: string,
    actor: Actor,
    reason: string,
    retryPending: boolean,
    idempotencyKey?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-failure:${subscriptionDeliveryId}`}))`);
      const key = idempotencyKey || `subscription-failure:${subscriptionDeliveryId}:${reason}`;
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        return tx.subscriptionDelivery.findUnique({ where: { id: subscriptionDeliveryId } });
      }
      const delivery = await tx.subscriptionDelivery.findUnique({
        where: { id: subscriptionDeliveryId },
        include: { subscription: { include: { plan: true } } },
      });
      if (!delivery) throw new NotFoundException('Subscription delivery not found');
      if (delivery.status === SubscriptionDeliveryStatus.DELIVERED) {
        throw new ConflictException('A delivered occurrence cannot be failed');
      }

      await tx.subscriptionDelivery.update({
        where: { id: subscriptionDeliveryId },
        data: {
          status: retryPending ? SubscriptionDeliveryStatus.RESCHEDULED : SubscriptionDeliveryStatus.FAILED,
          failureReason: reason,
          failedAt: new Date(),
        },
      });

      let extensionDate: Date | null = null;
      if (!retryPending) {
        let next = await tx.subscriptionDelivery.findFirst({
          where: {
            subscriptionId: delivery.subscriptionId,
            status: SubscriptionDeliveryStatus.SCHEDULED,
            serviceDate: { gt: delivery.serviceDate },
          },
          orderBy: { serviceDate: 'asc' },
        });
        if (delivery.cashDuePaise > 0 && next) {
          next = await tx.subscriptionDelivery.update({
            where: { id: next.id },
            data: { cashDuePaise: delivery.cashDuePaise },
          });
        }
        const latest = await tx.subscriptionDelivery.findFirst({
          where: { subscriptionId: delivery.subscriptionId },
          orderBy: [{ serviceDate: 'desc' }, { sequenceNumber: 'desc' }],
        });
        if (!latest) throw new ConflictException('Subscription calendar is empty');
        extensionDate = this.calendar.nextAfter(
          delivery.subscription.plan,
          latest.serviceDate,
          delivery.subscription.startDate,
        );
        const extension = await tx.subscriptionDelivery.create({
          data: {
            subscriptionId: delivery.subscriptionId,
            serviceDate: extensionDate,
            sequenceNumber: latest.sequenceNumber + 1,
            generationKey: `subscription:${delivery.subscriptionId}:failure-extension:${latest.sequenceNumber + 1}:${extensionDate.toISOString().slice(0, 10)}`,
            cashDuePaise: delivery.cashDuePaise > 0 && !next ? delivery.cashDuePaise : 0,
            proofMode: delivery.proofMode,
            rescheduledFromDate: delivery.serviceDate,
          },
        });
        const nextDelivery = next ?? extension;
        await tx.customerSubscription.update({
          where: { id: delivery.subscriptionId },
          data: {
            failedDeliveries: { increment: 1 },
            endDate: extensionDate,
            nextDeliveryDate: nextDelivery.serviceDate,
            nextCashCollectionDate: delivery.cashDuePaise > 0
              ? nextDelivery.serviceDate
              : undefined,
          },
        });
      }

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: delivery.subscriptionId,
          actorUserId: actor.id,
          actorRole: actor.role,
          action: retryPending ? 'DELIVERY_RETRY_REQUESTED' : 'DELIVERY_FAILED_AND_PLAN_EXTENDED',
          reason,
          metadata: { subscriptionDeliveryId, extensionDate },
          idempotencyKey: key,
        },
      });
      return tx.subscriptionDelivery.findUnique({ where: { id: subscriptionDeliveryId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
