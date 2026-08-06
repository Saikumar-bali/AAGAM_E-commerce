import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CustomerSubscriptionStatus,
  Prisma,
  Role,
  SubscriptionDeliveryMethod,
  SubscriptionDeliveryStatus,
  SubscriptionFundingCycle,
  SubscriptionPlanStatus,
  SubscriptionProofMode,
  prisma,
} from '@aagam/database';
import { createHash, randomUUID } from 'crypto';
import {
  CancelSubscriptionDto,
  CreateCustomerSubscriptionDto,
  PauseSubscriptionDto,
  QuoteSubscriptionDto,
  ReportSubscriptionIssueDto,
  ResumeSubscriptionDto,
  SkipSubscriptionDeliveryDto,
  UpdateSubscriptionPreferencesDto,
} from './subscriptions.dto';
import {
  addUtcDays,
  serviceWindow,
  startOfUtcDay,
  SubscriptionCalendarService,
} from './subscription-calendar.service';
import { nullableJson, requiredJson } from '../common/prisma-json';


type DeliveryMethodPolicy = {
  allowTrustedDrop: boolean;
  allowPersonalHandover: boolean;
  allowSecurityHandover: boolean;
};

type FundingPlan = {
  fundingCycle: SubscriptionFundingCycle;
  pricePaise: number;
  totalDeliveries: number;
};

const ownedInclude = {
  plan: { select: { id: true, code: true, name: true, imageUrl: true, mobileImageUrl: true } },
  planVersion: true,
  address: true,
  homeStore: { select: { id: true, name: true } },
  deliveries: {
    orderBy: { serviceDate: 'asc' as const },
    include: {
      order: { select: { id: true, status: true, grandTotalPaise: true } },
      deliveryJob: { select: { id: true, status: true, currentRiderId: true } },
      runStop: { select: { id: true, deliveryRunId: true, status: true, proofReference: true } },
    },
  },
  fundingAllocations: {
    where: { status: 'ALLOCATED' as const },
    orderBy: { createdAt: 'desc' as const },
    include: { codLedger: { select: { id: true, collectionTimestamp: true, expectedAmountPaise: true, status: true } } },
  },
  issues: { orderBy: { createdAt: 'desc' as const } },
};

@Injectable()
export class CustomerSubscriptionService {
  constructor(private readonly calendar: SubscriptionCalendarService) {}

  private tokenHash(token?: string) {
    return token ? createHash('sha256').update(token.trim()).digest('hex') : null;
  }

  private proofMode(method: SubscriptionDeliveryMethod) {
    if (method === SubscriptionDeliveryMethod.TRUSTED_DROP) {
      return SubscriptionProofMode.TRUSTED_DROP_GEOFENCE_TOKEN_PHOTO;
    }
    if (method === SubscriptionDeliveryMethod.SECURITY_RECEPTION) {
      return SubscriptionProofMode.SECURITY_RECEPTION_OTP_GPS;
    }
    return SubscriptionProofMode.PERSONAL_OTP_GPS;
  }

  private assertMethodAllowed(plan: DeliveryMethodPolicy, method: SubscriptionDeliveryMethod, dropPointToken?: string) {
    if (method === SubscriptionDeliveryMethod.TRUSTED_DROP) {
      if (!plan.allowTrustedDrop) throw new BadRequestException('Trusted drop is not allowed for this plan');
      if (!dropPointToken || dropPointToken.trim().length < 6) {
        throw new BadRequestException('A secure drop-point token is required for trusted drop');
      }
    }
    if (method === SubscriptionDeliveryMethod.PERSONAL_HANDOVER && !plan.allowPersonalHandover) {
      throw new BadRequestException('Personal handover is not allowed for this plan');
    }
    if (method === SubscriptionDeliveryMethod.SECURITY_RECEPTION && !plan.allowSecurityHandover) {
      throw new BadRequestException('Security or reception handover is not allowed for this plan');
    }
  }

