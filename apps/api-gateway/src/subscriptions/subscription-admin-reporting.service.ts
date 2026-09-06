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
import { DeliveryJobStatus } from '@aagam/types';
import { AdminSubscriptionCorrectionDto, ResolveSubscriptionIssueDto } from './subscriptions.dto';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { isOneOf } from '../common/enum-membership';

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

  async createOfflineCustomer(dto: { name: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string; latitude?: number; longitude?: number }) {
    const compactPhone = dto.phone.trim().replace(/[\s().-]/g, '');
    let customer = await prisma.user.findFirst({
      where: { OR: [{ phone: compactPhone }, { phone: dto.phone.trim() }] },
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
        },
      });
    } else if (dto.name.trim() && !customer.name) {
      customer = await prisma.user.update({
        where: { id: customer.id },
        data: { name: dto.name.trim() },
      });
    }

    const address = await prisma.customerAddress.create({
      data: {
        customerId: customer.id,
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
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        locationSource: dto.latitude != null ? 'MAP_PIN' : 'GEOCODED',
        isDefault: true,
      },
    });

    return { customer, address };
  }

  async createManualSubscription(dto: { storeId: string; planId: string; customerId: string; addressId: string; startDate: string; totalDeliveries: number; deliverySlot?: 'MORNING' | 'EVENING' | 'BOTH'; initialCashCollectedPaise?: number; note?: string }, actorId: string) {
    const store = await prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) throw new NotFoundException('Store not found');

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 }, items: { include: { product: true } } },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    const version = plan.versions[0];
    if (!version) throw new NotFoundException('Plan version missing');

    const address = await prisma.customerAddress.findUnique({ where: { id: dto.addressId } });
    if (!address) throw new NotFoundException('Delivery address not found');

    const start = new Date(dto.startDate);
    if (isNaN(start.getTime())) throw new BadRequestException('Invalid start date');

    const durationDays = Math.ceil(dto.totalDeliveries / (dto.deliverySlot === 'BOTH' ? 2 : 1));
    const end = new Date(start.getTime() + durationDays * 86_400_000);

    const pricePaise = plan.pricePaise;
    const initialCash = dto.initialCashCollectedPaise || 0;
    const amountDuePaise = Math.max(0, pricePaise - initialCash);
    const initialStatus = initialCash >= pricePaise ? CustomerSubscriptionStatus.ACTIVE : CustomerSubscriptionStatus.PENDING_CASH_COLLECTION;

    const slotStartMinute = dto.deliverySlot === 'EVENING' ? 17 * 60 : 6 * 60;
    const slotEndMinute = dto.deliverySlot === 'EVENING' ? 20 * 60 : 9 * 60;

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
          priceSnapshot: { pricePaise, mrpPaise: plan.mrpPaise, currency: 'INR', manualNote: dto.note },
          itemsSnapshot: plan.items.map((i) => ({ productId: i.productId, quantityPerDelivery: i.quantityPerDelivery, name: i.product.name })),
          addressSnapshot: {
            recipientName: address.recipientName,
            phoneE164: address.phoneE164,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
          },
          policySnapshot: { allowPause: plan.allowPause, allowSkip: plan.allowSkip },
          fundedDeliveryCount: dto.totalDeliveries,
          remainingFundedDeliveries: dto.totalDeliveries,
          amountDuePaise,
          amountCollectedPaise: initialCash,
          fundingCycle: plan.fundingCycle,
        },
      });

      // Generate delivery calendar rows
      const deliveriesData = [];
      let curDate = new Date(start);
      for (let seq = 1; seq <= dto.totalDeliveries; seq++) {
        deliveriesData.push({
          subscriptionId: subscription.id,
          serviceDate: new Date(curDate),
          sequenceNumber: seq,
          status: SubscriptionDeliveryStatus.SCHEDULED,
          generationKey: `manual:${subscription.id}:${seq}:${curDate.toISOString().slice(0, 10)}`,
          storeId: store.id,
          cashDuePaise: seq === 1 ? amountDuePaise : 0,
        });
        if (dto.deliverySlot !== 'BOTH' || seq % 2 === 0) {
          curDate.setDate(curDate.getDate() + 1);
        }
      }
      await tx.subscriptionDelivery.createMany({ data: deliveriesData, skipDuplicates: true });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: subscription.id,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'ADMIN_MANUAL_SUBSCRIPTION_CREATED',
          reason: dto.note || 'Created manual subscription for store customer',
          metadata: { storeId: store.id, planId: plan.id, totalDeliveries: dto.totalDeliveries, deliverySlot: dto.deliverySlot },
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
      },
    });

    return updated;
  }
}

