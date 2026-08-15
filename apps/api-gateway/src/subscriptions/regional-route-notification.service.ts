import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DeliveryRouteEvent,
  DeliveryRouteEventType,
  NotificationEventType,
  Prisma,
  Role,
  prisma,
} from '@aagam/database';

const ROUTE_NOTIFICATION_EVENTS: DeliveryRouteEventType[] = [
  DeliveryRouteEventType.ROUTE_CLUSTER_CREATED,
  DeliveryRouteEventType.DELIVERY_RUN_ASSIGNED,
  DeliveryRouteEventType.DELIVERY_RUN_REASSIGNED,
  DeliveryRouteEventType.DELIVERY_RUN_SPLIT,
  DeliveryRouteEventType.DELIVERY_RUN_MERGED,
  DeliveryRouteEventType.RUN_STOP_MOVED,
  DeliveryRouteEventType.RUN_STOP_REORDERED,
  DeliveryRouteEventType.DELIVERY_RUN_INTERRUPTED,
  DeliveryRouteEventType.RECOVERY_RUN_CREATED,
  DeliveryRouteEventType.DELIVERY_RUN_CANCELLED,
];

const REASSIGNMENT_EVENTS = new Set<DeliveryRouteEventType>([
  DeliveryRouteEventType.DELIVERY_RUN_REASSIGNED,
  DeliveryRouteEventType.RUN_STOP_MOVED,
  DeliveryRouteEventType.RECOVERY_RUN_CREATED,
]);

type AudienceMessage = {
  key: 'rider' | 'store' | 'admin' | 'customer';
  title: string;
  body: string;
  deepLink: string;
  userIds: string[];
};

@Injectable()
export class RegionalRouteNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegionalRouteNotificationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.flush(), 10_000);
    this.timer.unref?.();
    void this.flush();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async flush() {
    if (this.running) return;
    this.running = true;
    try {
      const events = await prisma.deliveryRouteEvent.findMany({
        where: {
          eventType: { in: ROUTE_NOTIFICATION_EVENTS },
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
      for (const event of events) await this.deliver(event);
    } catch (error: unknown) {
      this.logger.error(`Regional route notification flush failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async deliver(event: DeliveryRouteEvent) {
    if (!event.deliveryRunId) return;
    const run = await prisma.deliveryRun.findUnique({
      where: { id: event.deliveryRunId },
      include: {
        deliveryZone: true,
        rider: { include: { user: { select: { id: true } } } },
        store: { include: { owner: { select: { id: true } } } },
        stops: {
          include: {
            subscriptionDelivery: {
              include: { subscription: { select: { customerId: true } } },
            },
          },
        },
      },
    });
    if (!run) return;
    const admins = await prisma.user.findMany({ where: { role: Role.ADMIN, isActive: true }, select: { id: true } });
    const customerIds = [...new Set(run.stops.map((stop) => stop.subscriptionDelivery.subscription.customerId))];
    const zone = run.deliveryZone?.name || 'your service area';
    const routeLabel = `${run.routeCode} · ${zone}`;
    const planned = event.eventType === DeliveryRouteEventType.ROUTE_CLUSTER_CREATED;
    const reassigned = REASSIGNMENT_EVENTS.has(event.eventType);
    const interrupted = event.eventType === DeliveryRouteEventType.DELIVERY_RUN_INTERRUPTED;
    const cancelled = event.eventType === DeliveryRouteEventType.DELIVERY_RUN_CANCELLED;

    const messages: AudienceMessage[] = [
      {
        key: 'admin',
        title: planned ? 'Tomorrow route planned' : title(event.eventType),
        body: planned
          ? `${routeLabel} has ${run.totalStopCount} scheduled stop${run.totalStopCount === 1 ? '' : 's'}. Rider dispatch remains pending until the live-assignment window.`
          : `${routeLabel} was updated. Review route ownership, capacity, timing and cash warnings.`,
        deepLink: '/admin/route-planning',
        userIds: admins.map((admin) => admin.id),
      },
      {
        key: 'store',
        title: planned ? 'Tomorrow preparation route ready' : 'Preparation route updated',
        body: planned
          ? `${routeLabel} is ready for stock preparation. Confirm stock readiness now; packing and handoff stay day-of custody actions.`
          : `${routeLabel} changed. Refresh bag labels, route readiness and rider handoff details.`,
        deepLink: '/store/subscriptions',
        userIds: [run.store.owner.id],
      },
      {
        key: 'rider',
        title: reassigned ? 'Your delivery run changed' : 'Morning run assigned',
        body: `${routeLabel} has ${run.totalStopCount} stops. Refresh before continuing; your active stop is never removed silently.`,
        deepLink: '/rider/runs',
        userIds: planned ? [] : run.rider?.user.id ? [run.rider.user.id] : [],
      },
      {
        key: 'customer',
        title: planned
          ? 'Delivery route planned'
          : interrupted
            ? 'Delivery update'
            : reassigned
              ? 'Your delivery was reassigned'
              : cancelled
                ? 'Delivery schedule update'
                : 'Your rider has been assigned',
        body: planned
          ? 'Your upcoming subscription delivery is in the preparation plan. Rider details will appear after final live assignment.'
          : interrupted
            ? 'Your delivery may be delayed. We will keep the delivery window and ETA updated.'
            : reassigned
              ? 'Your delivery has been reassigned. The delivery window is unchanged unless we notify you separately.'
              : cancelled
                ? 'Your delivery route is being replanned. Your subscription remains safe.'
                : 'Your delivery is scheduled and a rider has been assigned.',
        deepLink: '/shop/subscriptions',
        userIds: customerIds,
      },
    ];

    for (const message of messages) {
      if (!message.userIds.length) continue;
      const notificationId = `route-${event.id}-${message.key}`;
      try {
        await prisma.notification.create({
          data: {
            id: notificationId,
            eventType: NotificationEventType.ADMIN_BROADCAST,
            title: message.title,
            body: message.body,
            deepLink: message.deepLink,
            data: {
              routeEventType: event.eventType,
              deliveryRunId: run.id,
              routeCode: run.routeCode,
              zoneId: run.deliveryZoneId,
              zoneName: zone,
              version: run.version,
              plannedOnly: planned,
            } as Prisma.InputJsonValue,
            recipients: {
              create: [...new Set(message.userIds)].map((userId) => ({
                userId,
                dedupeKey: `route-event:${event.id}:${message.key}:${userId}`,
              })),
            },
          },
        });
      } catch (error: unknown) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      }
    }
  }
}

function title(value: DeliveryRouteEventType) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
