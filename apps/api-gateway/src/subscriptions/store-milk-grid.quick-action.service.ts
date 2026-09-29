/**
 * Single-delivery quick actions.
 *
 * Split out of the former store-milk-grid.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { NotFoundException, ForbiddenException, BadRequestException, Injectable } from "@nestjs/common";
import { prisma, Role, SubscriptionDeliveryStatus } from "@aagam/database";
import { parseVolumeLiters } from "./delivery-add-on";
import { computeVoidAdjustment } from "./subscription-balances";
import { randomUUID } from "crypto";
import { StoreMilkGridBase } from "./store-milk-grid.base";

@Injectable()
export class StoreMilkGridQuickActionService extends StoreMilkGridBase {
  async executeQuickAction(
    actor: { id: string; role: Role; email?: string },
    deliveryId: string,
    action: {
      type: 'TOGGLE_DELIVERED' | 'SKIP' | 'EXTRA_MILK' | 'TOGGLE_SLOT' | 'RECORD_PAYMENT' | 'VOID_PAYMENT' | 'ATTACH_EVENING_MILK';
      extraQuantity?: string;
      extraPaise?: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      amountPaise?: number;
      note?: string;
      consecutiveDays?: number;
      targetSlot?: 'AM' | 'PM';
    },
  ) {
    const delivery = await prisma.subscriptionDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        subscription: {
          include: {
            homeStore: { select: { ownerId: true } },
          },
        },
      },
    });

    if (!delivery) throw new NotFoundException('Delivery not found');

    const isMaster = actor.role === Role.ADMIN || (actor.email && (actor.email.includes('aagaam') || actor.email.includes('aagam') || actor.email.includes('store@')));
    if (!isMaster && delivery.subscription.homeStore?.ownerId !== actor.id) {
      throw new ForbiddenException('You can only update deliveries for your assigned store');
    }

    const sub = delivery.subscription;

    if (action.type === 'TOGGLE_DELIVERED') {
      const isCurrentlyDelivered = delivery.status === 'DELIVERED';
      const wasSkipped = delivery.status === 'SKIPPED';
      const newStatus = isCurrentlyDelivered ? SubscriptionDeliveryStatus.SCHEDULED : SubscriptionDeliveryStatus.DELIVERED;
      const countDelta = isCurrentlyDelivered ? -1 : 1;
      const newCompleted = Math.max(0, (sub.completedDeliveries || 0) + countDelta);
      const newSkipped = wasSkipped ? Math.max(0, (sub.skippedDeliveries || 0) - 1) : (sub.skippedDeliveries || 0);

      // If completing, optionally collect positive cash. If untoggling, rollback this delivery's collected cash.
      let cashDelta = 0;
      let updatedCashCollected = delivery.cashCollectedPaise || 0;
      if (!isCurrentlyDelivered) {
        if (action.amountPaise && action.amountPaise > 0) {
          cashDelta = action.amountPaise;
          updatedCashCollected = (delivery.cashCollectedPaise || 0) + cashDelta;
        }
      } else {
        if (delivery.cashCollectedPaise && delivery.cashCollectedPaise > 0) {
          cashDelta = -delivery.cashCollectedPaise;
          updatedCashCollected = 0;
        }
      }

      const updated = await prisma.$transaction([
        prisma.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            status: newStatus,
            deliveredAt: isCurrentlyDelivered ? null : new Date(),
            deliveredByStoreUserId: isCurrentlyDelivered ? null : actor.id,
            cashCollectedPaise: updatedCashCollected,
            cashCollectedAt: cashDelta > 0 ? new Date() : (isCurrentlyDelivered ? null : delivery.cashCollectedAt),
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            completedDeliveries: newCompleted,
            skippedDeliveries: newSkipped,
            amountCollectedPaise: Math.max(0, (sub.amountCollectedPaise || 0) + cashDelta),
            amountDuePaise: Math.max(0, (sub.amountDuePaise || 0) - cashDelta),
          },
        }),
      ]);

      return { success: true, delivery: updated[0], subscription: updated[1] };
    }

    if (action.type === 'SKIP') {
      const wasDelivered = delivery.status === 'DELIVERED';
      const wasSkipped = delivery.status === 'SKIPPED';
      if (wasSkipped) {
        return { success: true, delivery, subscription: sub }; // already skipped
      }
      const newCompleted = wasDelivered ? Math.max(0, (sub.completedDeliveries || 0) - 1) : (sub.completedDeliveries || 0);
      const newSkipped = (sub.skippedDeliveries || 0) + 1;

      let cashDelta = 0;
      let updatedCashCollected = delivery.cashCollectedPaise || 0;
      if (wasDelivered && delivery.cashCollectedPaise && delivery.cashCollectedPaise > 0) {
        cashDelta = -delivery.cashCollectedPaise;
        updatedCashCollected = 0;
      }

      const updated = await prisma.$transaction([
        prisma.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            status: SubscriptionDeliveryStatus.SKIPPED,
            skippedAt: new Date(),
            skipReason: action.note?.trim() || 'Not taken / Skipped by customer',
            deliveredAt: null,
            deliveredByStoreUserId: null,
            cashCollectedPaise: updatedCashCollected,
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            completedDeliveries: newCompleted,
            skippedDeliveries: newSkipped,
            amountCollectedPaise: Math.max(0, (sub.amountCollectedPaise || 0) + cashDelta),
            amountDuePaise: Math.max(0, (sub.amountDuePaise || 0) - cashDelta),
          },
        }),
      ]);

      return { success: true, delivery: updated[0], subscription: updated[1] };
    }

    if (action.type === 'ATTACH_EVENING_MILK') {
      const extraQty = action.extraQuantity?.trim() || '+1L BM';
      const count = Math.max(1, Math.min(30, action.consecutiveDays || 4));
      // The slot arrives from a request body, so TypeScript's `string` type
      // gives no runtime guarantee. Reject anything but AM/PM rather than
      // persisting a value the grid would later read as PM.
      const targetSlot = action.targetSlot === 'AM' || action.targetSlot === 'PM' ? action.targetSlot : 'PM';
      const extraPaise = this.resolveExtraPaise(action.extraPaise) ?? this.defaultExtraPricePaise(extraQty);
      const note = `[ADD-ON: ${extraQty}|${extraPaise}|${targetSlot}] ${action.note || ''}`.trim();

      const targetDeliveries = await prisma.subscriptionDelivery.findMany({
        where: {
          subscriptionId: sub.id,
          sequenceNumber: {
            gte: delivery.sequenceNumber,
            lt: delivery.sequenceNumber + count,
          },
        },
        orderBy: { sequenceNumber: 'asc' },
      });

      const totalExtraPaise = extraPaise * targetDeliveries.length;
      await prisma.$transaction([
        prisma.subscriptionDelivery.updateMany({
          where: { id: { in: targetDeliveries.map((d) => d.id) } },
          data: {
            // The base delivery keeps its own slot. Overwriting it here
            // rerouted the customer's existing delivery to the add-on slot
            // instead of merely attaching an add-on to it.
            deferredReason: note,
            cashDuePaise: { increment: extraPaise },
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            amountDuePaise: (sub.amountDuePaise || 0) + totalExtraPaise,
          },
        }),
      ]);

      return { success: true, count: targetDeliveries.length, message: `Attached ${extraQty} (${targetSlot}) for ${targetDeliveries.length} day${targetDeliveries.length > 1 ? 's' : ''}!` };
    }

    if (action.type === 'EXTRA_MILK') {
      const extraQty = action.extraQuantity?.trim() || '+1L';
      const count = Math.max(1, Math.min(30, action.consecutiveDays || 1));
      const extraPaise = this.resolveExtraPaise(action.extraPaise, action.amountPaise)
        ?? this.defaultExtraPricePaise(extraQty);
      const notePrefix = `[EXTRA: ${extraQty}|${extraPaise}]`;
      const fullNote = `${notePrefix} ${action.note?.trim() || 'Extra milk requested'}`.trim();

      const targetDeliveries = count > 1
        ? await prisma.subscriptionDelivery.findMany({
            where: {
              subscriptionId: sub.id,
              sequenceNumber: {
                gte: delivery.sequenceNumber,
                lt: delivery.sequenceNumber + count,
              },
            },
          })
        : [delivery];

      const totalExtraPaise = extraPaise * targetDeliveries.length;
      const updated = await prisma.$transaction([
        prisma.subscriptionDelivery.updateMany({
          where: { id: { in: targetDeliveries.map((d) => d.id) } },
          data: {
            deferredReason: fullNote,
            cashDuePaise: { increment: extraPaise },
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            amountDuePaise: (sub.amountDuePaise || 0) + totalExtraPaise,
          },
        }),
      ]);

      return { success: true, count: targetDeliveries.length, subscription: updated[1] };
    }

    if (action.type === 'TOGGLE_SLOT') {
      const count = Math.max(1, Math.min(30, action.consecutiveDays || 1));
      const newSlot = action.targetSlot || (delivery.deliverySlot === 'AM' ? 'PM' : 'AM');

      const targetDeliveries = count > 1
        ? await prisma.subscriptionDelivery.findMany({
            where: {
              subscriptionId: sub.id,
              sequenceNumber: {
                gte: delivery.sequenceNumber,
                lt: delivery.sequenceNumber + count,
              },
            },
          })
        : [delivery];

      await prisma.subscriptionDelivery.updateMany({
        where: { id: { in: targetDeliveries.map((d) => d.id) } },
        data: { deliverySlot: newSlot },
      });

      return { success: true, count: targetDeliveries.length, newSlot };
    }

    if (action.type === 'RECORD_PAYMENT') {
      const amtPaise = action.amountPaise || 0;
      if (amtPaise <= 0) throw new BadRequestException('Payment amount must be greater than 0');

      const modeTag = action.paymentMode === 'PHONE_PE' ? '[PHONE_PE]' : '[CASH]';
      const noteTag = `${modeTag} ${action.note || ''}`.trim();

      const updated = await prisma.$transaction([
        prisma.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            cashCollectedPaise: (delivery.cashCollectedPaise || 0) + amtPaise,
            cashCollectedAt: new Date(),
            failureReason: noteTag,
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            amountCollectedPaise: (sub.amountCollectedPaise || 0) + amtPaise,
            amountDuePaise: Math.max(0, (sub.amountDuePaise || 0) - amtPaise),
          },
        }),
      ]);

      return { success: true, delivery: updated[0], subscription: updated[1] };
    }

    if (action.type === 'VOID_PAYMENT') {
      const collectedOnCell = Math.max(0, delivery.cashCollectedPaise || 0);
      if (collectedOnCell <= 0) {
        throw new BadRequestException('This delivery has no recorded payment to void');
      }
      const requested = action.amountPaise && action.amountPaise > 0 ? action.amountPaise : collectedOnCell;
      const voidPaise = Math.min(requested, collectedOnCell);

      const remainingCellCash = collectedOnCell - voidPaise;
      const { amountCollectedPaise, dueRestoredPaise } = computeVoidAdjustment(
        sub.amountCollectedPaise,
        voidPaise,
      );

      await prisma.$transaction([
        prisma.subscriptionDelivery.update({
          where: { id: deliveryId },
          data: {
            cashCollectedPaise: remainingCellCash,
            cashCollectedAt: remainingCellCash > 0 ? delivery.cashCollectedAt : null,
            failureReason: remainingCellCash > 0
              ? delivery.failureReason
              : null,
          },
        }),
        prisma.customerSubscription.update({
          where: { id: sub.id },
          data: {
            amountCollectedPaise,
            // Return only the amount actually removed from the raw collected
            // ledger so collected + due continues to equal the subscription
            // price, even when the ledger was already short of the cash
            // evidenced on this delivery.
            amountDuePaise: (sub.amountDuePaise || 0) + dueRestoredPaise,
          },
        }),
        prisma.subscriptionAuditEntry.create({
          data: {
            subscriptionId: sub.id,
            actorUserId: actor.id,
            actorRole: actor.role,
            action: 'PAYMENT_VOIDED',
            reason: action.note?.trim() || `Voided ₹${(voidPaise / 100).toFixed(2)} recorded on delivery ${delivery.sequenceNumber}`,
            metadata: {
              deliveryId,
              voidedPaise: voidPaise,
              cellCashBeforePaise: collectedOnCell,
              cellCashAfterPaise: remainingCellCash,
              ledgerCollectedBeforePaise: sub.amountCollectedPaise || 0,
              ledgerDueBeforePaise: sub.amountDuePaise || 0,
            },
            idempotencyKey: `payment-void:${deliveryId}:${randomUUID()}`,
          },
        }),
      ]);

      return {
        success: true,
        voidedPaise: voidPaise,
        cellCashCollectedPaise: remainingCellCash,
      };
    }

    throw new BadRequestException('Unsupported action type');
  }

  private resolveExtraPaise(...candidates: Array<number | undefined | null>): number | null {
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
        return Math.round(candidate);
      }
    }
    return null;
  }

  private defaultExtraPricePaise(extraQty: string): number {
    const liters = parseVolumeLiters(extraQty);
    const isCow = extraQty.toUpperCase().includes('CM');
    if (liters === 2) return 16000;
    if (liters === 0.25) return isCow ? 1750 : 2000;
    if (liters === 0.5) return isCow ? 3500 : 4000;
    return isCow ? 7000 : 8000;
  }
}
