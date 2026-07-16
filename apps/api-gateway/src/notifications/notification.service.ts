import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { OrderStatus, Role, prisma } from '@aagam/database';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

type Actor = { id: string; role: Role };

type InboxItem = {
  id: string;
  sourceHistoryId: string;
  orderId: string;
  type: string;
  title: string;
  body: string;
  createdAt: Date;
  readAt: string | null;
  metadata: any;
};

const READ_NOTE = 'Notification marked read.';
const BROADCAST_NOTE = 'Admin broadcast placeholder created.';

@Injectable()
export class NotificationService implements OnModuleInit {
  onModuleInit() {
    try {
      if (admin.apps.length > 0) return;

      const envServiceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (envServiceAccountRaw) {
        const serviceAccount = JSON.parse(envServiceAccountRaw);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        console.log('[NotificationService] Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
        return;
      }

      const serviceAccountPath = path.resolve(process.cwd(), 'firebase-adminsdk.json');
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        console.log('[NotificationService] Firebase Admin initialized from firebase-adminsdk.json');
        return;
      }

      console.warn('[NotificationService] Firebase Admin not initialized (missing FIREBASE_SERVICE_ACCOUNT_JSON and firebase-adminsdk.json).');
    } catch (error) {
      console.error('[NotificationService] Failed to initialize Firebase Admin:', error);
    }
  }

  async sendPushNotification(fcmToken: string, title: string, body: string, data?: any) {
    if (!fcmToken) return;
    if (admin.apps.length === 0) {
      console.warn('[NotificationService] Firebase not initialized. Skipping push notification.');
      return;
    }
    try {
      const message = {
        notification: { title, body },
        data: data || {},
        token: fcmToken,
        android: { notification: { sound: 'default', priority: 'high' as const, channelId: 'high_priority_orders' } },
        apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
      };
      const response = await admin.messaging().send(message);
      console.log(`[NotificationService] Push notification sent successfully: ${response}`);
      return response;
    } catch (error) {
      console.error(`[NotificationService] Error sending push notification:`, error);
      throw error;
    }
  }

  async sendNewOrderAlert(fcmToken: string, orderData: { orderId: string; amount: number; storeName: string }) {
    return this.sendPushNotification(
      fcmToken,
      'New Delivery Request! 🚀',
      `A new order of ₹${orderData.amount} is ready for pickup at ${orderData.storeName}.`,
      { type: 'NEW_ORDER', orderId: orderData.orderId },
    );
  }

