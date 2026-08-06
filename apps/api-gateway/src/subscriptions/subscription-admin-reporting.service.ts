import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CashDepositBatchStatus,
  CustomerSubscriptionStatus,
  Prisma,
  Role,
  SubscriptionDeliveryStatus,
  SubscriptionIssueStatus,
  prisma,
} from '@aagam/database';
import { AdminSubscriptionCorrectionDto, ResolveSubscriptionIssueDto } from './subscriptions.dto';
import { isOneOf } from '../common/enum-membership';

@Injectable()
export class SubscriptionAdminReportingService {
  subscribers(status?: CustomerSubscriptionStatus, planId?: string) {
    return prisma.customerSubscription.findMany({
      where: { ...(status ? { status } : {}), ...(planId ? { planId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        plan: { select: { id: true, code: true, name: true } },
        planVersion: { select: { id: true, version: true, pricePaise: true, totalDeliveries: true } },
        homeStore: { select: { id: true, name: true } },
        _count: { select: { deliveries: true, issues: true } },
      },
      take: 500,
    });
  }

  async subscription(id: string) {
    const subscription = await prisma.customerSubscription.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        plan: true,
        planVersion: true,
        address: true,
        homeStore: true,
        deliveries: {
          orderBy: { serviceDate: 'asc' },
          include: {
            order: { include: { payment: true, deliveryJob: true, codLedger: { include: { entries: true } } } },
            runStop: { include: { deliveryRun: true } },
          },
        },
        fundingAllocations: { include: { codLedger: true } },
        issues: { orderBy: { createdAt: 'desc' } },
        audits: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const { dropPointTokenHash: _privateTokenHash, ...output } = subscription;
    return output;
  }

  deliveryCalendar(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const end = to ? new Date(to) : new Date(Date.now() + 31 * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException('Invalid delivery-calendar range');
    }
    return prisma.subscriptionDelivery.findMany({
      where: { serviceDate: { gte: start, lte: end } },
      orderBy: [{ serviceDate: 'asc' }, { sequenceNumber: 'asc' }],
      include: {
        subscription: { include: { customer: { select: { name: true, phone: true } }, plan: { select: { name: true, code: true } } } },
        store: { select: { name: true } },
        order: { select: { id: true, status: true } },
        runStop: { include: { deliveryRun: { select: { routeCode: true, status: true, riderId: true } } } },
      },
      take: 2000,
    });
  }

  routes(serviceDate?: string) {
    const where = serviceDate ? { serviceDate: new Date(serviceDate) } : {};
    return prisma.deliveryRun.findMany({
      where,
      orderBy: [{ serviceDate: 'desc' }, { slotStart: 'asc' }],
      include: {
        store: { select: { id: true, name: true } },
        rider: { include: { user: { select: { id: true, name: true, phone: true } } } },
        stops: { orderBy: { sequenceNumber: 'asc' }, include: { subscriptionDelivery: { include: { subscription: true } } } },
        depositBatch: true,
      },
      take: 500,
    });
  }

  cashControl() {
    return prisma.cashDepositBatch.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        store: { select: { id: true, name: true } },
        rider: { include: { user: { select: { id: true, name: true, phone: true } } } },
        deliveryRun: true,
        entries: { include: { codLedger: { include: { entries: { orderBy: { createdAt: 'asc' } } } } } },
        audits: { orderBy: { createdAt: 'asc' } },
      },
      take: 500,
    });
  }

  exceptions() {
    return Promise.all([
      prisma.subscriptionIssueReport.findMany({
        where: { status: { in: [SubscriptionIssueStatus.OPEN, SubscriptionIssueStatus.IN_REVIEW] } },
        orderBy: { createdAt: 'desc' },
        include: { subscription: { include: { customer: true, plan: true } } },
        take: 200,
      }),
      prisma.subscriptionDelivery.findMany({
        where: { status: { in: [SubscriptionDeliveryStatus.FAILED, SubscriptionDeliveryStatus.RESCHEDULED] } },
        orderBy: { updatedAt: 'desc' },
        include: { subscription: { include: { customer: true, plan: true } }, runStop: true },
        take: 200,
      }),
      prisma.cashDepositBatch.findMany({
        where: { status: CashDepositBatchStatus.VARIANCE_REVIEW },
        orderBy: { updatedAt: 'desc' },
        include: { rider: { include: { user: true } }, store: true, deliveryRun: true },
        take: 200,
      }),
    ]).then(([issues, deliveries, cashVariances]) => ({ issues, deliveries, cashVariances }));
  }

  async analytics() {
    const [subscriptions, deliveries, cash, demand] = await Promise.all([
      prisma.customerSubscription.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountCollectedPaise: true, amountDuePaise: true } }),
      prisma.subscriptionDelivery.groupBy({ by: ['status'], _count: { _all: true }, _sum: { cashDuePaise: true } }),
      prisma.cashDepositBatch.groupBy({ by: ['status'], _count: { _all: true }, _sum: { expectedAmountPaise: true, verifiedAmountPaise: true, variancePaise: true } }),
      prisma.subscriptionDelivery.count({ where: { serviceDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86_400_000) }, status: SubscriptionDeliveryStatus.SCHEDULED } }),
    ]);
    return { subscriptions, deliveries, cash, upcomingSevenDayDemand: demand, generatedAt: new Date() };
  }

  async correctSubscription(id: string, dto: AdminSubscriptionCorrectionDto, actorId: string, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-correction:${id}`}))`);
      const subscription = await tx.customerSubscription.findUnique({ where: { id } });
      if (!subscription) throw new NotFoundException('Subscription not found');
      const key = idempotencyKey || `subscription-correction:${id}:${Date.now()}`;
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return subscription;
      const remainingFundedDeliveries = subscription.remainingFundedDeliveries + dto.fundedDeliveryDelta;
      const amountDuePaise = subscription.amountDuePaise + dto.amountDueDeltaPaise;
      if (remainingFundedDeliveries < 0 || amountDuePaise < 0) {
        throw new BadRequestException('Correction would create negative subscription balances');
      }
      const updated = await tx.customerSubscription.update({
        where: { id },
        data: {
          remainingFundedDeliveries,
          fundedDeliveryCount: subscription.fundedDeliveryCount + Math.max(0, dto.fundedDeliveryDelta),
          amountDuePaise,
          status: remainingFundedDeliveries > 0 ? CustomerSubscriptionStatus.ACTIVE : CustomerSubscriptionStatus.PAYMENT_DUE,
        },
      });
      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: id,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'ADMIN_COMPENSATING_CORRECTION',
          reason: dto.reason.trim(),
          metadata: {
            fundedDeliveryDelta: dto.fundedDeliveryDelta,
            amountDueDeltaPaise: dto.amountDueDeltaPaise,
            before: { remainingFundedDeliveries: subscription.remainingFundedDeliveries, amountDuePaise: subscription.amountDuePaise },
            after: { remainingFundedDeliveries, amountDuePaise },
          },
          idempotencyKey: key,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resolveIssue(issueId: string, dto: ResolveSubscriptionIssueDto, actorId: string) {
    const issue = await prisma.subscriptionIssueReport.findUnique({ where: { id: issueId } });
    if (!issue) throw new NotFoundException('Subscription issue not found');
    if (issue.status === SubscriptionIssueStatus.RESOLVED && issue.resolution === dto.resolution.trim()) {
      return issue;
    }
    if (isOneOf(issue.status, [SubscriptionIssueStatus.RESOLVED, SubscriptionIssueStatus.REJECTED])) {
      throw new ConflictException('Subscription issue is already closed');
    }
    return prisma.subscriptionIssueReport.update({
      where: { id: issueId },
      data: {
        status: SubscriptionIssueStatus.RESOLVED,
        resolution: dto.resolution.trim(),
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });
  }
}
