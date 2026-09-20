import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CashDepositBatchStatus,
  CustomerSubscriptionStatus,
  DeliveryJobStatus,
  Prisma,
  Role,
  SubscriptionDeliveryStatus,
  SubscriptionIssueStatus,
  SubscriptionProofMode,
  prisma,
} from '@aagam/database';
import { randomUUID } from 'crypto';
import { AdminSubscriptionCorrectionDto, ResolveSubscriptionIssueDto } from './subscriptions.dto';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { SubscriptionPlanService } from './subscription-plan.service';
import { isOneOf } from '../common/enum-membership';
import { normalizePhoneE164 } from '../contact-verification/contact-otp.service';

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
export class SubscriptionAdminReportingService {
  constructor(private readonly funding: SubscriptionCashFundingService) {}

  async reconcileDeliveredDelivery(deliveryId: string, actorId: string, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      const delivery = await tx.subscriptionDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          deliveryJob: { include: { order: { include: { payment: true } } } },
        },
      });
      if (!delivery) throw new NotFoundException('Subscription delivery not found');
      if (delivery.status === SubscriptionDeliveryStatus.DELIVERED) return delivery;
      if (!delivery.deliveryJob) {
        throw new ConflictException('Subscription delivery has no delivery job');
      }
      if (delivery.deliveryJob.status !== DeliveryJobStatus.DELIVERED) {
        throw new ConflictException('Delivery job is not DELIVERED — reconciliation requires a completed delivery');
      }
      const key = idempotencyKey || `admin-reconcile:${delivery.id}`;
      const existingAudit = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existingAudit) return delivery;
      await this.funding.reconcileDeliveredWithinTransaction(
        tx,
        delivery.deliveryJob,
        { id: actorId, role: Role.ADMIN },
      );
      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: delivery.subscriptionId,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'DELIVERY_RECONCILED_BY_ADMIN',
          reason: 'Delivery job was completed through the order flow; subscription reconciled manually',
          metadata: { subscriptionDeliveryId: delivery.id, deliveryJobId: delivery.deliveryJob.id },
          idempotencyKey: key,
        },
      });
      return tx.subscriptionDelivery.findUnique({ where: { id: delivery.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

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

  /** Store-scoped subscriber list: only subscriptions tied to the owner's stores. */
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
      const deliveryCash = row.deliveries ? row.deliveries.reduce((sum, d) => sum + (d.cashCollectedPaise || 0), 0) : 0;
      const completedCount = row.deliveries ? row.deliveries.filter((d) => d.status === 'DELIVERED').length : row.completedDeliveries;
      const amountCollectedPaise = Math.max(row.amountCollectedPaise || 0, deliveryCash);
      const amountDuePaise = Math.max(0, (row.amountDuePaise || 0) - (amountCollectedPaise - (row.amountCollectedPaise || 0)));
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

  /** Store-scoped delivery calendar for deliveries fulfilled from the owner's stores. */
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

  /** Store-scoped aggregate analytics for the owner's stores. */
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

  async correctSubscription(id: string, dto: AdminSubscriptionCorrectionDto, actorId: string, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-correction:${id}`}))`);
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

  async createOfflineCustomer(
    dto: { name: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; latitude?: number; longitude?: number; storeId?: string },
    actor?: { id: string; role: Role },
  ) {
    const compactPhone = dto.phone.trim().replace(/[\s().-]/g, '');
    if (!/^\d{10}$/.test(compactPhone)) {
      throw new BadRequestException('Phone number must be exactly 10 digits');
    }

    // Pin the customer to the creating store so the store that owns the
    // relationship can manage the lifecycle even before a subscription exists.
    // Callers resolve `storeId` (admins pick one; stores are bound to the store
    // they own and are verified before this call).
    const storeId = dto.storeId;
    if (!storeId) {
      throw new BadRequestException('storeId is required to register an offline customer');
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }

    let e164Phone: string | null = null;
    try {
      e164Phone = normalizePhoneE164(dto.phone);
    } catch {
      e164Phone = `+91${compactPhone}`;
    }

    let customer = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: compactPhone },
          ...(e164Phone ? [{ phone: e164Phone }] : []),
          { phone: dto.phone.trim() },
        ],
      },
    });

    if (!customer) {
      const syntheticEmail = `offline.${compactPhone || Date.now()}@aagaam.local`;
      customer = await prisma.user.create({
        data: {
          name: dto.name.trim(),
          phone: compactPhone,
          email: syntheticEmail,
          role: Role.CUSTOMER,
          emailVerified: true,
          acquisitionSource: 'OFFLINE_STORE',
          offlineStoreId: storeId ?? null,
        },
      });
    } else {
      const isOfflineCustomer =
        customer.acquisitionSource === 'OFFLINE_STORE' ||
        customer.acquisitionSource === 'OFFLINE' ||
        (customer.email && customer.email.endsWith('@aagaam.local') && customer.email.startsWith('offline.'));

      if (!isOfflineCustomer) {
        throw new ConflictException('A registered customer with this phone number already exists.');
      }

      if (customer.offlineStoreId && customer.offlineStoreId !== storeId && actor?.role !== Role.ADMIN) {
        throw new ConflictException('This customer is already registered with another store.');
      }

      if (actor && actor.role !== Role.ADMIN) {
        const otherStoreSub = await prisma.customerSubscription.findFirst({
          where: {
            customerId: customer.id,
            homeStore: { ownerId: { not: actor.id } },
          },
          select: { id: true },
        });
        if (otherStoreSub) {
          throw new ConflictException('This customer has subscriptions registered with another store.');
        }
      }

      const patch: Prisma.UserUpdateInput = {};
      if (dto.name.trim() && dto.name.trim() !== (customer.name || '')) {
        // Persist an edited display name so admin edits are not silently dropped.
        patch.name = dto.name.trim();
      }
      if (!customer.offlineStoreId && storeId) {
        patch.offlineStore = { connect: { id: storeId } };
      }
      if (Object.keys(patch).length > 0) {
        customer = await prisma.user.update({ where: { id: customer.id }, data: patch });
      }
    }

    const fallbackLat = typeof dto.latitude === 'number' && Number.isFinite(dto.latitude) ? dto.latitude : 17.6913;
    const fallbackLng = typeof dto.longitude === 'number' && Number.isFinite(dto.longitude) ? dto.longitude : 83.0039;

    // Clear any existing default addresses before creating a new one to avoid
    // multiple defaults on the same customer (which could cause stale prefill).
    await prisma.customerAddress.updateMany({
      where: { userId: customer.id, isDefault: true },
      data: { isDefault: false },
    });

    const address = await prisma.customerAddress.create({
      data: {
        userId: customer.id,
        label: 'Home',
        recipientName: dto.name.trim(),
        phoneE164: compactPhone,
        line1: dto.line1.trim(),
        line2: dto.line2?.trim() || null,
        landmark: dto.landmark?.trim() || null,
        city: dto.city.trim(),
        state: dto.state.trim(),
        pincode: dto.pincode.trim(),
        country: 'IN',
        latitude: fallbackLat,
        longitude: fallbackLng,
        isDefault: true,
      },
    });

    return { customer, address };
  }

  async createManualSubscription(dto: {
    storeId: string;
    planId: string;
    customerId: string;
    addressId: string;
    startDate: string;
    totalDeliveries: number;
    deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH';
    initialCashCollectedPaise?: number;
    storeDelivery?: boolean;
    note?: string;
    frequency?: 'DAILY' | 'ALTERNATE_DAYS' | 'WEEKDAYS' | 'SELECTED_WEEKDAYS';
    selectedWeekdays?: number[];
    vacationRange?: { fromDate?: string; toDate?: string; policy?: 'EXTEND_PLAN' | 'DEDUCT_BILL' };
    splitItems?: { amProductName?: string; amQuantity?: string; pmProductName?: string; pmQuantity?: string };
  }, actorId: string) {
    const store = await prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) throw new NotFoundException('Store not found');

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 }, items: { include: { product: true } } },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    
    // Auto-publish draft plans to create a version
    let version = plan.versions[0];
    if (!version) {
      if (plan.status !== 'DRAFT') {
        throw new BadRequestException('Cannot create subscription from a plan without versions that is not in DRAFT status');
      }
      const planService = new SubscriptionPlanService();
      await planService.publish(plan.id, actorId);
      const updatedPlan = await prisma.subscriptionPlan.findUnique({
        where: { id: plan.id },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
      if (!updatedPlan?.versions[0]) throw new NotFoundException('Failed to create plan version');
      version = updatedPlan.versions[0];
    }

    // A store-delivery/other manual subscription must never be attached to a
    // store that the plan's applicability snapshot excludes: the generator
    // resolves store-delivery serviceability against the home store, so a
    // mismatched store/plan pair would defer the subscription forever.
    const applicabilityRecord = (version.applicabilitySnapshot ?? {}) as Record<string, unknown>;
    const allowedStoreIds = Array.isArray(applicabilityRecord.storeIds) ? applicabilityRecord.storeIds.map(String) : [];
    if (allowedStoreIds.length > 0 && !allowedStoreIds.includes(store.id)) {
      throw new BadRequestException(
        `The selected store is not allowed by this plan (allowed stores: ${allowedStoreIds.join(', ')})`,
      );
    }

    const address = await prisma.customerAddress.findUnique({ where: { id: dto.addressId } });
    if (!address) throw new NotFoundException('Delivery address not found');

    const start = new Date(dto.startDate);
    if (isNaN(start.getTime())) throw new BadRequestException('Invalid start date');

    const frequency = dto.frequency || 'DAILY';
    const stepDays = frequency === 'ALTERNATE_DAYS' ? 2 : 1;
    const isSlotBoth = dto.deliverySlot === 'BOTH';
    const rawSlot = dto.deliverySlot || 'MORNING';

    const vacationFrom = dto.vacationRange?.fromDate ? new Date(dto.vacationRange.fromDate) : null;
    const vacationTo = dto.vacationRange?.toDate ? new Date(dto.vacationRange.toDate) : null;
    const vacationPolicy = dto.vacationRange?.policy || 'EXTEND_PLAN';

    const durationDays = Math.ceil(dto.totalDeliveries / (isSlotBoth ? 2 : 1)) * stepDays;
    const end = new Date(start.getTime() + durationDays * 86_400_000);

    const pricePaise = plan.pricePaise;
    const initialCash = dto.initialCashCollectedPaise || 0;
    const amountDuePaise = Math.max(0, pricePaise - initialCash);
    const initialStatus = initialCash >= pricePaise ? CustomerSubscriptionStatus.ACTIVE : CustomerSubscriptionStatus.PENDING_CASH_COLLECTION;

    const slotStartMinute = rawSlot === 'EVENING' ? 17 * 60 : 6 * 60;
    const slotEndMinute = rawSlot === 'EVENING' ? 20 * 60 : 9 * 60;

    return prisma.$transaction(async (tx) => {
      const subscription = await tx.customerSubscription.create({
        data: {
          customerId: dto.customerId,
          planId: plan.id,
          planVersionId: version.id,
          addressId: address.id,
          homeStoreId: store.id,
          status: initialStatus,
          startDate: start,
          endDate: end,
          nextDeliveryDate: start,
          deliveryWindowStartMinute: slotStartMinute,
          deliveryWindowEndMinute: slotEndMinute,
          deliveryMethod: 'PERSONAL_HANDOVER',
          storeDelivery: dto.storeDelivery ?? false,
          priceSnapshot: {
            pricePaise,
            mrpPaise: plan.mrpPaise,
            currency: 'INR',
            cycleNumber: 1,
            frequency,
            splitItems: dto.splitItems || null,
            manualNote: dto.note,
          },
          itemsSnapshot: dto.splitItems
            ? [
                { name: dto.splitItems.amProductName || 'AM Milk', quantity: dto.splitItems.amQuantity || '1L', slot: 'AM' },
                { name: dto.splitItems.pmProductName || 'PM Milk', quantity: dto.splitItems.pmQuantity || '1L', slot: 'PM' },
              ]
            : plan.items.map((i) => ({ productId: i.productId, quantityPerDelivery: i.quantityPerDelivery, name: i.product.name })),
          addressSnapshot: {
            recipientName: address.recipientName,
            phoneE164: address.phoneE164,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            latitude: address.latitude,
            longitude: address.longitude,
          },
          policySnapshot: { allowPause: plan.allowPause, allowSkip: plan.allowSkip },
          fundedDeliveryCount: dto.totalDeliveries,
          remainingFundedDeliveries: dto.totalDeliveries,
          amountDuePaise,
          amountCollectedPaise: initialCash,
          fundingCycle: plan.fundingCycle,
        },
      });

      // Generate delivery calendar rows with automated frequency stepping and vacation skips
      const deliveriesData: Prisma.SubscriptionDeliveryCreateManyInput[] = [];
      let curDate = new Date(start);
      let seq = 1;
      let lastGeneratedDate = new Date(start);

      while (seq <= dto.totalDeliveries) {
        const dayOfWeek = curDate.getUTCDay();

        // Skip weekends if WEEKDAYS
        if (frequency === 'WEEKDAYS' && (dayOfWeek === 0 || dayOfWeek === 6)) {
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        // Skip non-selected weekdays
        if (frequency === 'SELECTED_WEEKDAYS' && dto.selectedWeekdays?.length && !dto.selectedWeekdays.includes(dayOfWeek)) {
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        // Check if falls in planned vacation
        const isVacation = Boolean(vacationFrom && vacationTo && curDate >= vacationFrom && curDate <= vacationTo);
        if (isVacation && vacationPolicy === 'EXTEND_PLAN') {
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        let deliverySlot = 'AM';
        if (isSlotBoth) {
          deliverySlot = seq % 2 === 1 ? 'AM' : 'PM';
        } else {
          deliverySlot = rawSlot === 'EVENING' ? 'PM' : 'AM';
        }

        const dateStr = curDate.toISOString().slice(0, 10);
        let deferredReason: string | null = null;
        if (dto.splitItems) {
          const itemText = deliverySlot === 'AM'
            ? `${dto.splitItems.amQuantity || '1L'} ${dto.splitItems.amProductName || 'Milk'}`
            : `${dto.splitItems.pmQuantity || '1L'} ${dto.splitItems.pmProductName || 'Milk'}`;
          deferredReason = `[SPLIT_ITEM: ${itemText}]`;
        }

        deliveriesData.push({
          subscriptionId: subscription.id,
          serviceDate: new Date(curDate),
          sequenceNumber: seq,
          deliverySlot,
          status: isVacation ? SubscriptionDeliveryStatus.SKIPPED : SubscriptionDeliveryStatus.SCHEDULED,
          skipReason: isVacation ? 'Planned Vacation' : null,
          generationKey: `manual:${subscription.id}:${seq}:${dateStr}:${deliverySlot}`,
          storeId: store.id,
          cashDuePaise: seq === 1 ? amountDuePaise : 0,
          proofMode: SubscriptionProofMode.PERSONAL_OTP_GPS,
          deferredReason,
        });

        lastGeneratedDate = new Date(curDate);
        seq++;

        if (isSlotBoth) {
          if (seq % 2 === 1) {
            curDate = new Date(curDate.getTime() + stepDays * 86_400_000);
          }
        } else {
          curDate = new Date(curDate.getTime() + stepDays * 86_400_000);
        }
      }
      await tx.subscriptionDelivery.createMany({ data: deliveriesData, skipDuplicates: true });

      // Update endDate to match actual last generated delivery date
      await tx.customerSubscription.update({
        where: { id: subscription.id },
        data: { endDate: lastGeneratedDate },
      });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: subscription.id,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'ADMIN_MANUAL_SUBSCRIPTION_CREATED',
          reason: dto.note || 'Created manual subscription for store customer',
          metadata: { storeId: store.id, planId: plan.id, totalDeliveries: dto.totalDeliveries, deliverySlot: dto.deliverySlot },
          idempotencyKey: `manual-subscription:${subscription.id}:${randomUUID()}`,
        },
      });

      return subscription;
    });
  }

  async updateManualSubscription(id: string, dto: { startDate?: string; totalDeliveries?: number; deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH'; amountDuePaise?: number; amountCollectedPaise?: number; note?: string }, actorId: string) {
    const subscription = await prisma.customerSubscription.findUnique({ where: { id } });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const updateData: any = {};
    if (dto.startDate) {
      const start = new Date(dto.startDate);
      if (!isNaN(start.getTime())) updateData.startDate = start;
    }
    if (typeof dto.totalDeliveries === 'number' && dto.totalDeliveries > 0) {
      updateData.fundedDeliveryCount = dto.totalDeliveries;
      updateData.remainingFundedDeliveries = Math.max(0, dto.totalDeliveries - subscription.completedDeliveries);
    }
    if (typeof dto.amountDuePaise === 'number') updateData.amountDuePaise = dto.amountDuePaise;
    if (typeof dto.amountCollectedPaise === 'number') updateData.amountCollectedPaise = dto.amountCollectedPaise;
    if (dto.deliverySlot) {
      updateData.deliveryWindowStartMinute = dto.deliverySlot === 'EVENING' ? 17 * 60 : 6 * 60;
      updateData.deliveryWindowEndMinute = dto.deliverySlot === 'EVENING' ? 20 * 60 : 9 * 60;
    }

    const updated = await prisma.customerSubscription.update({
      where: { id },
      data: updateData,
    });

    await prisma.subscriptionAuditEntry.create({
      data: {
        subscriptionId: id,
        actorUserId: actorId,
        actorRole: Role.ADMIN,
        action: 'ADMIN_MANUAL_SUBSCRIPTION_UPDATED',
        reason: dto.note || 'Admin updated manual subscription parameters',
        metadata: { changes: updateData },
        idempotencyKey: `manual-subscription-update:${id}:${randomUUID()}`,
      },
    });

    return updated;
  }

  async createCustomManualSubscription(dto: {
    storeId: string;
    customerId: string;
    addressId: string;
    totalPricePaise: number;
    initialCashCollectedPaise?: number;
    storeDelivery?: boolean;
    note?: string;
    deliveries: Array<{
      date: string;
      slot: 'AM' | 'PM' | 'BOTH';
      items: Array<{ productId: string; quantity: number; pricePaise: number }>;
    }>;
  }, actorId: string) {
    const store = await prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) throw new NotFoundException('Store not found');

    const customer = await prisma.user.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const address = await prisma.customerAddress.findUnique({ where: { id: dto.addressId, userId: dto.customerId } });
    if (!address) throw new NotFoundException('Delivery address not found or does not belong to this customer');

    if (!dto.deliveries || dto.deliveries.length === 0) {
      throw new BadRequestException('At least one delivery is required');
    }

    const sortedDeliveries = [...dto.deliveries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const startDate = new Date(sortedDeliveries[0].date);
    const endDate = new Date(sortedDeliveries[sortedDeliveries.length - 1].date);
    endDate.setHours(23, 59, 59, 999);

    const totalDeliveries = dto.deliveries.reduce((sum, d) => {
      return sum + (d.slot === 'BOTH' ? 2 : 1);
    }, 0);

    const initialCash = dto.initialCashCollectedPaise || 0;
    const amountDuePaise = Math.max(0, dto.totalPricePaise - initialCash);
    const initialStatus = initialCash >= dto.totalPricePaise ? CustomerSubscriptionStatus.ACTIVE : CustomerSubscriptionStatus.PENDING_CASH_COLLECTION;

    const firstSlot = sortedDeliveries[0].slot;
    const slotStartMinute = firstSlot === 'PM' ? 17 * 60 : 6 * 60;
    const slotEndMinute = firstSlot === 'PM' ? 20 * 60 : 9 * 60;

    const allItems = dto.deliveries.flatMap((d) => d.items);
    if (!allItems.length) {
      throw new BadRequestException('At least one product is required for custom deliveries');
    }
    const productMap = new Map<string, { name: string; totalQuantity: number; weightGrams: number | null }>();
    for (const item of allItems) {
      const existing = productMap.get(item.productId);
      if (existing) {
        existing.totalQuantity += item.quantity;
      } else {
        const product = await prisma.product.findUnique({
          where: { id: item.productId, isActive: true, deletedAt: null },
          select: { name: true, weightGrams: true },
        });
        if (!product) {
          throw new BadRequestException('One or more subscription products are unavailable or deleted');
        }
        if (!Number.isInteger(product.weightGrams) || Number(product.weightGrams) <= 0) {
          throw new BadRequestException(`Product "${product.name}" requires a positive unit weight`);
        }
        productMap.set(item.productId, { name: product.name, totalQuantity: item.quantity, weightGrams: product.weightGrams });
      }
    }

    const syntheticPlanCode = `CUSTOM-${Date.now()}`;
    const syntheticPlan = await prisma.subscriptionPlan.create({
      data: {
        code: syntheticPlanCode,
        internalName: `Custom Plan for ${customer.name || customer.phone}`,
        name: `Custom Plan - ${dto.deliveries.length} days`,
        status: 'ACTIVE',
        fundingCycle: 'FULL_PLAN',
        durationDays: Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
        totalDeliveries,
        deliveryFrequency: 'CUSTOM',
        customSchedule: { type: 'custom', deliveryCount: dto.deliveries.length },
        pricePaise: dto.totalPricePaise,
        mrpPaise: dto.totalPricePaise,
        defaultWindowStartMinute: slotStartMinute,
        defaultWindowEndMinute: slotEndMinute,
        allowPause: false,
        allowSkip: false,
        allowTrustedDrop: false,
        allowPersonalHandover: true,
        allowSecurityHandover: false,
        proofPolicy: { personalHandover: ['OTP', 'GPS'] },
        createdById: actorId,
        updatedById: actorId,
      },
    });

    const itemsSnapshot = Array.from(productMap.entries()).map(([productId, data]) => ({
      productId,
      quantityPerDelivery: data.totalQuantity,
      name: data.name,
      weightGrams: data.weightGrams,
    }));

    const version = await prisma.subscriptionPlanVersion.create({
      data: {
        planId: syntheticPlan.id,
        version: 1,
        pricePaise: dto.totalPricePaise,
        mrpPaise: dto.totalPricePaise,
        currency: 'INR',
        totalDeliveries,
        durationDays: Math.ceil((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
        fundingCycle: 'FULL_PLAN',
        deliveryFrequency: 'CUSTOM',
        selectedWeekdays: [],
        itemsSnapshot,
        deliveryRulesSnapshot: { windowStart: slotStartMinute, windowEnd: slotEndMinute },
        proofPolicySnapshot: { personalHandover: ['OTP', 'GPS'] },
        applicabilitySnapshot: { storeIds: [dto.storeId] },
        fullSnapshot: { items: itemsSnapshot, customDeliveries: dto.deliveries.length },
        createdById: actorId,
      },
    });

    return prisma.$transaction(async (tx) => {
      const subscription = await tx.customerSubscription.create({
        data: {
          customerId: dto.customerId,
          planId: syntheticPlan.id,
          planVersionId: version.id,
          addressId: dto.addressId,
          homeStoreId: store.id,
          source: 'custom_manual',
          status: initialStatus,
          startDate,
          endDate,
          nextDeliveryDate: startDate,
          deliveryWindowStartMinute: slotStartMinute,
          deliveryWindowEndMinute: slotEndMinute,
          deliveryMethod: 'PERSONAL_HANDOVER',
          isCustom: true,
          storeDelivery: dto.storeDelivery || false,
          priceSnapshot: { pricePaise: dto.totalPricePaise, mrpPaise: dto.totalPricePaise, currency: 'INR', manualNote: dto.note, isCustom: true },
          itemsSnapshot,
          addressSnapshot: {
            recipientName: address.recipientName,
            phoneE164: address.phoneE164,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            latitude: address.latitude,
            longitude: address.longitude,
          },
          policySnapshot: { allowPause: false, allowSkip: false, isCustom: true },
          fundedDeliveryCount: totalDeliveries,
          remainingFundedDeliveries: totalDeliveries,
          amountDuePaise,
          amountCollectedPaise: initialCash,
          fundingCycle: 'FULL_PLAN',
        },
      });

      const deliveriesData: Prisma.SubscriptionDeliveryCreateManyInput[] = [];
      let seq = 1;
      let remainingDue = amountDuePaise;

      for (const delivery of sortedDeliveries) {
        const deliveryDate = new Date(delivery.date);
        const slotPricePaise = delivery.items.reduce((sum, i) => sum + i.pricePaise * i.quantity, 0);

        let amDue = delivery.slot === 'BOTH' ? Math.ceil(slotPricePaise / 2) : slotPricePaise;
        let pmDue = delivery.slot === 'BOTH' ? Math.floor(slotPricePaise / 2) : 0;

        if (seq === 1) {
          const firstTotal = amDue + pmDue;
          const deduction = Math.min(initialCash, firstTotal);
          if (delivery.slot === 'BOTH') {
            amDue = Math.max(0, amDue - deduction);
          } else {
            amDue = Math.max(0, amDue - deduction);
          }
        }

        amDue = Math.min(amDue, remainingDue);
        remainingDue -= amDue;

        deliveriesData.push({
          subscriptionId: subscription.id,
          serviceDate: deliveryDate,
          sequenceNumber: seq,
          deliverySlot: delivery.slot === 'BOTH' ? 'AM' : delivery.slot,
          status: SubscriptionDeliveryStatus.SCHEDULED,
          generationKey: `custom:${subscription.id}:${seq}:${delivery.date}:AM`,
          storeId: store.id,
          cashDuePaise: amDue,
          proofMode: SubscriptionProofMode.PERSONAL_OTP_GPS,
        });
        seq++;

        if (delivery.slot === 'BOTH') {
          pmDue = Math.min(pmDue, remainingDue);
          remainingDue -= pmDue;
          deliveriesData.push({
            subscriptionId: subscription.id,
            serviceDate: deliveryDate,
            sequenceNumber: seq,
            deliverySlot: 'PM',
            status: SubscriptionDeliveryStatus.SCHEDULED,
            generationKey: `custom:${subscription.id}:${seq}:${delivery.date}:PM`,
            storeId: store.id,
            cashDuePaise: pmDue,
            proofMode: SubscriptionProofMode.PERSONAL_OTP_GPS,
          });
          seq++;
        }
      }

      await tx.subscriptionDelivery.createMany({ data: deliveriesData, skipDuplicates: true });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: subscription.id,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'ADMIN_CUSTOM_SUBSCRIPTION_CREATED',
          reason: dto.note || 'Created custom manual subscription for offline customer',
          metadata: {
            storeId: store.id,
            customerId: dto.customerId,
            totalDeliveries,
            totalDays: sortedDeliveries.length,
            storeDelivery: dto.storeDelivery || false,
            isCustom: true,
          },
          idempotencyKey: `custom-subscription:${subscription.id}:${randomUUID()}`,
        },
      });

      return subscription;
    });
  }

  async renewSubscription(
    subscriptionId: string,
    dto: {
      additionalDeliveries?: number;
      additionalAmountPaise?: number;
      totalDeliveries?: number;
      startDate?: string;
      isSamePlan?: boolean;
      newPlanId?: string;
      deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH' | 'AM' | 'PM';
      frequency?: 'DAILY' | 'ALTERNATE_DAYS' | 'WEEKDAYS' | 'SELECTED_WEEKDAYS';
      selectedWeekdays?: number[];
      vacationRange?: {
        fromDate?: string;
        toDate?: string;
        policy?: 'EXTEND_PLAN' | 'DEDUCT_BILL';
      };
      splitItems?: {
        amProductName?: string;
        amQuantity?: string;
        pmProductName?: string;
        pmQuantity?: string;
      };
      initialCashCollectedPaise?: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      note?: string;
    },
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.customerSubscription.findUnique({
        where: { id: subscriptionId },
        include: {
          plan: {
            include: {
              items: { include: { product: true } },
              versions: { orderBy: { version: 'desc' }, take: 1 },
            },
          },
          planVersion: true,
          customer: true,
          address: true,
          homeStore: true,
          deliveries: { orderBy: { serviceDate: 'desc' }, take: 1 },
        },
      });

      if (!existing) throw new NotFoundException('Subscription not found');

      // Resolve the target plan (same plan by default, or switched product/plan)
      let targetPlan = existing.plan;
      let targetVersion = existing.planVersion;
      if (dto.newPlanId && dto.newPlanId !== existing.planId) {
        const foundPlan = await tx.subscriptionPlan.findUnique({
          where: { id: dto.newPlanId },
          include: {
            items: { include: { product: true } },
            versions: { orderBy: { version: 'desc' }, take: 1 },
          },
        });
        if (!foundPlan) throw new NotFoundException(`Target plan ${dto.newPlanId} not found`);
        targetPlan = foundPlan;
        targetVersion = foundPlan.versions[0] || existing.planVersion;
      }

      // Calculate cycle number in chain
      const prevPriceSnapshot = (existing.priceSnapshot as any) || {};
      const currentCycle = typeof prevPriceSnapshot.cycleNumber === 'number' ? prevPriceSnapshot.cycleNumber : 1;
      const nextCycleNumber = currentCycle + 1;

      // Idempotency: prevent double-clicks or rapid retries from creating duplicate cycles
      const recentDuplicate = await tx.customerSubscription.findFirst({
        where: {
          customerId: existing.customerId,
          source: 'manual',
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recentDuplicate) {
        const ps = (recentDuplicate.priceSnapshot as any) || {};
        if (ps.previousSubscriptionId === existing.id) {
          return recentDuplicate;
        }
      }

      // Calculate start and end dates
      const lastDelivery = existing.deliveries[0];
      const lastDate = lastDelivery?.serviceDate ?? existing.endDate;
      let startDate: Date;
      if (dto.startDate) {
        startDate = new Date(dto.startDate);
        if (isNaN(startDate.getTime())) throw new BadRequestException('Invalid start date');
      } else {
        startDate = new Date(lastDate.getTime() + 86_400_000);
      }
      startDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 0, 0, 0, 0));

      const totalDeliveries = dto.totalDeliveries || dto.additionalDeliveries || targetPlan.totalDeliveries || 30;
      const rawSlot = dto.deliverySlot || (existing.deliveryWindowStartMinute >= 900 ? 'PM' : 'AM');
      const isSlotBoth = rawSlot === 'BOTH';
      const durationDays = isSlotBoth ? Math.ceil(totalDeliveries / 2) : totalDeliveries;
      const endDate = new Date(startDate.getTime() + (durationDays - 1) * 86_400_000);

      // Financials for this specific renewal cycle
      let cyclePricePaise = targetPlan.pricePaise;
      if (dto.additionalAmountPaise !== undefined && dto.additionalAmountPaise > 0) {
        cyclePricePaise = dto.additionalAmountPaise;
      }

      const initialCash = dto.initialCashCollectedPaise || 0;
      const cycleDuePaise = Math.max(0, cyclePricePaise - initialCash);
      const initialStatus = initialCash >= cyclePricePaise
        ? CustomerSubscriptionStatus.ACTIVE
        : CustomerSubscriptionStatus.PENDING_CASH_COLLECTION;

      const slotStartMinute = rawSlot === 'EVENING' || rawSlot === 'PM' ? 17 * 60 : 6 * 60;
      const slotEndMinute = rawSlot === 'EVENING' || rawSlot === 'PM' ? 20 * 60 : 9 * 60;

      // Close previous subscription gracefully as completed if active
      if (existing.status === CustomerSubscriptionStatus.ACTIVE || existing.status === CustomerSubscriptionStatus.PENDING_CASH_COLLECTION) {
        await tx.customerSubscription.update({
          where: { id: existing.id },
          data: { status: CustomerSubscriptionStatus.COMPLETED },
        });
      }

      // Create new CustomerSubscription for this renewal cycle (isolated financials)
      const renewalSub = await tx.customerSubscription.create({
        data: {
          customerId: existing.customerId,
          planId: targetPlan.id,
          planVersionId: targetVersion?.id || targetPlan.versions[0]?.id || existing.planVersionId,
          addressId: existing.addressId,
          homeStoreId: existing.homeStoreId,
          deliveryZoneId: existing.deliveryZoneId,
          source: 'manual',
          status: initialStatus,
          startDate,
          endDate,
          nextDeliveryDate: startDate,
          deliveryWindowStartMinute: slotStartMinute,
          deliveryWindowEndMinute: slotEndMinute,
          deliveryMethod: existing.deliveryMethod,
          storeDelivery: existing.storeDelivery,
          priceSnapshot: {
            pricePaise: cyclePricePaise,
            mrpPaise: targetPlan.mrpPaise,
            currency: 'INR',
            cycleNumber: nextCycleNumber,
            previousSubscriptionId: existing.id,
            renewalNote: dto.note || null,
            splitItems: dto.splitItems || null,
            initialPaymentMode: dto.paymentMode || (initialCash > 0 ? 'CASH' : null),
          },
          itemsSnapshot: dto.splitItems
            ? [
                { name: dto.splitItems.amProductName || 'AM Milk', quantity: dto.splitItems.amQuantity || '1L', slot: 'AM' },
                { name: dto.splitItems.pmProductName || 'PM Milk', quantity: dto.splitItems.pmQuantity || '1L', slot: 'PM' },
              ]
            : targetPlan.items.map((i) => ({ productId: i.productId, quantityPerDelivery: i.quantityPerDelivery, name: i.product.name })),
          addressSnapshot: existing.addressSnapshot as any,
          policySnapshot: existing.policySnapshot as any,
          fundedDeliveryCount: totalDeliveries,
          remainingFundedDeliveries: totalDeliveries,
          amountDuePaise: cycleDuePaise,
          amountCollectedPaise: initialCash,
          fundingCycle: targetPlan.fundingCycle,
        },
      });

      // Frequency & Vacation scheduling settings
      const frequency = dto.frequency || 'DAILY';
      const stepDays = frequency === 'ALTERNATE_DAYS' ? 2 : 1;
      const vacationFrom = dto.vacationRange?.fromDate ? new Date(dto.vacationRange.fromDate) : null;
      const vacationTo = dto.vacationRange?.toDate ? new Date(dto.vacationRange.toDate) : null;
      const vacationPolicy = dto.vacationRange?.policy || 'EXTEND_PLAN';

      // Generate delivery rows for this new cycle with automated frequency stepping
      const newDeliveries: Prisma.SubscriptionDeliveryCreateManyInput[] = [];
      let curDate = new Date(startDate);
      let seq = 1;
      let lastGeneratedDate = new Date(startDate);

      while (seq <= totalDeliveries) {
        const dayOfWeek = curDate.getUTCDay();

        // Skip weekends if WEEKDAYS
        if (frequency === 'WEEKDAYS' && (dayOfWeek === 0 || dayOfWeek === 6)) {
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        // Skip non-selected weekdays
        if (frequency === 'SELECTED_WEEKDAYS' && dto.selectedWeekdays?.length && !dto.selectedWeekdays.includes(dayOfWeek)) {
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        // Check if falls in planned vacation
        const isVacation = Boolean(vacationFrom && vacationTo && curDate >= vacationFrom && curDate <= vacationTo);
        if (isVacation && vacationPolicy === 'EXTEND_PLAN') {
          // Skip calendar day to extend plan duration
          curDate = new Date(curDate.getTime() + 86_400_000);
          continue;
        }

        let deliverySlot = 'AM';
        if (isSlotBoth) {
          deliverySlot = seq % 2 === 1 ? 'AM' : 'PM';
        } else {
          deliverySlot = rawSlot === 'EVENING' || rawSlot === 'PM' ? 'PM' : 'AM';
        }

        const dateStr = curDate.toISOString().slice(0, 10);
        let deferredReason: string | null = null;
        if (dto.splitItems) {
          const itemText = deliverySlot === 'AM'
            ? `${dto.splitItems.amQuantity || '1L'} ${dto.splitItems.amProductName || 'Milk'}`
            : `${dto.splitItems.pmQuantity || '1L'} ${dto.splitItems.pmProductName || 'Milk'}`;
          deferredReason = `[SPLIT_ITEM: ${itemText}]`;
        }

        newDeliveries.push({
          subscriptionId: renewalSub.id,
          serviceDate: new Date(curDate),
          sequenceNumber: seq,
          deliverySlot,
          status: isVacation ? SubscriptionDeliveryStatus.SKIPPED : SubscriptionDeliveryStatus.SCHEDULED,
          skipReason: isVacation ? 'Planned Vacation' : null,
          generationKey: `renewal:${renewalSub.id}:${seq}:${dateStr}:${deliverySlot}`,
          cashDuePaise: 0,
          cashCollectedPaise: seq === 1 && initialCash > 0 ? initialCash : 0,
          proofMode: SubscriptionProofMode.PERSONAL_OTP_GPS,
          storeId: renewalSub.homeStoreId,
          deferredReason,
        });

        lastGeneratedDate = new Date(curDate);
        seq++;

        // Step date forward based on frequency
        if (isSlotBoth) {
          if (seq % 2 === 1) {
            curDate = new Date(curDate.getTime() + stepDays * 86_400_000);
          }
        } else {
          curDate = new Date(curDate.getTime() + stepDays * 86_400_000);
        }
      }

      await tx.subscriptionDelivery.createMany({ data: newDeliveries, skipDuplicates: true });

      // Update endDate to match actual last generated delivery date
      await tx.customerSubscription.update({
        where: { id: renewalSub.id },
        data: { endDate: lastGeneratedDate },
      });

      // Record audit entry
      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: renewalSub.id,
          actorUserId: actorId,
          actorRole,
          action: 'SUBSCRIPTION_RENEWED',
          reason: dto.note || `Renewed for cycle #${nextCycleNumber} with ${totalDeliveries} deliveries`,
          metadata: {
            previousSubscriptionId: existing.id,
            cycleNumber: nextCycleNumber,
            totalDeliveries,
            cyclePricePaise,
            initialCashCollectedPaise: initialCash,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            splitItems: dto.splitItems || null,
          },
          idempotencyKey: `renewal:${renewalSub.id}:${Date.now()}`,
        },
      });

      // Cancel any remaining unfulfilled scheduled deliveries of the old subscription so they don't clash
      await tx.subscriptionDelivery.updateMany({
        where: {
          subscriptionId: existing.id,
          status: { in: [SubscriptionDeliveryStatus.SCHEDULED, SubscriptionDeliveryStatus.ORDER_GENERATED] },
        },
        data: {
          status: SubscriptionDeliveryStatus.CANCELLED,
          skipReason: `Cancelled due to plan switch / renewal to ${targetPlan.name} (cycle #${nextCycleNumber})`,
        },
      });

      // Mark the old subscription as COMPLETED so it doesn't appear alongside the new one
      if (existing.status !== CustomerSubscriptionStatus.COMPLETED && existing.status !== CustomerSubscriptionStatus.CANCELLED) {
        await tx.customerSubscription.update({
          where: { id: existing.id },
          data: {
            status: CustomerSubscriptionStatus.COMPLETED,
            cancelledAt: new Date(),
            cancellationReason: `Renewed / Switched to cycle #${nextCycleNumber} (${targetPlan.name}, subscription ${renewalSub.id})`,
          },
        });
      }

      return {
        renewalSubscription: renewalSub,
        cycleNumber: nextCycleNumber,
        previousSubscriptionId: existing.id,
        status: renewalSub.status,
        amountDuePaise: cycleDuePaise,
        amountCollectedPaise: initialCash,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 30000 });
  }

  async cancelSubscription(
    subscriptionId: string,
    reason: string,
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.customerSubscription.findUnique({
        where: { id: subscriptionId },
        include: { homeStore: { select: { ownerId: true } }, plan: true, customer: true },
      });
      if (!sub) throw new NotFoundException('Subscription not found');
      if (actorRole !== Role.ADMIN && sub.homeStore?.ownerId !== actorId) {
        throw new ForbiddenException('You do not have access to this subscription');
      }
      if (sub.status === CustomerSubscriptionStatus.CANCELLED) {
        throw new BadRequestException('Subscription is already cancelled');
      }

      // Cancel all future unfulfilled scheduled deliveries
      const cancelledDeliveries = await tx.subscriptionDelivery.updateMany({
        where: {
          subscriptionId,
          status: { in: [SubscriptionDeliveryStatus.SCHEDULED, SubscriptionDeliveryStatus.ORDER_GENERATED] },
        },
        data: {
          status: SubscriptionDeliveryStatus.CANCELLED,
          skipReason: reason?.trim() || 'Cancelled by store owner',
        },
      });

      const updated = await tx.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          status: CustomerSubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason?.trim() || 'Cancelled by store owner',
          cancelledById: actorId,
          nextDeliveryDate: null,
          nextCashCollectionDate: null,
        },
      });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId,
          actorUserId: actorId,
          actorRole,
          action: 'SUBSCRIPTION_CANCELLED',
          reason: reason?.trim() || 'Cancelled by store owner',
          idempotencyKey: `store-cancel:${subscriptionId}:${Date.now()}`,
        },
      });

      return {
        success: true,
        subscription: updated,
        cancelledDeliveriesCount: cancelledDeliveries.count,
        message: `Subscription for ${sub.customer?.name || 'Customer'} has been cancelled. ${cancelledDeliveries.count} scheduled delivery/deliveries cancelled.`,
      };
    });
  }

  async recordCustomerPayment(
    subscriptionId: string,
    dto: {
      amountPaise: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      reference?: string;
      note?: string;
    },
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.customerSubscription.findUnique({
        where: { id: subscriptionId },
      });
      if (!sub) throw new NotFoundException('Subscription not found');

      const outstandingDue = sub.amountDuePaise || 0;
      if (outstandingDue <= 0) {
        throw new BadRequestException('This subscription has no outstanding due balance to collect');
      }

      const amountToCredit = Math.max(0, dto.amountPaise);
      if (amountToCredit <= 0) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
      if (amountToCredit > outstandingDue) {
        throw new BadRequestException(
          `Payment amount (₹${(amountToCredit / 100).toFixed(2)}) cannot exceed outstanding due balance of ₹${(outstandingDue / 100).toFixed(2)}`,
        );
      }

      const newCollected = (sub.amountCollectedPaise || 0) + amountToCredit;
      const newDue = Math.max(0, outstandingDue - amountToCredit);
      const newStatus = newDue === 0 && sub.status === CustomerSubscriptionStatus.PENDING_CASH_COLLECTION
        ? CustomerSubscriptionStatus.ACTIVE
        : sub.status;

      const updated = await tx.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          amountCollectedPaise: newCollected,
          amountDuePaise: newDue,
          status: newStatus,
        },
      });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: actorId,
          actorRole,
          action: 'PAYMENT_RECORDED',
          reason: dto.note || `Recorded payment of ₹${(amountToCredit / 100).toFixed(2)} via ${dto.paymentMode || 'CASH'}`,
          metadata: {
            amountPaise: amountToCredit,
            paymentMode: dto.paymentMode || 'CASH',
            reference: dto.reference || null,
            previousCollectedPaise: sub.amountCollectedPaise,
            newCollectedPaise: newCollected,
            previousDuePaise: sub.amountDuePaise,
            newDuePaise: newDue,
          },
          idempotencyKey: `payment:${sub.id}:${Date.now()}:${randomUUID()}`,
        },
      });

      return {
        subscriptionId: sub.id,
        amountCollectedPaise: newCollected,
        amountDuePaise: newDue,
        status: newStatus,
        paymentRecordedPaise: amountToCredit,
        paymentMode: dto.paymentMode || 'CASH',
      };
    });
  }
}

