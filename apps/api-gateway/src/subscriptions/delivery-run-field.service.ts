/**
 * Extra milk, slot toggling, payment capture and skips.
 *
 * Split out of the former delivery-run-operations.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeliveryRunStopStatus, SubscriptionDeliveryStatus, prisma } from '@aagam/database';
import { RiderExtraMilkDto, RiderRecordPaymentDto, RiderToggleSlotDto } from './subscriptions.dto';
import { DeliveryRunOperationsServiceBase, Actor } from './delivery-run-operations.service.base';

export class DeliveryRunFieldService extends DeliveryRunOperationsServiceBase {
  async extraMilk(
    runId: string,
    stopId: string,
    dto: RiderExtraMilkDto,
    actor: Actor,
  ) {
    const { run } = await this.ownedRun(runId, actor);
    const stop = run.stops.find((candidate) => candidate.id === stopId);
    if (!stop) throw new NotFoundException('Run stop not found');

    const extraQty = dto.extraQuantity?.trim() || '+1L';
    const extraPaise = dto.extraPaise !== undefined ? dto.extraPaise : 8000;
    const notePrefix = `[EXTRA: ${extraQty}|${extraPaise}]`;
    const fullNote = `${notePrefix} ${dto.note?.trim() || 'Rider field add-on'}`.trim();
    const count = Math.max(1, Math.min(30, dto.consecutiveDays || 1));

    return prisma.$transaction(async (tx) => {
      await tx.subscriptionDelivery.update({
        where: { id: stop.subscriptionDeliveryId },
        data: {
          deferredReason: fullNote,
          cashDuePaise: { increment: extraPaise },
        },
      });
      await tx.deliveryRunStop.update({
        where: { id: stop.id },
        data: {
          cashDuePaise: { increment: extraPaise },
          version: { increment: 1 },
        },
      });
      await tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          expectedCashPaise: { increment: extraPaise },
          version: { increment: 1 },
        },
      });

      let futureScheduledCount = 0;
      if (count > 1) {
        const curDelivery = await tx.subscriptionDelivery.findUnique({
          where: { id: stop.subscriptionDeliveryId },
          select: { sequenceNumber: true, subscriptionId: true },
        });
        if (curDelivery) {
          const futureDeliveries = await tx.subscriptionDelivery.findMany({
            where: {
              subscriptionId: curDelivery.subscriptionId,
              sequenceNumber: {
                gt: curDelivery.sequenceNumber,
                lt: curDelivery.sequenceNumber + count,
              },
              status: { in: [SubscriptionDeliveryStatus.SCHEDULED, SubscriptionDeliveryStatus.ORDER_GENERATED, SubscriptionDeliveryStatus.PREPARING] },
            },
            select: { id: true },
          });
          if (futureDeliveries.length > 0) {
            await tx.subscriptionDelivery.updateMany({
              where: { id: { in: futureDeliveries.map((d) => d.id) } },
              data: {
                deferredReason: fullNote,
                cashDuePaise: { increment: extraPaise },
              },
            });
            futureScheduledCount = futureDeliveries.length;
          }
        }
      }

      const totalScheduledDays = 1 + futureScheduledCount;
      const totalExtraPaise = extraPaise * totalScheduledDays;

      const sub = await tx.customerSubscription.update({
        where: { id: stop.subscriptionDelivery.subscriptionId },
        data: {
          amountDuePaise: { increment: totalExtraPaise },
        },
      });
      return {
        success: true,
        extraPaise,
        extraQuantity: extraQty,
        scheduledDays: totalScheduledDays,
        totalExtraPaise,
        subscription: sub,
      };
    });
  }

  async toggleSlot(
    runId: string,
    stopId: string,
    dto: RiderToggleSlotDto,
    actor: Actor,
  ) {
    const { run } = await this.ownedRun(runId, actor);
    const stop = run.stops.find((candidate) => candidate.id === stopId);
    if (!stop) throw new NotFoundException('Run stop not found');

    const curSlot = stop.subscriptionDelivery.deliverySlot || 'AM';
    const newSlot = dto.targetSlot || (curSlot === 'AM' ? 'PM' : 'AM');

    await prisma.subscriptionDelivery.update({
      where: { id: stop.subscriptionDeliveryId },
      data: { deliverySlot: newSlot },
    });

    return { success: true, newSlot };
  }

  async recordPayment(
    runId: string,
    stopId: string,
    dto: RiderRecordPaymentDto,
    actor: Actor,
  ) {
    const { rider, run } = await this.ownedRun(runId, actor);
    const stop = run.stops.find((candidate) => candidate.id === stopId);
    if (!stop) throw new NotFoundException('Run stop not found');

    const amtPaise = dto.amountPaise;
    if (!amtPaise || amtPaise <= 0) throw new BadRequestException('Payment amount must be greater than 0');

    const mode = dto.paymentMode === 'PHONE_PE' ? '[PHONE_PE]' : '[CASH]';
    const noteTag = `${mode} ${dto.note || ''}`.trim();

    return prisma.$transaction(async (tx) => {
      await tx.subscriptionDelivery.update({
        where: { id: stop.subscriptionDeliveryId },
        data: {
          cashCollectedPaise: { increment: amtPaise },
          cashCollectedAt: new Date(),
          failureReason: noteTag,
        },
      });

      const sub = await tx.customerSubscription.update({
        where: { id: stop.subscriptionDelivery.subscriptionId },
        data: {
          amountCollectedPaise: { increment: amtPaise },
          amountDuePaise: { decrement: amtPaise },
        },
      });

      if (dto.paymentMode !== 'PHONE_PE') {
        const ledger = await tx.codLedger.findUnique({
          where: { deliveryJobId: stop.deliveryJobId },
        });
        if (ledger) {
          await tx.codLedger.update({
            where: { id: ledger.id },
            data: {
              riderId: rider.id,
              collectedAmountPaise: { increment: amtPaise },
              riderHoldingBalancePaise: { increment: amtPaise },
              collectionTimestamp: new Date(),
              status: 'HELD_BY_RIDER',
            },
          });
          await tx.codLedgerEntry.create({
            data: {
              codLedgerId: ledger.id,
              type: 'COLLECTED',
              amountPaise: amtPaise,
              holdingAfterPaise: ledger.riderHoldingBalancePaise + amtPaise,
              depositedAfterPaise: 0,
              actorUserId: actor.id,
              actorRole: actor.role,
              reference: `RUN:${run.routeCode}:STOP:${stop.sequenceNumber}:PAYMENT`,
              idempotencyKey: `cod-payment:${stop.id}:${ledger.collectedAmountPaise + amtPaise}`,
            },
          });
        } else {
          throw new ConflictException('Payment recorded for a stop with no COD ledger to hold it');
        }
      }

      return { success: true, amountPaise: amtPaise, subscription: sub };
    });
  }

  async skipStop(
    runId: string,
    stopId: string,
    dto: { reason?: string; note?: string },
    actor: Actor,
  ) {
    const { run } = await this.ownedRun(runId, actor);
    const stop = run.stops.find((candidate) => candidate.id === stopId);
    if (!stop) throw new NotFoundException('Run stop not found');

    return prisma.$transaction(async (tx) => {
      await tx.deliveryRunStop.update({
        where: { id: stopId },
        data: {
          status: DeliveryRunStopStatus.CANCELLED,
          failureReason: dto.reason || dto.note || 'Skipped by customer request',
          version: { increment: 1 },
        },
      });

      await tx.subscriptionDelivery.update({
        where: { id: stop.subscriptionDeliveryId },
        data: {
          status: SubscriptionDeliveryStatus.SKIPPED,
          skippedAt: new Date(),
          skipReason: dto.reason || dto.note || 'Skipped by customer request',
        },
      });

      await tx.customerSubscription.update({
        where: { id: stop.subscriptionDelivery.subscriptionId },
        data: {
          skippedDeliveries: { increment: 1 },
        },
      });

      await tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          failedStopCount: { increment: 1 },
          version: { increment: 1 },
        },
      });

      return { success: true, stopId };
    });
  }
}