  private validateStart(startDate: string) {
    const start = startOfUtcDay(startDate);
    const today = startOfUtcDay(new Date());
    if (start < today) throw new BadRequestException('Subscription start date cannot be in the past');
    if (start > addUtcDays(today, 90)) throw new BadRequestException('Subscription start date is too far in the future');
    return start;
  }

  private async planForCustomer(planId: string) {
    const now = new Date();
    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        id: planId,
        status: SubscriptionPlanStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: {
        items: { include: { product: true } },
        stores: true,
        zones: true,
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (!plan.versions[0]) throw new ConflictException('Subscription plan is not published correctly');
    return plan;
  }

  private firstFunding(plan: FundingPlan) {
    if (plan.fundingCycle === SubscriptionFundingCycle.FULL_PLAN) {
      return { amountPaise: plan.pricePaise, endsAtSequence: plan.totalDeliveries, fundedDeliveryCount: plan.totalDeliveries };
    }
    return this.calendar.fundingAmount(plan.pricePaise, plan.totalDeliveries, 1, 7);
  }

  private cashDueForSequence(plan: FundingPlan, sequence: number) {
    if (sequence === 1) return this.firstFunding(plan).amountPaise;
    if (plan.fundingCycle !== SubscriptionFundingCycle.WEEKLY || (sequence - 1) % 7 !== 0) return 0;
    return this.calendar.fundingAmount(plan.pricePaise, plan.totalDeliveries, sequence, 7).amountPaise;
  }

  async quote(customerId: string, planId: string, dto: QuoteSubscriptionDto) {
    const plan = await this.planForCustomer(planId);
    const address = await prisma.customerAddress.findFirst({ where: { id: dto.addressId, userId: customerId } });
    if (!address) throw new NotFoundException('Address not found');
    this.assertMethodAllowed(plan, dto.deliveryMethod, dto.deliveryMethod === 'TRUSTED_DROP' ? 'quote-token' : undefined);
    const startDate = this.validateStart(dto.startDate);
    const dates = this.calendar.buildServiceDates(plan, startDate);
    const firstFunding = this.firstFunding(plan);
    return {
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        imageUrl: plan.imageUrl,
        pricePaise: plan.pricePaise,
        mrpPaise: plan.mrpPaise,
        savingsPaise: Math.max(0, plan.mrpPaise - plan.pricePaise),
        currency: plan.currency,
        fundingCycle: plan.fundingCycle,
        totalDeliveries: plan.totalDeliveries,
        items: plan.items.map((item) => ({
          productId: item.productId,
          name: item.product.name,
          image: item.product.image,
          quantityPerDelivery: item.quantityPerDelivery,
        })),
      },
      startDate,
      endDate: dates[dates.length - 1],
      deliveryDates: dates,
      deliveryWindowStartMinute: dto.deliveryWindowStartMinute ?? plan.defaultWindowStartMinute,
      deliveryWindowEndMinute: dto.deliveryWindowEndMinute ?? plan.defaultWindowEndMinute,
      deliveryMethod: dto.deliveryMethod,
      firstCashCollectionPaise: firstFunding.amountPaise,
      firstFundingDeliveryCount: firstFunding.fundedDeliveryCount,
      laterFundedDeliveryAmountPaise: 0,
      confirmationMessage: `Subscription requested — ₹${(firstFunding.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })} will be collected during the first verified delivery.`,
      skipPolicy: {
        allowSkip: plan.allowSkip,
        maximumSkips: plan.maximumSkips,
        skipCutoffHours: plan.skipCutoffHours,
        policy: plan.skipPolicy,
      },
      pausePolicy: { allowPause: plan.allowPause },
      proofPolicy: plan.proofPolicy,
      address,
    };
  }