  async listInbox(actor: Actor, limitInput?: string | number) {
    const limit = Math.min(100, Math.max(1, Number(limitInput || 50)));
    const rows = await this.notificationSourceRows(actor, limit);
    const sourceIds = new Set(rows.map((row) => row.id));
    const reads = await prisma.orderStatusHistory.findMany({
      where: { note: READ_NOTE, actorUserId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const readMap = new Map<string, any>();
    for (const read of reads) {
      const metadata = read.metadata as any;
      if (metadata?.recipientUserId === actor.id && metadata?.sourceHistoryId && sourceIds.has(metadata.sourceHistoryId)) {
        readMap.set(metadata.sourceHistoryId, metadata);
      }
    }

    const items = rows.map((row) => this.toInboxItem(row, actor, readMap.get(row.id)?.readAt || null));
    return { items, unreadCount: items.filter((item) => !item.readAt).length };
  }

  async markRead(actor: Actor, sourceHistoryId: string) {
    const inbox = await this.listInbox(actor, 100);
    const item = inbox.items.find((row) => row.sourceHistoryId === sourceHistoryId || row.id === sourceHistoryId);
    if (!item) throw new NotFoundException('Notification not found');
    if (item.readAt) return { ok: true, readAt: item.readAt };

    const order = await prisma.order.findUnique({ where: { id: item.orderId }, select: { status: true } });
    if (!order) throw new NotFoundException('Order not found');
    const readAt = new Date().toISOString();
    await prisma.orderStatusHistory.create({
      data: {
        orderId: item.orderId,
        fromStatus: order.status,
        toStatus: order.status,
        actorUserId: actor.id,
        actorRole: actor.role,
        note: READ_NOTE,
        metadata: { event: 'NOTIFICATION_MARKED_READ', sourceHistoryId: item.sourceHistoryId, recipientUserId: actor.id, readAt },
      },
    });
    return { ok: true, readAt };
  }

  async createBroadcastPlaceholder(actor: Actor, input: { title?: string; body?: string; audience?: string }) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only admin can create broadcast placeholder');
    const title = input.title?.trim();
    const body = input.body?.trim();
    if (!title) throw new BadRequestException('title is required');
    if (!body) throw new BadRequestException('body is required');
    return {
      ok: true,
      status: 'PLACEHOLDER_ONLY',
      broadcast: {
        title,
        body,
        audience: input.audience || 'ALL_USERS',
        note: 'Broadcast storage will move to a dedicated Notification table in a future migration phase.',
      },
    };
  }

  async processOutboxEvent(event: any) {
    const metadata = event.metadata || {};
    const orderId = metadata.orderId;
    if (!orderId) return;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { store: { include: { owner: true } }, customer: true, rider: { include: { user: true } } },
    });
    if (!order) return;

    const recipients = new Set<string>();
    if (order.customerId) recipients.add(order.customerId);
    if (order.store?.ownerId) recipients.add(order.store.ownerId);
    if (order.rider?.userId) recipients.add(order.rider.userId);

    for (const recipientId of recipients) {
      const user = await prisma.user.findUnique({ where: { id: recipientId }, select: { fcmToken: true, role: true } });
      if (user?.fcmToken) {
        const title = event.title || metadata.event || 'Order Update';
        const body = event.body || `Order #${orderId.slice(0, 8).toUpperCase()} has been updated.`;
        await this.sendPushNotification(user.fcmToken, title, body, { orderId, event: metadata.event });
      }
    }
  }

  private async notificationSourceRows(actor: Actor, limit: number) {
    const baseWhere: any = { note: { notIn: [READ_NOTE] }, createdAt: { lte: new Date() } };

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
        where: { note: { in: ['Customer opened support ticket.', BROADCAST_NOTE] } },
        include: { order: { include: { store: { select: { name: true } }, customer: { select: { name: true, email: true, phone: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    return [];
  }

  private toInboxItem(row: any, actor: Actor, readAt: string | null): InboxItem {
    const metadata = row.metadata || {};
    const type = metadata.event || `ORDER_${row.toStatus}`;
    const statusLabel = String(row.toStatus || '').replace(/_/g, ' ');
    const title = this.titleFor(type, row.toStatus, actor.role);
    const body = this.bodyFor(type, row, statusLabel, actor.role);
    return { id: row.id, sourceHistoryId: row.id, orderId: row.orderId, type, title, body, createdAt: row.createdAt, readAt, metadata };
  }

  private titleFor(type: string, status: OrderStatus, role: Role) {
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

  private bodyFor(type: string, row: any, statusLabel: string, role: Role) {
    if (type === 'CUSTOMER_SUPPORT_TICKET_OPENED') return `${row.order?.customer?.name || 'Customer'} opened a ${row.metadata?.category || 'support'} ticket.`;
    if (type === 'CUSTOMER_RATING_SUBMITTED') return 'A customer submitted a post-delivery rating.';
    const storeName = row.order?.store?.name || 'store';
    if (role === Role.CUSTOMER) return row.note || `Your order is now ${statusLabel}.`;
    if (role === Role.STORE_OWNER) return `Order ${row.orderId.slice(-8).toUpperCase()} is now ${statusLabel}.`;
    if (role === Role.RIDER) return `Delivery order from ${storeName} is now ${statusLabel}.`;
    return row.note || `Order ${row.orderId.slice(-8).toUpperCase()} updated.`;
  }
}
