/**
 * Payment recording and delivered-delivery reconciliation.
 *
 * Split out of the former subscription-admin-reporting.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerSubscriptionStatus, DeliveryJobStatus, Prisma, Role, SubscriptionDeliveryStatus, prisma } from '@aagam/database';
import { randomUUID } from 'crypto';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';

@Injectable()
export class SubscriptionAdminReportingPaymentsService {
  constructor(private readonly funding: SubscriptionCashFundingService) {}

  async reconcileDeliveredDelivery(deliveryId: string, actorId: string, idempotencyKey?: string) {
    return prisma.$transaction(async (tx) => {
      const delivery = await tx.subscriptionDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          deliveryJob: { include: { order: { include: { payment: true } } } },
        },
      });
      if (!delivery) throw new NotFoundException('Subscription delivery not found');
      if (delivery.status === SubscriptionDeliveryStatus.DELIVERED) return delivery;
      if (!delivery.deliveryJob) {
        throw new ConflictException('Subscription delivery has no delivery job');
      }
      if (delivery.deliveryJob.status !== DeliveryJobStatus.DELIVERED) {
        throw new ConflictException('Delivery job is not DELIVERED — reconciliation requires a completed delivery');
      }
      const key = idempotencyKey || `admin-reconcile:${delivery.id}`;
      const existingAudit = await tx.subscriptionAuditEntry.findUnique({ where: { idempotencyKey: key } });
      if (existingAudit) return delivery;
      await this.funding.reconcileDeliveredWithinTransaction(
        tx,
        delivery.deliveryJob,
        { id: actorId, role: Role.ADMIN },
      );
      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: delivery.subscriptionId,
          actorUserId: actorId,
          actorRole: Role.ADMIN,
          action: 'DELIVERY_RECONCILED_BY_ADMIN',
          reason: 'Delivery job was completed through the order flow; subscription reconciled manually',
          metadata: { subscriptionDeliveryId: delivery.id, deliveryJobId: delivery.deliveryJob.id },
          idempotencyKey: key,
        },
      });
      return tx.subscriptionDelivery.findUnique({ where: { id: delivery.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async recordCustomerPayment(
    subscriptionId: string,
    dto: {
      amountPaise: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      reference?: string;
      note?: string;
    },
    actorId: string,
    actorRole: Role = Role.ADMIN,
  ) {
    return prisma.$transaction(async (tx) => {
      const sub = await tx.customerSubscription.findUnique({
        where: { id: subscriptionId },
      });
      if (!sub) throw new NotFoundException('Subscription not found');

      const outstandingDue = sub.amountDuePaise || 0;
      if (outstandingDue <= 0) {
        throw new BadRequestException('This subscription has no outstanding due balance to collect');
      }

      const amountToCredit = Math.max(0, dto.amountPaise);
      if (amountToCredit <= 0) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
      if (amountToCredit > outstandingDue) {
        throw new BadRequestException(
          `Payment amount (₹${(amountToCredit / 100).toFixed(2)}) cannot exceed outstanding due balance of ₹${(outstandingDue / 100).toFixed(2)}`,
        );
      }

      const newCollected = (sub.amountCollectedPaise || 0) + amountToCredit;
      const newDue = Math.max(0, outstandingDue - amountToCredit);
      const newStatus = newDue === 0 && sub.status === CustomerSubscriptionStatus.PENDING_CASH_COLLECTION
        ? CustomerSubscriptionStatus.ACTIVE
        : sub.status;

      const updated = await tx.customerSubscription.update({
        where: { id: subscriptionId },
        data: {
          amountCollectedPaise: newCollected,
          amountDuePaise: newDue,
          status: newStatus,
        },
      });

      await tx.subscriptionAuditEntry.create({
        data: {
          subscriptionId: sub.id,
          actorUserId: actorId,
          actorRole,
          action: 'PAYMENT_RECORDED',
          reason: dto.note || `Recorded payment of ₹${(amountToCredit / 100).toFixed(2)} via ${dto.paymentMode || 'CASH'}`,
          metadata: {
            amountPaise: amountToCredit,
            paymentMode: dto.paymentMode || 'CASH',
            reference: dto.reference || null,
            previousCollectedPaise: sub.amountCollectedPaise,
            newCollectedPaise: newCollected,
            previousDuePaise: sub.amountDuePaise,
            newDuePaise: newDue,
          },
          idempotencyKey: `payment:${sub.id}:${Date.now()}:${randomUUID()}`,
        },
      });

      return {
        subscriptionId: sub.id,
        amountCollectedPaise: newCollected,
        amountDuePaise: newDue,
        status: newStatus,
        paymentRecordedPaise: amountToCredit,
        paymentMode: dto.paymentMode || 'CASH',
      };
    });
  }
}