  async create(customerId: string, dto: CreateCustomerSubscriptionDto, idempotencyKey?: string) {
    const plan = await this.planForCustomer(dto.planId);
    const address = await prisma.customerAddress.findFirst({ where: { id: dto.addressId, userId: customerId } });
    if (!address) throw new NotFoundException('Address not found');
    this.assertMethodAllowed(plan, dto.deliveryMethod, dto.dropPointToken);
    const startDate = this.validateStart(dto.startDate);
    const windowStart = dto.deliveryWindowStartMinute ?? plan.defaultWindowStartMinute;
    const windowEnd = dto.deliveryWindowEndMinute ?? plan.defaultWindowEndMinute;
    serviceWindow(startDate, windowStart, windowEnd);
    const dates = this.calendar.buildServiceDates(plan, startDate);
    const version = plan.versions[0];
    const firstFunding = this.firstFunding(plan);
    const requestKey = idempotencyKey?.trim() || randomUUID();

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-create:${customerId}:${requestKey}`}))`);
      const existingAudit = await tx.subscriptionAuditEntry.findUnique({
        where: { idempotencyKey: `subscription-create:${customerId}:${requestKey}` },
        include: { subscription: { include: ownedInclude } },
      });
      if (existingAudit) return this.publicSubscription(existingAudit.subscription);

