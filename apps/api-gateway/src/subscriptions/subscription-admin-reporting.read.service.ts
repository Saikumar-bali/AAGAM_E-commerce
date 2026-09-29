/**
 * Admin and store reporting reads.
 *
 * Split out of the former subscription-admin-reporting.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CashDepositBatchStatus, CustomerSubscriptionStatus, Prisma, Role, SubscriptionDeliveryStatus, SubscriptionIssueStatus, prisma } from '@aagam/database';
import { reconcileSubscriptionBalance } from './subscription-balances';

function deliveryContact(snapshot: Prisma.JsonValue) {
  const address = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot as Record<string, Prisma.JsonValue>
    : {};
  const text = (value: Prisma.JsonValue | undefined) => typeof value === 'string' && value.trim() ? value.trim() : null;
  const parts = [address.line1, address.line2, address.landmark, address.city, address.state, address.pincode]
    .map(text)
    .filter((value): value is string => Boolean(value));
  return {
    recipientName: text(address.recipientName),
    phone: text(address.phoneE164) || text(address.phone),
    alternatePhone: text(address.alternatePhoneE164),
    formattedAddress: parts.join(', ') || null,
    instructions: text(address.instructions),
  };
}

@Injectable()
export class SubscriptionAdminReportingReadService {
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
    }).then((rows) => rows.map((row) => {
      const contact = deliveryContact(row.addressSnapshot);
      return {
        ...row,
        customer: {
          ...row.customer,
          // Delivery operations must not show a blank phone just because the
          // account-level phone is null. The immutable subscription address is
          // the authoritative recipient contact for this contract.
          phone: row.customer.phone || contact.phone,
        },
        deliveryContact: contact,
      };
    }));
  }

  storeSubscribers(actor: { id: string; role: Role }) {
    const storeFilter = actor.role === Role.ADMIN ? {} : { homeStore: { ownerId: actor.id } };
    return prisma.customerSubscription.findMany({
      // A customer moved to the Recycle Bin (or purged) is deactivated, so its
      // subscription rows must disappear from the store's subscriber list;
      // otherwise a deletion made in the offline-customer directory still shows
      // here.
      // Also exclude COMPLETED subscriptions (renewed ones) to avoid duplicates.
      where: {
        ...storeFilter,
        customer: { isActive: true },
        status: { not: CustomerSubscriptionStatus.COMPLETED },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true, acquisitionSource: true } },
        plan: { select: { id: true, code: true, name: true } },
        planVersion: { select: { id: true, version: true, pricePaise: true, totalDeliveries: true } },
        homeStore: { select: { id: true, name: true } },
        deliveries: { select: { cashCollectedPaise: true, status: true } },
        _count: { select: { deliveries: true, issues: true } },
      },
      take: 500,
    }).then((rows) => rows.map((row) => {
      const contact = deliveryContact(row.addressSnapshot);
      const completedCount = row.deliveries ? row.deliveries.filter((d) => d.status === 'DELIVERED').length : row.completedDeliveries;
      const { amountCollectedPaise, amountDuePaise } = reconcileSubscriptionBalance(row, row.deliveries);
      const completedDeliveries = Math.max(row.completedDeliveries || 0, completedCount);
      const status = (amountDuePaise === 0 && row.status === 'PENDING_CASH_COLLECTION') ? 'ACTIVE' : row.status;
      return {
        ...row,
        status,
        amountCollectedPaise,
        amountDuePaise,
        completedDeliveries,
        customer: {
          ...row.customer,
          phone: row.customer.phone || contact.phone,
        },
        deliveryContact: contact,
      };
    }));
  }

  storeDeliveryCalendar(actor: { id: string; role: Role }, from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(Date.now() - 7 * 86_400_000);
    const end = to ? new Date(to) : new Date(Date.now() + 31 * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException('Invalid delivery-calendar range');
    }
    const storeFilter = actor.role === Role.ADMIN ? {} : {
      OR: [
        { store: { ownerId: actor.id } },
        { subscription: { homeStore: { ownerId: actor.id } } },
      ],
    };
    return prisma.subscriptionDelivery.findMany({
      where: { serviceDate: { gte: start, lte: end }, ...storeFilter },
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

  async storeAnalytics(actor: { id: string; role: Role }) {
    const storeFilter = actor.role === Role.ADMIN ? {} : { homeStore: { ownerId: actor.id } };
    const deliveryWhere = actor.role === Role.ADMIN ? {} : {
      OR: [
        { store: { ownerId: actor.id } },
        { subscription: { homeStore: { ownerId: actor.id } } },
      ],
    };
    const cashWhere = actor.role === Role.ADMIN ? {} : { store: { ownerId: actor.id } };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [subscriptions, deliveries, cash, demand, todayStoreDeliveries] = await Promise.all([
      prisma.customerSubscription.groupBy({
        where: storeFilter,
        by: ['status'],
        _count: { _all: true },
        _sum: { amountCollectedPaise: true, amountDuePaise: true },
      }),
      prisma.subscriptionDelivery.groupBy({
        where: deliveryWhere,
        by: ['status'],
        _count: { _all: true },
        _sum: { cashDuePaise: true, cashCollectedPaise: true },
      }),
      prisma.cashDepositBatch.groupBy({
        where: cashWhere,
        by: ['status'],
        _count: { _all: true },
        _sum: { expectedAmountPaise: true, verifiedAmountPaise: true, variancePaise: true },
      }),
      prisma.subscriptionDelivery.count({
        where: {
          serviceDate: { gte: new Date(), lte: new Date(Date.now() + 7 * 86_400_000) },
          status: SubscriptionDeliveryStatus.SCHEDULED,
          ...deliveryWhere,
        },
      }),
      prisma.subscriptionDelivery.aggregate({
        where: {
          ...deliveryWhere,
          serviceDate: { gte: today, lt: tomorrow },
          status: SubscriptionDeliveryStatus.DELIVERED,
        },
        _sum: { cashCollectedPaise: true },
      }),
    ]);
    return {
      subscriptions,
      deliveries,
      cash,
      upcomingSevenDayDemand: demand,
      todayStoreCashPaise: todayStoreDeliveries._sum.cashCollectedPaise || 0,
      generatedAt: new Date(),
    };
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
    return { ...output, deliveryContact: deliveryContact(subscription.addressSnapshot) };
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
        where: {
          OR: [
            { status: { in: [SubscriptionDeliveryStatus.FAILED, SubscriptionDeliveryStatus.RESCHEDULED] } },
            { deferredReason: { not: null } },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          subscription: { include: { customer: true, plan: true } },
          runStop: true,
          generationAttemptRows: { orderBy: { attemptNumber: 'desc' }, take: 5 },
        },
        take: 200,
      }),
      prisma.cashDepositBatch.findMany({
        where: { status: CashDepositBatchStatus.VARIANCE_REVIEW },
        orderBy: { updatedAt: 'desc' },
        include: { rider: { include: { user: true } }, store: true, deliveryRun: true },
        take: 200,
      }),
      prisma.subscriptionWorkerFailure.findMany({
        where: { resolvedAt: null },
        orderBy: { failedAt: 'desc' },
        take: 200,
      }),
    ]).then(([issues, deliveries, cashVariances, workerFailures]) => ({ issues, deliveries, cashVariances, workerFailures }));
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
}
