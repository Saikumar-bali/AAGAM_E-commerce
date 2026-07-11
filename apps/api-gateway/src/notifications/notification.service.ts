import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import {
  AdminBroadcastDto,
  NotificationEventTypeType,
  UpdateNotificationPreferenceDto,
} from '@aagam/types';
import { randomUUID } from 'crypto';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationRoutingService } from './notification-routing.service';
import { OutboxService } from './outbox.service';
import { WebPushService } from './web-push.service';

type Actor = { id: string; role: Role };

type LegacyInboxItem = {
  id: string;
  sourceHistoryId: string;
  recipientId?: string;
  orderId: string;
  deliveryJobId?: string | null;
  type: string;
  title: string;
  body: string;
  deepLink?: string | null;
  createdAt: Date;
  sentAt?: Date | null;
  openedAt?: Date | null;
  readAt: Date | string | null;
  status?: string;
  metadata: any;
};

const LEGACY_READ_NOTE = 'Notification marked read.';
const INTERNAL_HIDDEN_RECIPIENTS_KEY = 'inAppHiddenRecipientIds';

@Injectable()
export class NotificationService {
  private readonly routingService: NotificationRoutingService;
  private readonly deliveryService: NotificationDeliveryService;
  private readonly outboxService: OutboxService;
  private readonly pushService: WebPushService;

  constructor(
    @Optional() routing?: NotificationRoutingService,
    @Optional() delivery?: NotificationDeliveryService,
    @Optional() outbox?: OutboxService,
    @Optional() push?: WebPushService,
  ) {
    this.pushService = push || new WebPushService();
    this.routingService = routing || new NotificationRoutingService();
    this.deliveryService = delivery || new NotificationDeliveryService(this.pushService);
    this.outboxService = outbox || new OutboxService();
  }

  async listInbox(actor: Actor, limitInput?: string | number) {
    const limit = Math.min(100, Math.max(1, Number(limitInput || 50)));
    const candidates = await prisma.notificationRecipient.findMany({
      where: { userId: actor.id },
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(limit, limit * 5)),
    });

    const recipients = candidates
      .filter((recipient) => {
        const data = (recipient.notification.data || {}) as any;
        const hiddenRecipientIds = Array.isArray(data[INTERNAL_HIDDEN_RECIPIENTS_KEY])
          ? data[INTERNAL_HIDDEN_RECIPIENTS_KEY]
          : [];
        return !hiddenRecipientIds.includes(recipient.id);
      })
      .slice(0, limit);

    const dedicatedItems = recipients.map((recipient) => this.toDedicatedInboxItem(recipient));
    const migratedLegacyIds = new Set(
      recipients
        .map((recipient) => (recipient.notification.data as any)?.legacySourceHistoryId)
        .filter(Boolean),
    );

    const remaining = Math.max(0, limit - dedicatedItems.length);
    const legacyRows = remaining > 0 ? await this.legacySourceRows(actor, Math.max(remaining * 2, 20)) : [];
    const legacyItems = legacyRows
      .filter((row) => !migratedLegacyIds.has(row.id))
      .slice(0, remaining)
      .map((row) => this.toLegacyInboxItem(row, actor));

