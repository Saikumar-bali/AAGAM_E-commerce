/**
 * Admin subscription balance correction.
 *
 * Split out of the former subscription-admin-reporting.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerSubscriptionStatus, Prisma, Role, prisma } from '@aagam/database';
import { AdminSubscriptionCorrectionDto } from './subscriptions.dto';

@Injectable()
export class SubscriptionAdminReportingCorrectionService {
  async correctSubscription(id: string, dto: AdminSubscriptionCorrectionDto, actorId: string, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-correction:${id}`}))`);
      const subscription = await tx.customerSubscription.findUnique({ where: { id } });
      if (!subscription) throw new NotFoundException('Subscription not found');
      const key = idempotencyKey || `subscription-correction:${id}:${Date.now()}`;
      const existing = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return subscription;
      const remainingFundedDeliveries = subscription.remainingFundedDeliveries + dto.fundedDeliveryDelta;
      const amountDuePaise = subscription.amountDuePaise + dto.amountDueDeltaPaise;
      if (remainingFundedDeliveries < 0 || amountDuePaise < 0) {
        throw new BadRequestException('Correction would create negative subscription balances');
      }
      const updated = await tx.customerSubscription.update({
        where: { id },
        data: {
          remainingFundedDeliveries,
          fundedDeliveryCount: subscription.fundedDeliveryCount + Math.max(0, dto.fundedDeliveryDelta),
          amountDuePaise,
          status: remainingFundedDeliveries > 0 ? CustomerSubscriptionStatus.ACTIVE : CustomerSubscriptionStatus.PAYMENT_DUE,
        },
      });
      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: id,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'ADMIN_COMPENSATING_CORRECTION',
          reason: dto.reason.trim(),
          metadata: {
            fundedDeliveryDelta: dto.fundedDeliveryDelta,
            amountDueDeltaPaise: dto.amountDueDeltaPaise,
            before: { remainingFundedDeliveries: subscription.remainingFundedDeliveries, amountDuePaise: subscription.amountDuePaise },
            after: { remainingFundedDeliveries, amountDuePaise },
          },
          idempotencyKey: key,
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
