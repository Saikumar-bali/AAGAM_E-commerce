import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionDeliveryStatus } from '@aagam/database';
import { reconcileRiderOperationalStatus } from '../riders/rider-operational-status';

type Tx = Prisma.TransactionClient;

/** Distinguishes occurrences suspended by a pause from a customer-initiated skip. */
export const PAUSE_SKIP_REASON = 'PAUSED_WINDOW';

/**
 * Shared rider-artifact teardown for a subscription delivery.
 *
 * A customer skip or pause must not leave the delivery live on the rider
 * network. The order and its delivery job are generated well before the skip
 * cutoff, so by the time a customer skips (or a pause window is applied) the
 * row can already carry an order, a delivery job and a run stop. Cancelling
 * only `SubscriptionDelivery.status` produced the split the store grid and the
 * rider board disagreed about: NOT TAKEN in the grid, still a stop on the run.
 *
 * Every lifecycle transition (customer skip, customer pause, store quick
 * action) calls this so the delivery, its order/job and the run stop move
 * together and the run's counters stay exact.
 */
@Injectable()
export class SubscriptionLifecycleService {
  /**
   * Cancels the rider-facing artifacts of one delivery inside an open
   * transaction. Safe to call for a delivery that never generated an order.
   *
   * `cancelOrder` is false for a pause: the occurrence is only suspended, so
   * its order (the cash/ledger artifact) must survive and move with the plan on
   * resume rather than be cancelled and regenerated.
   */
  async cancelRiderArtifactsWithinTransaction(
    tx: Tx,
    subscriptionDeliveryId: string,
    reason: string,
    options: { cancelOrder?: boolean } = {},
  ): Promise<{ cancelledStop: boolean; cancelledJob: boolean; cancelledOrder: boolean }> {
    const cancelOrder = options.cancelOrder !== false;
    const stop = await tx.deliveryRunStop.findUnique({
      where: { subscriptionDeliveryId },
      select: { id: true, deliveryRunId: true, deliveryJobId: true },
    });

    let cancelledStop = false;
    let cancelledJob = false;
    let cancelledOrder = false;

    if (stop) {
      // A delivered or already-returned stop is history; only pull back a stop
      // that has not been completed on the road.
      const cancelled = await tx.deliveryRunStop.updateMany({
        where: { id: stop.id, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } },
        data: {
          status: 'CANCELLED',
          failedAt: new Date(),
          failureReason: reason,
          version: { increment: 1 },
        },
      });
      cancelledStop = cancelled.count > 0;
      if (cancelledStop) {
        await this.recomputeRunCounters(tx, stop.deliveryRunId);
      }

      await tx.deliveryJob.updateMany({
        where: { id: stop.deliveryJobId, status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED_TO_STORE'] } },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      cancelledJob = true;

      // The skip/pause that pulled the last live stop off this run empties it.
      // An empty non-terminal run still counts as rider work, so it would pin
      // the rider BUSY forever; cancel it and reconcile the rider here, where
      // the run is known, rather than relying on the rider's later heartbeat.
      if (stop.deliveryRunId) {
        const run = await tx.deliveryRun.findUnique({
          where: { id: stop.deliveryRunId },
          select: { riderId: true, status: true, totalStopCount: true, _count: { select: { stops: true } } },
        });
        const liveStops = await tx.deliveryRunStop.count({
          where: { deliveryRunId: stop.deliveryRunId, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } },
        });
        if (run && liveStops === 0 && run.status !== 'COMPLETED' && run.status !== 'CANCELLED') {
          await tx.deliveryRun.update({
            where: { id: stop.deliveryRunId },
            data: { status: 'CANCELLED', completedAt: new Date(), version: { increment: 1 } },
          });
          if (run.riderId) {
            await reconcileRiderOperationalStatus(tx, run.riderId);
          }
        }
      }
    }

    const delivery = await tx.subscriptionDelivery.findUnique({
      where: { id: subscriptionDeliveryId },
      select: { deliveryJobId: true, order: { select: { id: true } } },
    });

    if (cancelOrder && delivery?.order) {
      await tx.order.updateMany({
        where: { id: delivery.order.id, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      cancelledOrder = true;
    }

    if (!stop && delivery?.deliveryJobId) {
      await tx.deliveryJob.updateMany({
        where: { id: delivery.deliveryJobId, status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED_TO_STORE'] } },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      });
      cancelledJob = true;
    }

    return { cancelledStop, cancelledJob, cancelledOrder };
  }

  /**
   * Cancels the rider-facing artifacts for every non-terminal occurrence of a
   * subscription. A customer cancel must remove the future deliveries from the
   * rider network, not only flip the delivery rows to CANCELLED: a generated
   * order or run stop would otherwise stay live after the plan is cancelled,
   * the same grid-vs-rider split that skip and pause already guard against.
   */
  async cancelSubscriptionArtifactsWithinTransaction(
    tx: Tx,
    subscriptionId: string,
    reason: string,
  ): Promise<number> {
    const deliveries = await tx.subscriptionDelivery.findMany({
      where: {
        subscriptionId,
        status: { notIn: ['DELIVERED', 'CANCELLED', 'SKIPPED'] },
      },
      select: { id: true },
    });

    for (const delivery of deliveries) {
      await this.cancelRiderArtifactsWithinTransaction(tx, delivery.id, reason);
    }
    return deliveries.length;
  }

  /** Re-derives a run's stop counters after a stop is added, moved or cancelled. */
  async recomputeRunCounters(tx: Tx, deliveryRunId: string) {
    const [agg, completedStopCount] = await Promise.all([
      tx.deliveryRunStop.aggregate({
        where: { deliveryRunId },
        _count: { _all: true },
        _sum: { cashDuePaise: true, expectedItemCount: true, expectedParcelCount: true },
      }),
      tx.deliveryRunStop.count({ where: { deliveryRunId, status: 'DELIVERED' } }),
    ]);

    await tx.deliveryRun.update({
      where: { id: deliveryRunId },
      data: {
        totalStopCount: agg._count._all,
        completedStopCount,
        expectedCashPaise: agg._sum.cashDuePaise ?? 0,
        expectedItemCount: agg._sum.expectedItemCount ?? 0,
        expectedParcelCount: agg._sum.expectedParcelCount ?? 0,
        expectedBagCount: agg._sum.expectedParcelCount ?? 0,
        version: { increment: 1 },
      },
    });
  }

  /**
   * Suspends the rider-facing artifacts for the deliveries a customer pause
   * covers and marks those occurrences so the store grid shows them as not
   * taken for the paused window. The order is kept (pause is temporary); only
   * the run stop and delivery job are pulled back.
   */
  async cancelPausedRiderArtifactsWithinTransaction(
    tx: Tx,
    subscriptionId: string,
    effectiveFrom: Date,
    reason: string,
  ): Promise<number> {
    const deliveries = await tx.subscriptionDelivery.findMany({
      where: {
        subscriptionId,
        serviceDate: { gte: effectiveFrom },
        status: { notIn: ['DELIVERED', 'CANCELLED', 'SKIPPED'] },
      },
      select: { id: true },
    });

    for (const delivery of deliveries) {
      await this.cancelRiderArtifactsWithinTransaction(tx, delivery.id, reason, { cancelOrder: false });
      await tx.subscriptionDelivery.update({
        where: { id: delivery.id },
        data: { status: SubscriptionDeliveryStatus.SKIPPED, skippedAt: new Date(), skipReason: PAUSE_SKIP_REASON },
      });
    }
    return deliveries.length;
  }

  /**
   * Reverts the occurrences a pause marked, ahead of the resume shift. A row
   * that already had an order returns to ORDER_GENERATED (so the generator does
   * not create a second order); a plain occurrence returns to SCHEDULED.
   */
  async restorePausedDeliveriesWithinTransaction(tx: Tx, subscriptionId: string, effectiveFrom: Date): Promise<number> {
    const paused = await tx.subscriptionDelivery.findMany({
      where: {
        subscriptionId,
        serviceDate: { gte: effectiveFrom },
        status: SubscriptionDeliveryStatus.SKIPPED,
        skipReason: PAUSE_SKIP_REASON,
      },
      select: { id: true, order: { select: { id: true } } },
    });

    for (const delivery of paused) {
      await tx.subscriptionDelivery.update({
        where: { id: delivery.id },
        data: {
          status: delivery.order ? SubscriptionDeliveryStatus.ORDER_GENERATED : SubscriptionDeliveryStatus.SCHEDULED,
          skippedAt: null,
          skipReason: null,
        },
      });
    }
    return paused.length;
  }

  /**
   * Re-dates the non-terminal deliveries of a resumed subscription by
   * `shiftDays` and moves their orders with them. Stops that were cancelled on
   * pause are left cancelled: their delivery row becomes a plain SCHEDULED
   * occurrence the normal order-generation cycle picks up again.
   */
  async shiftResumedDeliveriesWithinTransaction(
    tx: Tx,
    subscriptionId: string,
    effectiveFrom: Date,
    shiftDays: number,
  ): Promise<number> {
    if (shiftDays <= 0) return 0;

    const deliveries = await tx.subscriptionDelivery.findMany({
      where: {
        subscriptionId,
        serviceDate: { gte: effectiveFrom },
        status: {
          in: [
            SubscriptionDeliveryStatus.SCHEDULED,
            SubscriptionDeliveryStatus.ORDER_GENERATED,
            SubscriptionDeliveryStatus.PREPARING,
            SubscriptionDeliveryStatus.PACKED,
            SubscriptionDeliveryStatus.ASSIGNED,
          ],
        },
      },
      select: { id: true, serviceDate: true },
      orderBy: { serviceDate: 'asc' },
    });

    for (const delivery of deliveries) {
      const shifted = new Date(delivery.serviceDate.getTime() + shiftDays * 86_400_000);
      await tx.subscriptionDelivery.update({
        where: { id: delivery.id },
        data: {
          serviceDate: shifted,
          rescheduledFromDate: delivery.serviceDate,
          rescheduledToDate: shifted,
        },
      });
      await tx.order.updateMany({
        where: { subscriptionDeliveryId: delivery.id },
        data: { scheduledDeliveryDate: shifted },
      });
    }
    return deliveries.length;
  }
}