    const items = [...dedicatedItems, ...legacyItems]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return {
      items,
      unreadCount: items.filter((item) => !item.readAt).length,
      source: legacyItems.length > 0 ? 'DEDICATED_WITH_LEGACY_FALLBACK' : 'DEDICATED',
    };
  }

  async markRead(actor: Actor, notificationOrSourceId: string) {
    const recipient = await prisma.notificationRecipient.findFirst({
      where: { id: notificationOrSourceId, userId: actor.id },
    });
    if (recipient) {
      const readAt = recipient.readAt || new Date();
      const updated = await prisma.notificationRecipient.update({
        where: { id: recipient.id },
        data: { status: 'READ', readAt, openedAt: recipient.openedAt || readAt },
      });
      return { ok: true, readAt: updated.readAt, recipientId: updated.id };
    }

    const inbox = await this.legacySourceRows(actor, 500);
    const legacy = inbox.find((row) => row.id === notificationOrSourceId);
    if (!legacy) throw new NotFoundException('Notification not found');

    const migrated = await this.migrateLegacyRow(actor, legacy, true);
    return { ok: true, readAt: migrated.readAt, recipientId: migrated.id };
  }

  async markOpened(actor: Actor, recipientId: string) {
    const recipient = await prisma.notificationRecipient.findFirst({
      where: { id: recipientId, userId: actor.id },
    });
    if (!recipient) throw new NotFoundException('Notification not found');
    const openedAt = recipient.openedAt || new Date();
    const updated = await prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: {
        status: recipient.readAt ? 'READ' : 'OPENED',
        openedAt,
      },
    });
    return { ok: true, openedAt: updated.openedAt };
  }

  async createBroadcast(actor: Actor, input: AdminBroadcastDto, idempotencyKey?: string) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only admin can create broadcasts');
    const key = idempotencyKey || `admin-broadcast:${actor.id}:${randomUUID()}`;
    const event = await this.outboxService.enqueue({
      eventType: 'ADMIN_BROADCAST',
      aggregateType: 'SYSTEM',
      aggregateId: actor.id,
      idempotencyKey: key,
      payload: {
        actorUserId: actor.id,
        actorRole: actor.role,
        title: input.title,
        body: input.body,
        audience: input.audience,
        deepLink: input.deepLink,
      },
    });
    return { ok: true, status: 'QUEUED', outboxEventId: event?.id, idempotencyKey: key };
  }

  createBroadcastPlaceholder(actor: Actor, input: { title?: string; body?: string; audience?: string }) {
    const title = input.title?.trim();
    const body = input.body?.trim();
    if (!title) throw new BadRequestException('title is required');
    if (!body) throw new BadRequestException('body is required');
    return this.createBroadcast(actor, {
      title,
      body,
      audience: (input.audience as any) || 'ALL_USERS',
    });
  }

  getPreferences(userId: string) {
    return prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { eventType: 'asc' },
    });
  }

  updatePreference(userId: string, input: UpdateNotificationPreferenceDto) {
    return prisma.notificationPreference.upsert({
      where: { userId_eventType: { userId, eventType: input.eventType } },
      update: {
        ...(typeof input.pushEnabled === 'boolean' ? { pushEnabled: input.pushEnabled } : {}),
        ...(typeof input.inAppEnabled === 'boolean' ? { inAppEnabled: input.inAppEnabled } : {}),
      },
      create: {
        userId,
        eventType: input.eventType,
        pushEnabled: input.pushEnabled ?? true,
        inAppEnabled: input.inAppEnabled ?? true,
      },
    });
  }

  async materializeOutboxEvent(outboxEvent: any) {
    const existing = await prisma.notification.findUnique({
      where: { outboxEventId: outboxEvent.id },
      include: { recipients: true },
    });
    if (existing) return existing;

    const routed = await this.routingService.route(outboxEvent);

    try {
      return await prisma.$transaction(async (tx) => {
        const notification = await tx.notification.create({
          data: {
            eventType: outboxEvent.eventType,
            title: routed.title,
            body: routed.body,
            data: routed.data,
            orderId: routed.orderId,
            deliveryJobId: routed.deliveryJobId,
            outboxEventId: outboxEvent.id,
          },
        });
        const inAppHiddenRecipientIds: string[] = [];

        for (const routedRecipient of routed.recipients) {
          const preferences = await tx.notificationPreference.findMany({
            where: {
              userId: routedRecipient.userId,
              eventType: { in: ['*', outboxEvent.eventType] },
            },
          });
          const specific = preferences.find((preference: any) => preference.eventType === outboxEvent.eventType);
          const fallback = preferences.find((preference: any) => preference.eventType === '*');
          const effective = specific || fallback;
          const pushEnabled = effective?.pushEnabled !== false;
          const inAppEnabled = effective?.inAppEnabled !== false;

          if (!pushEnabled && !inAppEnabled) continue;

          const recipient = await tx.notificationRecipient.create({
            data: {
              notificationId: notification.id,
              userId: routedRecipient.userId,
              dedupeKey: `${outboxEvent.id}:${routedRecipient.userId}`,
              status: 'QUEUED',
            },
          });
          if (!inAppEnabled) inAppHiddenRecipientIds.push(recipient.id);
        }

        const routedData: any = routed.data && typeof routed.data === 'object' && !Array.isArray(routed.data)
          ? routed.data
          : {};
        await tx.notification.update({
          where: { id: notification.id },
          data: {
            deepLink: routed.recipients.length === 1 ? routed.recipients[0].deepLink : null,
            data: inAppHiddenRecipientIds.length > 0
              ? { ...routedData, [INTERNAL_HIDDEN_RECIPIENTS_KEY]: inAppHiddenRecipientIds }
              : routedData,
          },
        });

        return tx.notification.findUnique({
          where: { id: notification.id },
          include: { recipients: true },
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return prisma.notification.findUnique({
          where: { outboxEventId: outboxEvent.id },
          include: { recipients: true },
        });
      }
      throw error;
    }
  }

  async processOutboxEvent(outboxEvent: any) {
    const notification = await this.materializeOutboxEvent(outboxEvent);
    if (!notification) throw new Error('Notification could not be materialized');

    const recipients = await prisma.notificationRecipient.findMany({
      where: {
        notificationId: notification.id,
        status: { in: ['QUEUED', 'FAILED'] },
      },
    });

    const failures: Error[] = [];
    for (const recipient of recipients) {
      try {
        await this.deliveryService.deliverRecipient(recipient.id);
      } catch (error: any) {
        failures.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (failures.length > 0) {
      throw new Error(`${failures.length} notification recipient delivery attempt(s) failed: ${failures[0].message}`);
    }
    return notification;
  }

  async sendPushNotification(fcmToken: string, title: string, body: string, data?: any) {
    if (!fcmToken) return undefined;
    return this.pushService.send(
      { token: fcmToken },
      { title, body, deepLink: data?.deepLink || null, data: data || {} },
    );
  }

  sendNewOrderAlert(fcmToken: string, orderData: { orderId: string; amount: number; storeName: string }) {
    return this.sendPushNotification(
      fcmToken,
      'New delivery request',
      `Order #${orderData.orderId.slice(-8).toUpperCase()} is ready at ${orderData.storeName}.`,
      { type: 'NEW_ORDER', orderId: orderData.orderId },
    );
  }

  private toDedicatedInboxItem(recipient: any): LegacyInboxItem {
    const notification = recipient.notification;
    const data = (notification.data || {}) as any;
    const { [INTERNAL_HIDDEN_RECIPIENTS_KEY]: _internalHiddenRecipients, ...publicMetadata } = data;
    return {
      id: recipient.id,
      recipientId: recipient.id,
      sourceHistoryId: data.legacySourceHistoryId || recipient.id,
      orderId: notification.orderId || '',
      deliveryJobId: notification.deliveryJobId || null,
      type: data.legacyType || notification.eventType,
      title: notification.title,
      body: notification.body,
      deepLink: data.recipientDeepLink || notification.deepLink || null,
      createdAt: notification.createdAt,
      sentAt: recipient.sentAt,
      openedAt: recipient.openedAt,
      readAt: recipient.readAt,
      status: recipient.status,
      metadata: publicMetadata,
    };
  }

  private async migrateLegacyRow(actor: Actor, row: any, markRead: boolean) {
    const legacyType = (row.metadata as any)?.event || `ORDER_${row.toStatus}`;
    const eventType = this.eventTypeForLegacy(row);
    const item = this.toLegacyInboxItem(row, actor);
    const dedupeKey = `legacy:${row.id}:${actor.id}`;

    return prisma.$transaction(async (tx) => {
      let notification = await tx.notification.findFirst({
        where: { data: { path: ['legacySourceHistoryId'], equals: row.id } },
      });
      if (!notification) {
        notification = await tx.notification.create({
          data: {
            eventType,
            title: item.title,
            body: item.body,
            orderId: row.orderId,
            deepLink: item.deepLink,
            data: {
              legacySourceHistoryId: row.id,
              legacyType,
              migratedFromOrderHistory: true,
            },
          },
        });
      }

      return tx.notificationRecipient.upsert({
        where: { dedupeKey },
        update: markRead
          ? { status: 'READ', readAt: new Date(), openedAt: new Date() }
          : {},
        create: {
          notificationId: notification.id,
          userId: actor.id,
          dedupeKey,
          status: markRead ? 'READ' : 'SENT',
          sentAt: new Date(),
          ...(markRead ? { readAt: new Date(), openedAt: new Date() } : {}),
        },
      });
    });
  }

  private eventTypeForLegacy(row: any): NotificationEventTypeType {
    const metadataEvent = (row.metadata as any)?.event;
    if (metadataEvent === 'CUSTOMER_SUPPORT_TICKET_OPENED') return 'ADMIN_BROADCAST';
    if (row.toStatus === OrderStatus.CONFIRMED) return 'STORE_ACCEPTED_ORDER';
    if (row.toStatus === OrderStatus.PICKING) return 'STORE_STARTED_PICKING';
    if (row.toStatus === OrderStatus.PACKED) return 'ORDER_PACKED';
    if (row.toStatus === OrderStatus.RIDER_ASSIGNED) return 'ASSIGNMENT_ACCEPTED';
    if (row.toStatus === OrderStatus.OUT_FOR_DELIVERY) return 'OUT_FOR_DELIVERY';
    if (row.toStatus === OrderStatus.DELIVERED) return 'DELIVERY_COMPLETED';
    if (row.toStatus === OrderStatus.CANCELLED) return 'DELIVERY_CANCELLED';
    return 'ADMIN_BROADCAST';
  }

  private async legacySourceRows(actor: Actor, limit: number) {
    const baseWhere: any = {
      note: { notIn: [LEGACY_READ_NOTE] },
      createdAt: { lte: new Date() },
    };

    if (actor.role === Role.CUSTOMER) {
      return prisma.orderStatusHistory.findMany({
        where: { ...baseWhere, order: { is: { customerId: actor.id } } },
        include: { order: { include: { store: { select: { name: true } }, rider: { include: { user: { select: { name: true } } } } } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }
    if (actor.role === Role.STORE_OWNER) {
      return prisma.orderStatusHistory.findMany({
        where: { ...baseWhere, order: { is: { store: { is: { ownerId: actor.id } } } } },
        include: { order: { include: { store: { select: { name: true } }, customer: { select: { name: true, phone: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }
    if (actor.role === Role.RIDER) {
      const rider = await prisma.riderProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
      if (!rider) return [];
      return prisma.orderStatusHistory.findMany({
        where: { ...baseWhere, order: { is: { riderId: rider.id } } },
        include: { order: { include: { store: { select: { name: true } }, customer: { select: { name: true, phone: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }
    if (actor.role === Role.ADMIN) {
      return prisma.orderStatusHistory.findMany({
        where: { note: 'Customer opened support ticket.' },
        include: { order: { include: { store: { select: { name: true } }, customer: { select: { name: true, email: true, phone: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }
    return [];
  }

  private toLegacyInboxItem(row: any, actor: Actor): LegacyInboxItem {
    const metadata = row.metadata || {};
    const type = metadata.event || `ORDER_${row.toStatus}`;
    const statusLabel = String(row.toStatus || '').replace(/_/g, ' ');
    return {
      id: row.id,
      sourceHistoryId: row.id,
      orderId: row.orderId,
      type,
      title: this.legacyTitle(type, row.toStatus, actor.role),
      body: this.legacyBody(type, row, statusLabel, actor.role),
      deepLink: this.deepLink(actor.role, row.orderId),
      createdAt: row.createdAt,
      readAt: null,
      status: 'SENT',
      metadata,
    };
  }

  private deepLink(role: Role, orderId: string) {
    if (role === Role.ADMIN) return `/admin/orders/${orderId}`;
    if (role === Role.STORE_OWNER) return '/store/orders';
    if (role === Role.RIDER) return '/rider';
    return `/shop/orders/${orderId}`;
  }

  private legacyTitle(type: string, status: OrderStatus, role: Role) {
    if (type === 'CUSTOMER_SUPPORT_TICKET_OPENED') return 'New support ticket';
    if (type === 'CUSTOMER_RATING_SUBMITTED') return 'New customer rating';
    if (status === OrderStatus.CONFIRMED) return role === Role.STORE_OWNER ? 'Order accepted' : 'Order confirmed';
    if (status === OrderStatus.PICKING) return 'Order preparation started';
    if (status === OrderStatus.PACKED) return 'Order packed';
    if (status === OrderStatus.RIDER_ASSIGNED) return 'Rider assigned';
    if (status === OrderStatus.OUT_FOR_DELIVERY) return 'Order out for delivery';
    if (status === OrderStatus.DELIVERED) return 'Order delivered';
    if (status === OrderStatus.CANCELLED) return 'Order cancelled';
    return 'Order update';
  }

  private legacyBody(type: string, row: any, statusLabel: string, role: Role) {
    if (type === 'CUSTOMER_SUPPORT_TICKET_OPENED') {
      return `${row.order?.customer?.name || 'Customer'} opened a ${row.metadata?.category || 'support'} ticket.`;
    }
    if (type === 'CUSTOMER_RATING_SUBMITTED') return 'A customer submitted a post-delivery rating.';
    const storeName = row.order?.store?.name || 'store';
    if (role === Role.CUSTOMER) return row.note || `Your order is now ${statusLabel}.`;
    if (role === Role.STORE_OWNER) return `Order ${row.orderId.slice(-8).toUpperCase()} is now ${statusLabel}.`;
    if (role === Role.RIDER) return `Delivery order from ${storeName} is now ${statusLabel}.`;
    return row.note || `Order ${row.orderId.slice(-8).toUpperCase()} updated.`;
  }
}