      const created = await tx.customerSubscription.create({
        data: {
          customerId,
          planId: plan.id,
          planVersionId: version.id,
          addressId: address.id,
          homeStoreId: plan.stores.length === 1 ? plan.stores[0].storeId : null,
          status: CustomerSubscriptionStatus.PENDING_CASH_COLLECTION,
          startDate,
          endDate: dates[dates.length - 1],
          nextDeliveryDate: dates[0],
          nextCashCollectionDate: dates[0],
          deliveryWindowStartMinute: windowStart,
          deliveryWindowEndMinute: windowEnd,
          deliveryMethod: dto.deliveryMethod,
          trustedDropInstructions: dto.trustedDropInstructions?.trim() || null,
          dropPointTokenHash: this.tokenHash(dto.dropPointToken),
          priceSnapshot: requiredJson({
            pricePaise: version.pricePaise,
            mrpPaise: version.mrpPaise,
            currency: version.currency,
            version: version.version,
          }, 'priceSnapshot'),
          itemsSnapshot: requiredJson(version.itemsSnapshot, 'itemsSnapshot'),
          addressSnapshot: requiredJson({
            id: address.id,
            label: address.label,
            recipientName: address.recipientName,
            phoneE164: address.phoneE164,
            alternatePhoneE164: address.alternatePhoneE164,
            line1: address.line1,
            line2: address.line2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            country: address.country,
            latitude: address.latitude,
            longitude: address.longitude,
            instructions: address.instructions,
          }, 'addressSnapshot'),
          policySnapshot: requiredJson({
            deliveryRules: version.deliveryRulesSnapshot,
            proofPolicy: version.proofPolicySnapshot,
            applicability: version.applicabilitySnapshot,
          }, 'policySnapshot'),
          amountDuePaise: firstFunding.amountPaise,
          fundingCycle: plan.fundingCycle,
          deliveries: {
            create: dates.map((serviceDate, index) => ({
              serviceDate,
              sequenceNumber: index + 1,
              generationKey: `subscription:${requestKey}:${index + 1}:${serviceDate.toISOString().slice(0, 10)}`,
              cashDuePaise: this.cashDueForSequence(plan, index + 1),
              proofMode: this.proofMode(dto.deliveryMethod),
            })),
          },
        },
        include: ownedInclude,
      });
      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: created.id,
          actorUserId: customerId,
          actorRole: Role.CUSTOMER,
          action: 'SUBSCRIPTION_CREATED',
          metadata: {
            planId: plan.id,
            planVersionId: version.id,
            firstCashCollectionPaise: firstFunding.amountPaise,
          },
          idempotencyKey: `subscription-create:${customerId}:${requestKey}`,
        },
      });
      return this.publicSubscription(created);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  listMine(customerId: string) {
    return prisma.customerSubscription.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { id: true, code: true, name: true, imageUrl: true, mobileImageUrl: true } },
        homeStore: { select: { id: true, name: true } },
        deliveries: {
          where: { status: { not: SubscriptionDeliveryStatus.CANCELLED } },
          orderBy: { serviceDate: 'asc' },
          take: 4,
          select: { id: true, serviceDate: true, sequenceNumber: true, status: true, cashDuePaise: true, order: { select: { id: true } } },
        },
      },
    }).then((rows) => rows.map((row) => this.publicSubscription(row)));
  }

  async getMine(customerId: string, id: string) {
    const subscription = await prisma.customerSubscription.findFirst({
      where: { id, customerId },
      include: ownedInclude,
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    return this.publicSubscription(subscription);
  }

  async calendarHistory(customerId: string, id: string) {
    await this.assertOwned(customerId, id);
    return prisma.subscriptionDelivery.findMany({
      where: { subscriptionId: id },
      orderBy: { serviceDate: 'asc' },
      include: {
        order: { include: { payment: true, deliveryProof: true } },
        runStop: { include: { deliveryRun: { select: { routeCode: true, status: true, riderId: true } } } },
      },
    });
  }

  private async assertOwned(customerId: string, id: string) {
    const subscription = await prisma.customerSubscription.findFirst({
      where: { id, customerId },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }

  async skip(customerId: string, subscriptionId: string, deliveryId: string, dto: SkipSubscriptionDeliveryDto, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-skip:${subscriptionId}`}))`);
      const subscription = await tx.customerSubscription.findFirst({
        where: { id: subscriptionId, customerId },
        include: { plan: true },
      });
      if (!subscription) throw new NotFoundException('Subscription not found');
      const key = idempotencyKey || `subscription-skip:${deliveryId}`;
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.subscriptionId !== subscriptionId) throw new ConflictException('Idempotency key belongs to another subscription');
        return tx.subscriptionDelivery.findUnique({ where: { id: deliveryId } });
      }
      if (!subscription.plan.allowSkip) throw new ForbiddenException('Skipping is not allowed for this plan');
      if (subscription.skippedDeliveries >= subscription.plan.maximumSkips) {
        throw new BadRequestException('Maximum subscription skips reached');
      }
      const delivery = await tx.subscriptionDelivery.findFirst({
        where: { id: deliveryId, subscriptionId },
      });
      if (!delivery) throw new NotFoundException('Subscription delivery not found');
      if (delivery.status !== SubscriptionDeliveryStatus.SCHEDULED) {
        throw new ConflictException('Only an ungenerated scheduled delivery can be skipped');
      }
      const cutoff = new Date(delivery.serviceDate.getTime() - subscription.plan.skipCutoffHours * 3_600_000);
      if (new Date() >= cutoff) throw new BadRequestException('The skip cutoff has passed');
      await tx.subscriptionDelivery.update({
        where: { id: deliveryId },
        data: { status: SubscriptionDeliveryStatus.SKIPPED, skippedAt: new Date(), skipReason: dto.reason?.trim() || 'CUSTOMER_REQUEST' },
      });
      if (delivery.cashDuePaise > 0) {
        const next = await tx.subscriptionDelivery.findFirst({
          where: { subscriptionId, status: SubscriptionDeliveryStatus.SCHEDULED, serviceDate: { gt: delivery.serviceDate } },
          orderBy: { serviceDate: 'asc' },
        });
        if (next) await tx.subscriptionDelivery.update({ where: { id: next.id }, data: { cashDuePaise: delivery.cashDuePaise } });
      }
      const latest = await tx.subscriptionDelivery.findFirst({
        where: { subscriptionId }, orderBy: [{ serviceDate: 'desc' }, { sequenceNumber: 'desc' }],
      });
      if (!latest) throw new ConflictException('Subscription calendar is empty');
      const extensionDate = this.calendar.nextAfter(subscription.plan, latest.serviceDate, subscription.startDate);
      await tx.subscriptionDelivery.create({
        data: {
          subscriptionId,
          serviceDate: extensionDate,
          sequenceNumber: latest.sequenceNumber + 1,
          generationKey: `subscription:${subscriptionId}:extension:${latest.sequenceNumber + 1}:${extensionDate.toISOString().slice(0, 10)}`,
          cashDuePaise: 0,
          proofMode: this.proofMode(subscription.deliveryMethod),
          rescheduledFromDate: delivery.serviceDate,
        },
      });
      await tx.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          skippedDeliveries: { increment: 1 },
          endDate: extensionDate,
          nextDeliveryDate: await this.nextScheduledDate(tx, subscriptionId),
        },
      });
      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId,
          actorUserId: customerId,
          actorRole: Role.CUSTOMER,
          action: 'DELIVERY_SKIPPED_AND_PLAN_EXTENDED',
          reason: dto.reason?.trim() || null,
          metadata: { deliveryId, skippedDate: delivery.serviceDate, extensionDate },
          idempotencyKey: key,
        },
      });
      return { deliveryId, skippedDate: delivery.serviceDate, revisedEndDate: extensionDate };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async nextScheduledDate(tx: Prisma.TransactionClient, subscriptionId: string) {
    const row = await tx.subscriptionDelivery.findFirst({
      where: { subscriptionId, status: SubscriptionDeliveryStatus.SCHEDULED, serviceDate: { gte: startOfUtcDay(new Date()) } },
      orderBy: { serviceDate: 'asc' }, select: { serviceDate: true },
    });
    return row?.serviceDate ?? null;
  }

  async pause(customerId: string, id: string, dto: PauseSubscriptionDto, idempotencyKey?: string) {
    const subscription = await this.assertOwned(customerId, id);
    const effective = startOfUtcDay(dto.effectiveFrom);
    const key = idempotencyKey || `subscription-pause:${id}:${effective.toISOString()}`;
    const prior = await prisma.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
    if (prior) return this.getMine(customerId, id);
    if (!subscription.plan.allowPause) throw new ForbiddenException('Pausing is not allowed for this plan');
    if (![CustomerSubscriptionStatus.ACTIVE, CustomerSubscriptionStatus.PAYMENT_DUE, CustomerSubscriptionStatus.GRACE_PERIOD].some((status) => status === subscription.status)) {
      throw new BadRequestException(`Subscription cannot be paused from ${subscription.status}`);
    }
    if (effective < addUtcDays(startOfUtcDay(new Date()), 1)) {
      throw new BadRequestException('Pause must start from a future service day');
    }
    return prisma.$transaction(async (tx) => {
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return tx.customerSubscription.findUnique({ where: { id } });
      const updated = await tx.customerSubscription.update({
        where: { id },
        data: {
          status: CustomerSubscriptionStatus.PAUSED,
          pausedAt: new Date(),
          pauseEffectiveFrom: effective,
          pauseReason: dto.reason?.trim() || null,
        },
      });
      await tx.subscriptionAuditEntry.create({ data: {
        subscriptionId: id, actorUserId: customerId, actorRole: Role.CUSTOMER,
        action: 'SUBSCRIPTION_PAUSED', reason: dto.reason?.trim() || null,
        metadata: { effectiveFrom: effective }, idempotencyKey: key,
      }});
      return this.publicSubscription(updated);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async resume(customerId: string, id: string, dto: ResumeSubscriptionDto, idempotencyKey?: string) {
    const subscription = await this.assertOwned(customerId, id);
    const resumeFrom = startOfUtcDay(dto.resumeFrom || new Date());
    const key = idempotencyKey || `subscription-resume:${id}:${resumeFrom.toISOString()}`;
    const prior = await prisma.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
    if (prior) return this.getMine(customerId, id);
    if (subscription.status !== CustomerSubscriptionStatus.PAUSED || !subscription.pausedAt) {
      throw new BadRequestException('Subscription is not paused');
    }
    const effective = subscription.pauseEffectiveFrom ?? startOfUtcDay(subscription.pausedAt);
    const shiftDays = Math.max(0, Math.ceil((resumeFrom.getTime() - effective.getTime()) / 86_400_000));
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-resume:${id}`}))`);
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return tx.customerSubscription.findUnique({ where: { id } });
      if (shiftDays > 0) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "SubscriptionDelivery"
          SET "serviceDate" = "serviceDate" + (${shiftDays} * INTERVAL '1 day'),
              "rescheduledFromDate" = COALESCE("rescheduledFromDate", "serviceDate"),
              "rescheduledToDate" = "serviceDate" + (${shiftDays} * INTERVAL '1 day'),
              "updatedAt" = NOW()
          WHERE "subscriptionId" = ${id}
            AND "status" = 'SCHEDULED'::"SubscriptionDeliveryStatus"
            AND "serviceDate" >= ${effective}
        `);
      }
      const latest = await tx.subscriptionDelivery.findFirst({ where: { subscriptionId: id }, orderBy: { serviceDate: 'desc' } });
      const next = await this.nextScheduledDate(tx, id);
      const updated = await tx.customerSubscription.update({
        where: { id },
        data: {
          status: subscription.remainingFundedDeliveries > 0 ? CustomerSubscriptionStatus.ACTIVE : CustomerSubscriptionStatus.PAYMENT_DUE,
          resumedAt: new Date(), pausedAt: null, pauseEffectiveFrom: null, pauseReason: null,
          endDate: latest?.serviceDate ?? subscription.endDate,
          nextDeliveryDate: next,
        },
      });
      await tx.subscriptionAuditEntry.create({ data: {
        subscriptionId: id, actorUserId: customerId, actorRole: Role.CUSTOMER,
        action: 'SUBSCRIPTION_RESUMED', metadata: { resumeFrom, shiftDays }, idempotencyKey: key,
      }});
      return this.publicSubscription(updated);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updatePreferences(customerId: string, id: string, dto: UpdateSubscriptionPreferencesDto, idempotencyKey?: string) {
    const subscription = await this.assertOwned(customerId, id);
    const method = dto.deliveryMethod ?? subscription.deliveryMethod;
    this.assertMethodAllowed(subscription.plan, method, dto.dropPointToken || (method === 'TRUSTED_DROP' && subscription.dropPointTokenHash ? 'existing-token' : undefined));
    const startMinute = dto.deliveryWindowStartMinute ?? subscription.deliveryWindowStartMinute;
    const endMinute = dto.deliveryWindowEndMinute ?? subscription.deliveryWindowEndMinute;
    serviceWindow(new Date(), startMinute, endMinute);
    return prisma.$transaction(async (tx) => {
      const key = idempotencyKey || `subscription-preferences:${id}:${randomUUID()}`;
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        if (existing.subscriptionId !== id) throw new ConflictException('Idempotency key belongs to another subscription');
        const current = await tx.customerSubscription.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Subscription not found');
        return this.publicSubscription(current);
      }
      const updated = await tx.customerSubscription.update({
        where: { id },
        data: {
          deliveryMethod: method,
          trustedDropInstructions: dto.trustedDropInstructions === undefined ? undefined : dto.trustedDropInstructions.trim() || null,
          dropPointTokenHash: dto.dropPointToken ? this.tokenHash(dto.dropPointToken) : undefined,
          deliveryWindowStartMinute: startMinute,
          deliveryWindowEndMinute: endMinute,
        },
      });
      await tx.subscriptionDelivery.updateMany({
        where: { subscriptionId: id, status: SubscriptionDeliveryStatus.SCHEDULED },
        data: { proofMode: this.proofMode(method) },
      });
      await tx.subscriptionAuditEntry.create({ data: {
        subscriptionId: id, actorUserId: customerId, actorRole: Role.CUSTOMER,
        action: 'DELIVERY_PREFERENCES_UPDATED', metadata: { method, startMinute, endMinute }, idempotencyKey: key,
      }});
      return this.publicSubscription(updated);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async cancel(customerId: string, id: string, dto: CancelSubscriptionDto, idempotencyKey?: string) {
    const subscription = await this.assertOwned(customerId, id);
    const key = idempotencyKey || `subscription-cancel:${id}`;
    const prior = await prisma.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
    if (prior) return this.getMine(customerId, id);
    if ([CustomerSubscriptionStatus.CANCELLED, CustomerSubscriptionStatus.COMPLETED].some((status) => status === subscription.status)) {
      throw new BadRequestException(`Subscription is already ${subscription.status.toLowerCase()}`);
    }
    return prisma.$transaction(async (tx) => {
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return tx.customerSubscription.findUnique({ where: { id } });
      await tx.subscriptionDelivery.updateMany({
        where: { subscriptionId: id, status: SubscriptionDeliveryStatus.SCHEDULED },
        data: { status: SubscriptionDeliveryStatus.CANCELLED },
      });
      const updated = await tx.customerSubscription.update({
        where: { id },
        data: {
          status: CustomerSubscriptionStatus.CANCELLED,
          cancelledAt: new Date(), cancellationReason: dto.reason.trim(), cancelledById: customerId,
          nextDeliveryDate: null, nextCashCollectionDate: null,
        },
      });
      await tx.subscriptionAuditEntry.create({ data: {
        subscriptionId: id, actorUserId: customerId, actorRole: Role.CUSTOMER,
        action: 'SUBSCRIPTION_CANCELLED', reason: dto.reason.trim(), idempotencyKey: key,
      }});
      return this.publicSubscription(updated);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async currentTracking(customerId: string, id: string) {
    await this.assertOwned(customerId, id);
    const delivery = await prisma.subscriptionDelivery.findFirst({
      where: {
        subscriptionId: id,
        order: { isNot: null },
        status: { in: [
          SubscriptionDeliveryStatus.ORDER_GENERATED,
          SubscriptionDeliveryStatus.PREPARING,
          SubscriptionDeliveryStatus.PACKED,
          SubscriptionDeliveryStatus.ASSIGNED,
          SubscriptionDeliveryStatus.OUT_FOR_DELIVERY,
        ] },
      },
      orderBy: { serviceDate: 'asc' },
      include: { order: { include: { deliveryJob: true } } },
    });
    return delivery ? {
      subscriptionDeliveryId: delivery.id,
      orderId: delivery.order?.id,
      deliveryJobId: delivery.deliveryJobId,
      orderStatus: delivery.order?.status,
      deliveryJobStatus: delivery.order?.deliveryJob?.status,
      trackingPath: `/shop/orders/${delivery.order?.id}`,
    } : null;
  }

  async reportIssue(
    customerId: string,
    id: string,
    deliveryId: string,
    dto: ReportSubscriptionIssueDto,
    idempotencyKey?: string,
  ) {
    await this.assertOwned(customerId, id);
    const delivery = await prisma.subscriptionDelivery.findFirst({ where: { id: deliveryId, subscriptionId: id } });
    if (!delivery) throw new NotFoundException('Subscription delivery not found');
    const key = idempotencyKey || `subscription-issue:${customerId}:${id}:${deliveryId}:${randomUUID()}`;
    const existing = await prisma.subscriptionIssueReport.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.customerId !== customerId || existing.subscriptionId !== id) {
        throw new ConflictException('Idempotency key belongs to another issue report');
      }
      return existing;
    }
    return prisma.subscriptionIssueReport.create({
      data: {
        subscriptionId: id,
        subscriptionDeliveryId: deliveryId,
        customerId,
        type: dto.type,
        description: dto.description.trim(),
        evidence: nullableJson(dto.evidence, 'issue evidence'),
        idempotencyKey: key,
      },
    });
  }

  private publicSubscription<T extends object>(subscription: T): Omit<T, 'dropPointTokenHash'> {
    const { dropPointTokenHash: _privateTokenHash, ...publicValue } = subscription as T & {
      dropPointTokenHash?: unknown;
    };
    return publicValue;
  }
}
