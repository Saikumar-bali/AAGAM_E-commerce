import { Injectable } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { isNotificationForRole, PartnerInboxRole } from './notification-audience';

@Injectable()
export class PartnerNotificationInboxService {
  async list(userId: string, role: PartnerInboxRole, limitInput?: string | number) {
    const limit = Math.min(100, Math.max(1, Number(limitInput || 50)));
    const pageSize = Math.max(50, Math.min(100, limit * 2));
    const items: any[] = [];
    let skip = 0;

    // Filter canonical rows before the requested page is finalized. This keeps
    // migrated OrderStatusHistory recipients from occupying the `take: limit`
    // window and hiding older valid Partner alerts.
    while (items.length < limit) {
      const recipients = await prisma.notificationRecipient.findMany({
        where: { userId },
        include: { notification: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      });
      if (recipients.length === 0) break;
      skip += recipients.length;

      for (const recipient of recipients) {
        const notification = recipient.notification;
        const data = (notification.data || {}) as any;
        if (data.migratedFromOrderHistory === true) continue;
        if (!isNotificationForRole(role, notification.eventType, data)) continue;

        items.push({
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
        });
        if (items.length >= limit) break;
      }

      if (recipients.length < pageSize) break;
    }

    return {
      items,
      unreadCount: items.filter((item) => !item.readAt).length,
      source: 'PARTNER_SCOPED',
    };
  }
}
