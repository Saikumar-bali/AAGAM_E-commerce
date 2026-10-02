import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DeliveryRouteEvent,
  DeliveryRouteEventType,
  Role,
  prisma,
} from '@aagam/database';
import { enqueueOutboxEvent } from '../notifications/outbox.service';
import { captureBackgroundError } from '../common/sentry-config';

// Assignment/removal notifications are already emitted directly by the
// authoritative rider-assignment transaction as ROUTE_ASSIGNED/ROUTE_REMOVED.
// This worker handles planning/recovery events for Admin, Store and Customer so
// it does not duplicate or falsely imply a Rider assignment.
const ROUTE_NOTIFICATION_EVENTS: DeliveryRouteEventType[] = [
  DeliveryRouteEventType.ROUTE_CLUSTER_CREATED,
  DeliveryRouteEventType.DELIVERY_RUN_SPLIT,
  DeliveryRouteEventType.DELIVERY_RUN_MERGED,
  DeliveryRouteEventType.RUN_STOP_MOVED,
  DeliveryRouteEventType.RUN_STOP_REORDERED,
  DeliveryRouteEventType.DELIVERY_RUN_INTERRUPTED,
  DeliveryRouteEventType.RECOVERY_RUN_CREATED,
  DeliveryRouteEventType.DELIVERY_RUN_CANCELLED,
];

type AudienceMessage = {
  key: 'store' | 'admin' | 'customer';
  role: Role;
  title: string;
  body: string;
  deepLink: string;
  userIds: string[];
};

// Backlog scanned once on startup (and after a long pause). After that the
// sweep advances a watermark so old events are not re-enqueued every 10s.
const INITIAL_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const FLUSH_INTERVAL_MS = 10_000;

@Injectable()
export class RegionalRouteNotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RegionalRouteNotificationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  /**
   * Exclusive lower bound on `createdAt` for the next sweep.
   *
   * Without this the query re-scans the previous 7 days of events on every tick
   * and re-enqueues each one; the outbox then rejects each as a duplicate. Those
   * rejections are logged by Postgres as ERRORs and were the single largest
   * source of disk usage on the VPS.
   */
  private watermark?: Date;

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
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
      const now = new Date();
      // First run: scan the backlog. Subsequent runs: only events newer than
      // everything already handled. Clamp so a paused process cannot scan
      // unbounded history in one tick.
      const lowerBound =
        this.watermark ?? new Date(now.getTime() - INITIAL_LOOKBACK_MS);

      const events = await prisma.deliveryRouteEvent.findMany({
        where: {
          eventType: { in: ROUTE_NOTIFICATION_EVENTS },
          createdAt: { gt: lowerBound },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });

      for (const event of events) {
        // Deliver before advancing so a thrown error leaves the event queued
        // for the next tick rather than silently dropped.
        await this.deliver(event);
        if (!this.watermark || event.createdAt > this.watermark) {
          this.watermark = event.createdAt;
        }
      }
      // With no new events the watermark stays put: `createdAt > watermark`
      // is an indexed range that simply returns no rows, so there is nothing
      // to bound.
    } catch (error: unknown) {
      captureBackgroundError(this.logger, 'Regional route notification flush failed', error);
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
    const interrupted = event.eventType === DeliveryRouteEventType.DELIVERY_RUN_INTERRUPTED;
    const cancelled = event.eventType === DeliveryRouteEventType.DELIVERY_RUN_CANCELLED;

    const messages: AudienceMessage[] = [
      {
        key: 'admin',
        role: Role.ADMIN,
        title: planned ? 'Tomorrow route planned' : title(event.eventType),
        body: planned
          ? `${routeLabel} has ${run.totalStopCount} scheduled stop${run.totalStopCount === 1 ? '' : 's'}. Rider dispatch remains pending until the live-assignment window.`
          : `${routeLabel} was updated. Review route ownership, capacity, timing and cash warnings.`,
        deepLink: '/admin/route-planning',
        userIds: admins.map((admin) => admin.id),
      },
      {
        key: 'store',
        role: Role.STORE_OWNER,
        title: planned ? 'Tomorrow preparation route ready' : 'Preparation route updated',
        body: planned
          ? `${routeLabel} is ready for stock preparation. Confirm stock readiness now; packing and handoff stay day-of custody actions.`
          : `${routeLabel} changed. Refresh bag labels, route readiness and handoff details.`,
        deepLink: '/store/subscriptions',
        userIds: [run.store.owner.id],
      },
      {
        key: 'customer',
        role: Role.CUSTOMER,
        title: planned
          ? 'Delivery route planned'
          : interrupted
            ? 'Delivery update'
            : cancelled
              ? 'Delivery schedule update'
              : 'Delivery plan updated',
        body: planned
          ? 'Your upcoming subscription delivery is in the preparation plan. Rider details will appear after final live assignment.'
          : interrupted
            ? 'Your delivery may be delayed. We will keep the delivery window and ETA updated.'
            : cancelled
              ? 'Your delivery route is being replanned. Your subscription remains safe.'
              : 'Your upcoming subscription route was updated. The delivery window is unchanged unless we notify you separately.',
        deepLink: '/shop/subscriptions',
        userIds: customerIds,
      },
    ];

    for (const message of messages) {
      const userIds = [...new Set(message.userIds.filter(Boolean))];
      if (!userIds.length) continue;
      const notificationId = `route-${event.id}-${message.key}`;
      await enqueueOutboxEvent(prisma, {
        eventType: 'ADMIN_BROADCAST',
        aggregateType: 'SYSTEM',
        aggregateId: run.id,
        idempotencyKey: notificationId,
        payload: {
          title: message.title,
          body: message.body,
          audience: 'TARGETED',
          deepLink: message.deepLink,
          targetRecipients: userIds.map((userId) => ({ userId, role: message.role })),
          metadata: {
            routeEventType: event.eventType,
            deliveryRunId: run.id,
            routeCode: run.routeCode,
            zoneId: run.deliveryZoneId,
            zoneName: zone,
            version: run.version,
            plannedOnly: planned,
          },
        },
      });
    }
  }
}

function title(value: DeliveryRouteEventType) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
