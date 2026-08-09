import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { PartnerInboxRole } from './notification-audience';

@Injectable()
export class PartnerNotificationInboxService {
  async list(userId: string, role: PartnerInboxRole, limitInput?: string | number) {
    const limit = Math.min(100, Math.max(1, Number(limitInput || 50)));
    const recipients = await prisma.notificationRecipient.findMany({
      where: { userId, recipientRole: role as Role },
      include: { notification: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });

    const items = recipients.map((recipient) => {
      const notification = recipient.notification;
      const data = (notification.data || {}) as any;
      return {
        id: recipient.id,
        recipientId: recipient.id,
        sourceHistoryId: data.legacySourceHistoryId || recipient.id,
        orderId: notification.orderId || '',
        deliveryJobId: notification.deliveryJobId || null,
        type: data.legacyType || notification.eventType,
        title: notification.title,
        body: notification.body,
        deepLink: data.recipientDeepLink
          || notification.deepLink
          || (role === Role.STORE_OWNER ? '/store/notifications' : '/rider'),
        createdAt: notification.createdAt,
        sentAt: recipient.sentAt,
        openedAt: recipient.openedAt,
        readAt: recipient.readAt,
        status: recipient.status,
        metadata: data,
      };
    });

    return {
      items,
      unreadCount: items.filter((item) => !item.readAt).length,
      source: 'PARTNER_ROLE_SCOPED',
    };
  }

  async markRead(userId: string, role: PartnerInboxRole, recipientId: string) {
    const recipient = await prisma.notificationRecipient.findFirst({
      where: { id: recipientId, userId, recipientRole: role as Role },
    });
    if (!recipient) throw new NotFoundException('Notification not found');
    const readAt = recipient.readAt || new Date();
    const updated = await prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: { status: 'READ', readAt, openedAt: recipient.openedAt || readAt },
    });
    return { ok: true, readAt: updated.readAt, recipientId: updated.id };
  }

  async markOpened(userId: string, role: PartnerInboxRole, recipientId: string) {
    const recipient = await prisma.notificationRecipient.findFirst({
      where: { id: recipientId, userId, recipientRole: role as Role },
    });
    if (!recipient) throw new NotFoundException('Notification not found');
    const openedAt = recipient.openedAt || new Date();
    const updated = await prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: { status: recipient.readAt ? 'READ' : 'OPENED', openedAt },
    });
    return { ok: true, openedAt: updated.openedAt };
  }
}
