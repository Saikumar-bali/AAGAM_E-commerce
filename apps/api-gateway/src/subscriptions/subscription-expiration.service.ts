import { Injectable, Logger } from '@nestjs/common';
import { CustomerSubscriptionStatus, Prisma, Role, prisma } from '@aagam/database';
import { enqueueOutboxEvent } from '../notifications/outbox.service';

const EXPIRY_WINDOW_DAYS = 3;

@Injectable()
export class SubscriptionExpirationService {
  private readonly logger = new Logger(SubscriptionExpirationService.name);

  async checkAndNotify(): Promise<{ notified: number; skipped: number }> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 86_400_000);

    const expiring = await prisma.customerSubscription.findMany({
      where: {
        status: { notIn: [CustomerSubscriptionStatus.CANCELLED, CustomerSubscriptionStatus.COMPLETED] },
        endDate: { gte: now, lte: windowEnd },
      },
      include: {
        customer: { select: { id: true, name: true } },
        plan: { select: { name: true } },
      },
    });

    let notified = 0;
    let skipped = 0;

    for (const subscription of expiring) {
      const daysUntilExpiry = Math.ceil(
        (subscription.endDate.getTime() - now.getTime()) / 86_400_000,
      );
      if (daysUntilExpiry < 1 || daysUntilExpiry > EXPIRY_WINDOW_DAYS) {
        skipped++;
        continue;
      }

      const idempotencyKey = `subscription-expiring:${subscription.id}:d${daysUntilExpiry}`;
      try {
        await enqueueOutboxEvent(prisma, {
          eventType: 'SUBSCRIPTION_EXPIRING',
          aggregateType: 'SYSTEM',
          aggregateId: subscription.id,
          idempotencyKey,
          payload: {
            title: `Subscription expiring in ${daysUntilExpiry} day${daysUntilExpiry > 1 ? 's' : ''}`,
            body: `${subscription.plan.name} subscription ends on ${subscription.endDate.toISOString().slice(0, 10)}. Consider renewing or pausing before the end date.`,
            audience: 'TARGETED',
            deepLink: '/shop/subscriptions',
            targetRecipients: [
              { userId: subscription.customerId, role: Role.CUSTOMER },
            ],
            metadata: {
              kind: 'SUBSCRIPTION_EXPIRING',
              subscriptionId: subscription.id,
              planId: subscription.planId,
              planName: subscription.plan.name,
              endDate: subscription.endDate.toISOString(),
              daysUntilExpiry,
            },
          },
        });
        notified++;
      } catch (error: unknown) {
        this.logger.warn(
          `Failed to notify subscription ${subscription.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        skipped++;
      }
    }

    return { notified, skipped };
  }
}
