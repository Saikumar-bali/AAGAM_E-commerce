import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  CustomerSubscriptionStatus,
  DeliveryRunStatus,
  NotificationEventType,
  Prisma,
  Role,
  SubscriptionDeliveryStatus,
  SubscriptionPlanStatus,
  prisma,
} from '@aagam/database';
import { randomUUID } from 'crypto';
import { RegionalRoutePlanningService } from './regional-route-planning.service';
import {
  StoreStockReadinessDecision,
  UpdateSubscriptionPreparationPolicyDto,
} from './subscription-preparation.dto';

type Actor = { id: string; role: Role };
type JsonRecord = Record<string, unknown>;

const PREPARATION_ACTION_READY = 'STORE_STOCK_READY';
const PREPARATION_ACTION_SHORTAGE = 'STORE_STOCK_SHORTAGE';
const TERMINAL_DELIVERY_STATUSES: SubscriptionDeliveryStatus[] = [
  SubscriptionDeliveryStatus.DELIVERED,
  SubscriptionDeliveryStatus.FAILED,
  SubscriptionDeliveryStatus.SKIPPED,
  SubscriptionDeliveryStatus.CANCELLED,
];

function startOfUtcDay(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86_400_000);
}

function jsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function snapshotItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = jsonRecord(raw);
    const productId = String(item.productId || '');
    const name = String(item.productName || item.name || 'Subscription item');
    const quantity = Number(item.quantityPerDelivery ?? item.quantity ?? 0);
    return productId && Number.isFinite(quantity) && quantity > 0
      ? [{ productId, name, quantity }]
      : [];
  });
}

