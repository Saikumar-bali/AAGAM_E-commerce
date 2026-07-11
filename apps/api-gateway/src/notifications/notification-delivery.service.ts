import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { WebPushService } from './web-push.service';

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly webPush: WebPushService) {}

  private async pushEnabled(userId: string, eventType: string) {
    const preferences = await prisma.notificationPreference.findMany({
      where: { userId, eventType: { in: ['*', eventType] } },
    });
    const specific = preferences.find((preference) => preference.eventType === eventType);
    const fallback = preferences.find((preference) => preference.eventType === '*');
    return (specific || fallback)?.pushEnabled !== false;
  }

  private recipientDeepLink(role: Role, orderId?: string | null, configured?: string | null) {
    if (configured) return configured;
    if (role === Role.ADMIN) return orderId ? `/admin/orders/${orderId}` : '/admin/notifications';
    if (role === Role.STORE_OWNER) return '/store/notifications';
    if (role === Role.RIDER) return '/rider';
    return orderId ? `/shop/orders/${orderId}` : '/shop/notifications';
  }

  async deliverRecipient(recipientId: string) {
    const recipient = await prisma.notificationRecipient.findUnique({
      where: { id: recipientId },
      include: {
        notification: true,
        user: { select: { role: true } },
      },
    });
    if (!recipient) throw new NotFoundException('Notification recipient not found');
    if (['READ', 'OPENED'].includes(recipient.status)) return recipient;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: recipient.userId, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });

    if (!(await this.pushEnabled(recipient.userId, recipient.notification.eventType))) {
      return prisma.notificationRecipient.update({
        where: { id: recipient.id },
        data: { status: 'SENT', sentAt: recipient.sentAt || new Date(), failureReason: null },
      });
    }

    if (subscriptions.length === 0) {
      return prisma.notificationRecipient.update({
        where: { id: recipient.id },
        data: { status: 'SENT', sentAt: recipient.sentAt || new Date(), failureReason: null },
      });
    }

    let sentCount = 0;
    let skippedCount = 0;
    const failures: string[] = [];
    const deepLink = this.recipientDeepLink(
      recipient.user.role,
      recipient.notification.orderId,
      recipient.notification.deepLink,
    );

    for (const subscription of subscriptions) {
      const previousAttempts = await prisma.notificationDeliveryAttempt.count({
        where: { recipientId: recipient.id, subscriptionId: subscription.id },
      });
      const attemptNumber = previousAttempts + 1;

      try {
        const result = await this.webPush.send(subscription, {
          title: recipient.notification.title,
          body: recipient.notification.body,
          deepLink,
          data: {
            ...(recipient.notification.data as any || {}),
            notificationId: recipient.notification.id,
            recipientId: recipient.id,
            eventType: recipient.notification.eventType,
            deepLink,
          },
        });

        if (result.status === 'SENT') {
          sentCount += 1;
          await prisma.notificationDeliveryAttempt.create({
            data: {
              recipientId: recipient.id,
              subscriptionId: subscription.id,
              attemptNumber,
              provider: subscription.provider,
              status: 'SENT',
              responseId: result.responseId,
            },
          });
        } else {
          skippedCount += 1;
          await prisma.notificationDeliveryAttempt.create({
            data: {
              recipientId: recipient.id,
              subscriptionId: subscription.id,
              attemptNumber,
              provider: subscription.provider,
              status: 'SKIPPED',
              errorMessage: result.reason,
            },
          });
        }
      } catch (error: any) {
        const code = String(error?.code || error?.errorInfo?.code || 'PUSH_SEND_FAILED');
        const message = String(error?.message || error).slice(0, 2000);
        failures.push(`${code}: ${message}`);

        await prisma.notificationDeliveryAttempt.create({
          data: {
            recipientId: recipient.id,
            subscriptionId: subscription.id,
            attemptNumber,
            provider: subscription.provider,
            status: 'FAILED',
            errorCode: code,
            errorMessage: message,
            nextRetryAt: new Date(Date.now() + Math.min(300, Math.pow(2, attemptNumber) * 10) * 1000),
          },
        });

        if (this.webPush.isInvalidSubscriptionError(error)) {
          await prisma.pushSubscription.update({
            where: { id: subscription.id },
            data: { isActive: false, invalidatedAt: new Date() },
          });
        }
      }
    }

    if (sentCount > 0 || skippedCount > 0) {
      return prisma.notificationRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'SENT',
          sentAt: recipient.sentAt || new Date(),
          failedAt: null,
          failureReason: failures.length ? failures.join(' | ').slice(0, 2000) : null,
        },
      });
    }

    await prisma.notificationRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason: failures.join(' | ').slice(0, 2000) || 'All push attempts failed',
      },
    });
    throw new Error(failures.join(' | ') || 'All push attempts failed');
  }
}