function deliveryAddress(snapshot: unknown) {
  const address = jsonRecord(snapshot);
  const parts = [
    address.line1,
    address.line2,
    address.landmark,
    address.city,
    address.state,
    address.pincode,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return {
    recipientName: String(address.recipientName || '').trim() || null,
    phone: String(address.phoneE164 || address.phone || '').trim() || null,
    alternatePhone: String(address.alternatePhoneE164 || '').trim() || null,
    formattedAddress: parts.join(', ') || null,
    latitude: Number.isFinite(Number(address.latitude)) ? Number(address.latitude) : null,
    longitude: Number.isFinite(Number(address.longitude)) ? Number(address.longitude) : null,
    instructions: String(address.instructions || '').trim() || null,
  };
}

@Injectable()
export class SubscriptionPreparationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionPreparationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly regionalPlanner: RegionalRoutePlanningService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const intervalMs = Math.max(60_000, Number(process.env.SUBSCRIPTION_PREPARATION_INTERVAL_MS || 5 * 60_000));
    this.timer = setInterval(() => void this.flush(), intervalMs);
    this.timer.unref?.();
    void this.flush();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private minimumPreparationHours() {
    return Math.max(1, Math.min(72, Number(process.env.SUBSCRIPTION_MIN_PREPARATION_HOURS || 24)));
  }

  private finalAssignmentHours() {
    return Math.max(1, Math.min(12, Number(process.env.ROUTE_FINAL_ASSIGNMENT_HOURS_BEFORE || 2)));
  }

  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      await this.ensureMinimumPreparationLead();
      await this.notifyNewSubscriptions();
      await this.notifyUpcomingPreparation();
      await this.finalizeNearTermRiderAssignments();
    } catch (error: unknown) {
      this.logger.error(`Subscription preparation cycle failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async ensureMinimumPreparationLead() {
    const minimum = this.minimumPreparationHours();
    const result = await prisma.subscriptionPlan.updateMany({
      where: {
        status: { not: SubscriptionPlanStatus.ARCHIVED },
        orderGenerationHoursBefore: { lt: minimum },
      },
      data: { orderGenerationHoursBefore: minimum },
    });
    if (result.count) this.logger.log(`Raised ${result.count} subscription plan(s) to ${minimum}h preparation lead`);
  }

  private async createNotification(input: {
    id: string;
    title: string;
    body: string;
    deepLink: string;
    userIds: string[];
    data: Prisma.InputJsonValue;
  }) {
    const userIds = [...new Set(input.userIds.filter(Boolean))];
    if (!userIds.length) return;
    try {
      await prisma.notification.create({
        data: {
          id: input.id,
          eventType: NotificationEventType.ADMIN_BROADCAST,
          title: input.title,
          body: input.body,
          deepLink: input.deepLink,
          data: input.data,
          recipients: {
            create: userIds.map((userId) => ({
              userId,
              dedupeKey: `${input.id}:${userId}`,
            })),
          },
        },
      });
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
  }

  private async notifyNewSubscriptions() {
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [subscriptions, admins] = await Promise.all([
      prisma.customerSubscription.findMany({
        where: { createdAt: { gte: since } },
        include: {
          customer: { select: { id: true, name: true } },
          plan: { select: { name: true } },
          homeStore: { select: { id: true, name: true, ownerId: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      }),
      prisma.user.findMany({ where: { role: Role.ADMIN, isActive: true }, select: { id: true } }),
    ]);
    for (const subscription of subscriptions) {
      const date = subscription.nextDeliveryDate?.toISOString().slice(0, 10) || 'upcoming date';
      const storeName = subscription.homeStore?.name || 'assigned store';
      const metadata = {
        kind: 'SUBSCRIPTION_FORECAST_CREATED',
        subscriptionId: subscription.id,
        planId: subscription.planId,
        storeId: subscription.homeStoreId,
        nextDeliveryDate: subscription.nextDeliveryDate?.toISOString() || null,
      } as Prisma.InputJsonValue;
      if (subscription.homeStore?.ownerId) {
        await this.createNotification({
          id: `subscription-forecast:${subscription.id}:store`,
          title: 'New subscription demand',
          body: `${subscription.plan.name} starts ${date}. Review future demand and confirm stock readiness before the delivery day.`,
          deepLink: '/store/subscriptions',
          userIds: [subscription.homeStore.ownerId],
          data: metadata,
        });
      }
      await this.createNotification({
        id: `subscription-forecast:${subscription.id}:admin`,
        title: 'New subscription scheduled',
        body: `${subscription.customer.name || 'Customer'} · ${subscription.plan.name} · ${storeName} · first delivery ${date}.`,
        deepLink: '/admin/subscriptions',
        userIds: admins.map((admin) => admin.id),
        data: metadata,
      });
      await this.createNotification({
        id: `subscription-forecast:${subscription.id}:customer`,
        title: 'Subscription scheduled',
        body: `${subscription.plan.name} is scheduled. We will keep preparation, rider and delivery status updated.`,
        deepLink: '/shop/subscriptions',
        userIds: [subscription.customerId],
        data: metadata,
      });
    }
  }

  private async notifyUpcomingPreparation() {
    const from = startOfUtcDay(new Date());
    const to = addUtcDays(from, 2);
    const [deliveries, admins] = await Promise.all([
      prisma.subscriptionDelivery.findMany({
        where: {
          serviceDate: { gte: from, lt: to },
          status: { notIn: TERMINAL_DELIVERY_STATUSES },
          subscription: {
            status: { notIn: [CustomerSubscriptionStatus.CANCELLED, CustomerSubscriptionStatus.COMPLETED] },
          },
        },
        include: {
          store: { select: { id: true, name: true, ownerId: true } },
          runStop: { include: { deliveryRun: { select: { id: true, routeCode: true, status: true, riderId: true } } } },
          subscription: {
            include: {
              customer: { select: { id: true, name: true } },
              plan: { select: { name: true } },
              homeStore: { select: { id: true, name: true, ownerId: true } },
            },
          },
        },
        orderBy: { serviceDate: 'asc' },
        take: 1000,
      }),
      prisma.user.findMany({ where: { role: Role.ADMIN, isActive: true }, select: { id: true } }),
    ]);
    const today = from.toISOString().slice(0, 10);
    for (const delivery of deliveries) {
      const date = delivery.serviceDate.toISOString().slice(0, 10);
      const when = date === today ? 'Today' : 'Tomorrow';
      const store = delivery.store || delivery.subscription.homeStore;
      const routeCode = delivery.runStop?.deliveryRun.routeCode || null;
      const metadata = {
        kind: 'SUBSCRIPTION_D1_PREPARATION',
        subscriptionId: delivery.subscriptionId,
        subscriptionDeliveryId: delivery.id,
        serviceDate: delivery.serviceDate.toISOString(),
        storeId: store?.id || null,
        deliveryRunId: delivery.runStop?.deliveryRun.id || null,
        routeCode,
      } as Prisma.InputJsonValue;
      if (store?.ownerId) {
        await this.createNotification({
          id: `subscription-d1:${delivery.id}:store`,
          title: `${when}: subscription stock check`,
          body: `${delivery.subscription.plan.name} needs preparation for ${delivery.subscription.customer.name || 'a customer'}. Confirm stock readiness or report a shortage now.`,
          deepLink: '/store/subscriptions',
          userIds: [store.ownerId],
          data: metadata,
        });
      }
      await this.createNotification({
        id: `subscription-d1:${delivery.id}:admin`,
        title: `${when}: subscription operations`,
        body: `${delivery.subscription.plan.name} · ${store?.name || 'store unresolved'}${routeCode ? ` · ${routeCode}` : ' · route pending'}.`,
        deepLink: '/admin/route-planning',
        userIds: admins.map((admin) => admin.id),
        data: metadata,
      });
      await this.createNotification({
        id: `subscription-d1:${delivery.id}:customer`,
        title: `${when}: delivery preparation`,
        body: `${delivery.subscription.plan.name} is being prepared for your scheduled delivery.`,
        deepLink: '/shop/subscriptions',
        userIds: [delivery.subscription.customerId],
        data: metadata,
      });
    }
  }

  private async finalizeNearTermRiderAssignments() {
    const now = new Date();
    const cutoff = new Date(now.getTime() + this.finalAssignmentHours() * 3_600_000);
    const retryBefore = new Date(now.getTime() - 5 * 60_000);
    const runs = await prisma.deliveryRun.findMany({
      where: {
        riderId: null,
        slotStart: { lte: cutoff },
        slotEnd: { gte: now },
        OR: [
          { status: DeliveryRunStatus.PLANNED },
          { status: DeliveryRunStatus.RIDER_NEEDED, updatedAt: { lte: retryBefore } },
        ],
      },
      orderBy: { slotStart: 'asc' },
      take: 100,
    });
    for (const run of runs) {
      try {
        await this.regionalPlanner.assignBestEligibleRider(run.id);
      } catch (error: unknown) {
        this.logger.warn(`Final rider assignment deferred run=${run.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async storeIdsFor(actor: Actor) {
    if (actor.role === Role.ADMIN) {
      const stores = await prisma.store.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true } });
      return stores.map((store) => store.id);
    }
    if (actor.role !== Role.STORE_OWNER) throw new ForbiddenException('Store preparation is restricted to store owners and admins');
    const stores = await prisma.store.findMany({ where: { ownerId: actor.id, isActive: true, deletedAt: null }, select: { id: true } });
    return stores.map((store) => store.id);
  }

  async list(actor: Actor, days = 3) {
    const storeIds = await this.storeIdsFor(actor);
    if (!storeIds.length) return [];
    const from = startOfUtcDay(new Date());
    const to = addUtcDays(from, Math.max(1, Math.min(14, Number(days) || 3)));
    const deliveries = await prisma.subscriptionDelivery.findMany({
      where: {
        serviceDate: { gte: from, lt: to },
        status: { notIn: TERMINAL_DELIVERY_STATUSES },
        OR: [
          { storeId: { in: storeIds } },
          { subscription: { homeStoreId: { in: storeIds } } },
        ],
      },
      include: {
        store: { select: { id: true, name: true } },
        order: { select: { id: true, status: true } },
        runStop: {
          include: {
            deliveryRun: {
              select: {
                id: true,
                routeCode: true,
                status: true,
                slotStart: true,
                slotEnd: true,
                rider: { include: { user: { select: { name: true, phone: true } } } },
              },
            },
          },
        },
        subscription: {
          include: {
            customer: { select: { id: true, name: true, email: true, phone: true } },
            plan: { select: { id: true, name: true, orderGenerationHoursBefore: true } },
            homeStore: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ serviceDate: 'asc' }, { sequenceNumber: 'asc' }],
      take: 1000,
    });
    const subscriptionIds = [...new Set(deliveries.map((delivery) => delivery.subscriptionId))];
    const audits = subscriptionIds.length
      ? await prisma.subscriptionAuditEntry.findMany({
          where: {
            subscriptionId: { in: subscriptionIds },
            action: { in: [PREPARATION_ACTION_READY, PREPARATION_ACTION_SHORTAGE] },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const readinessByDelivery = new Map<string, typeof audits[number]>();
    for (const audit of audits) {
      const deliveryId = String(jsonRecord(audit.metadata).subscriptionDeliveryId || '');
      if (deliveryId) readinessByDelivery.set(deliveryId, audit);
    }
    return deliveries.map((delivery) => {
      const readiness = readinessByDelivery.get(delivery.id);
      const address = deliveryAddress(delivery.subscription.addressSnapshot);
      const run = delivery.runStop?.deliveryRun || null;
      return {
        id: delivery.id,
        subscriptionId: delivery.subscriptionId,
        sequenceNumber: delivery.sequenceNumber,
        serviceDate: delivery.serviceDate,
        deliveryStatus: delivery.status,
        generatedAt: delivery.generatedAt,
        store: delivery.store || delivery.subscription.homeStore,
        plan: delivery.subscription.plan,
        customer: {
          id: delivery.subscription.customer.id,
          name: delivery.subscription.customer.name,
          email: delivery.subscription.customer.email,
          accountPhone: delivery.subscription.customer.phone,
          deliveryPhone: address.phone || delivery.subscription.customer.phone,
        },
        address,
        items: snapshotItems(delivery.subscription.itemsSnapshot),
        order: delivery.order,
        run,
        readiness: {
          status: readiness?.action === PREPARATION_ACTION_READY
            ? StoreStockReadinessDecision.READY
            : readiness?.action === PREPARATION_ACTION_SHORTAGE
              ? StoreStockReadinessDecision.SHORTAGE
              : 'PENDING',
          note: readiness?.reason || null,
          updatedAt: readiness?.createdAt || null,
        },
        inventoryReservation: delivery.order ? 'RESERVED_BY_ORDER' : 'FORECAST_ONLY',
        packingAvailableNow: Boolean(run && startOfUtcDay(run.serviceDate).getTime() <= from.getTime()),
      };
    });
  }

  async adminOverview(days = 3) {
    const rows = await this.list({ id: 'admin-overview', role: Role.ADMIN }, days);
    const plans = await prisma.subscriptionPlan.findMany({
      where: { status: { not: SubscriptionPlanStatus.ARCHIVED } },
      select: { id: true, code: true, name: true, status: true, orderGenerationHoursBefore: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return {
      minimumPreparationHours: this.minimumPreparationHours(),
      finalAssignmentHoursBefore: this.finalAssignmentHours(),
      rows,
      plans,
    };
  }

  async setReadiness(
    actor: Actor,
    deliveryId: string,
    decision: StoreStockReadinessDecision,
    note?: string,
    idempotencyKey?: string,
  ) {
    const storeIds = await this.storeIdsFor(actor);
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-readiness:${deliveryId}`}))`);
      const delivery = await tx.subscriptionDelivery.findFirst({
        where: {
          id: deliveryId,
          OR: [
            { storeId: { in: storeIds } },
            { subscription: { homeStoreId: { in: storeIds } } },
          ],
        },
        include: {
          subscription: { include: { plan: { select: { name: true } } } },
          store: { select: { id: true, name: true } },
        },
      });
      if (!delivery) throw new NotFoundException('Subscription delivery is not available to this store');
      if (TERMINAL_DELIVERY_STATUSES.includes(delivery.status)) {
        throw new BadRequestException(`Stock readiness cannot change after delivery became ${delivery.status}`);
      }
      const reason = note?.trim() || (decision === StoreStockReadinessDecision.READY ? 'Store confirmed forecast stock readiness' : 'Store reported forecast shortage');
      if (decision === StoreStockReadinessDecision.SHORTAGE && reason.length < 5) {
        throw new BadRequestException('Describe the shortage so operations can resolve it');
      }
      const key = idempotencyKey?.trim() || `subscription-readiness:${deliveryId}:${randomUUID()}`;
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return existing;
      const audit = await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: delivery.subscriptionId,
          actorUserId: actor.id,
          actorRole: actor.role,
          action: decision === StoreStockReadinessDecision.READY ? PREPARATION_ACTION_READY : PREPARATION_ACTION_SHORTAGE,
          reason,
          metadata: {
            subscriptionDeliveryId: delivery.id,
            serviceDate: delivery.serviceDate.toISOString(),
            storeId: delivery.storeId || delivery.subscription.homeStoreId,
            decision,
            inventoryReserved: Boolean(delivery.generatedAt),
          },
          idempotencyKey: key,
        },
      });
      if (decision === StoreStockReadinessDecision.SHORTAGE) {
        const admins = await tx.user.findMany({ where: { role: Role.ADMIN, isActive: true }, select: { id: true } });
        const notificationId = `subscription-shortage:${audit.id}`;
        await tx.notification.create({
          data: {
            id: notificationId,
            eventType: NotificationEventType.ADMIN_BROADCAST,
            title: 'Subscription stock shortage',
            body: `${delivery.subscription.plan.name} needs intervention before ${delivery.serviceDate.toISOString().slice(0, 10)}. ${reason}`.slice(0, 500),
            deepLink: '/admin/subscriptions',
            data: {
              kind: 'SUBSCRIPTION_STOCK_SHORTAGE',
              subscriptionId: delivery.subscriptionId,
              subscriptionDeliveryId: delivery.id,
              serviceDate: delivery.serviceDate.toISOString(),
            },
            recipients: {
              create: admins.map((admin) => ({ userId: admin.id, dedupeKey: `${notificationId}:${admin.id}` })),
            },
          },
        });
      }
      return audit;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updatePlanPolicy(actor: Actor, planId: string, dto: UpdateSubscriptionPreparationPolicyDto) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only Admin can change subscription preparation policy');
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (plan.status === SubscriptionPlanStatus.ARCHIVED) throw new BadRequestException('Archived plans cannot be changed');
    const minimum = this.minimumPreparationHours();
    if (dto.orderGenerationHoursBefore < minimum) {
      throw new BadRequestException(`Preparation lead must be at least ${minimum} hours`);
    }
    return prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        orderGenerationHoursBefore: dto.orderGenerationHoursBefore,
        updatedById: actor.id,
      },
      select: { id: true, code: true, name: true, status: true, orderGenerationHoursBefore: true, updatedAt: true },
    });
  }
}
