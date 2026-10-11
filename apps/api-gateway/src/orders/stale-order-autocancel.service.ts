import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CouponRedemptionStatus,
  InventoryAdjustmentReason,
  OrderStatus,
  PaymentStatus,
  Prisma,
  Role,
  prisma,
} from '@aagam/database';
import { TERMINAL_ORDER_STATUS_VALUES } from '@aagam/types';
import { reconcileRiderOperationalStatus } from '../riders/rider-operational-status';
import { captureBackgroundError } from '../common/sentry-config';

const TERMINAL_ORDER_STATUSES = TERMINAL_ORDER_STATUS_VALUES as unknown as OrderStatus[];

const TERMINAL_DELIVERY_JOB_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED_TO_STORE'];

type Tx = Prisma.TransactionClient;

type StaleOrder = {
  id: string;
  storeId: string;
  status: OrderStatus;
  riderId: string | null;
  items: Array<{ productId: string; quantity: number }>;
};

/**
 * Sweeps orders that have sat open far past when they should have been
 * fulfilled and cancels them, so a day that was never delivered does not stay
 * "pending" forever and inflate every admin/store order view.
 *
 * One sweep does two things, in this order:
 *  1. an online checkout still in PAYMENT_PENDING past the cutoff has its
 *     Payment marked FAILED (that order never reserved inventory);
 *  2. every order still open past the cutoff is cancelled.
 * The order matters: only orders that got past payment hold stock, so only they
 * have inventory restored.
 *
 * Conservative by design:
 *  - subscription deliveries are skipped; their lifecycle (skip/pause/expiry)
 *    owns cancellation, and their orders shadow a delivery day cell;
 *  - riders are released and their stops pulled down, so a stale order cannot
 *    pin a rider BUSY or leave a live stop on the board;
 *  - inventory is restored once per order, idempotently.
 */
@Injectable()
export class StaleOrderAutocancelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaleOrderAutocancelService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const intervalMs = Math.max(60_000, Number(process.env.ORDER_AUTOCANCEL_INTERVAL_MS || 3_600_000));
    this.timer = setInterval(() => void this.sweep(), intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Age past which an open order is considered abandoned. Default 48h. */
  private staleAfterHours() {
    return Math.max(6, Math.min(24 * 14, Number(process.env.ORDER_STALE_AFTER_HOURS || 48)));
  }

  /** Upper bound on batches per sweep, so a large backlog drains gradually. */
  private maxBatches() {
    return Math.max(1, Math.min(100, Number(process.env.ORDER_AUTOCANCEL_MAX_BATCHES || 20)));
  }

  private batchSize() {
    return Math.max(10, Math.min(500, Number(process.env.ORDER_AUTOCANCEL_BATCH_SIZE || 100)));
  }

  async sweep() {
    if (this.running) return 0;
    this.running = true;
    try {
      await this.failStalePendingPayments();
      const total = await this.cancelStaleOpenOrders();
      if (total > 0) this.logger.log(`Auto-cancelled ${total} stale order(s)`);
      return total;
    } catch (error) {
      captureBackgroundError(this.logger, 'Stale order sweep failed', error);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Marks the Payment of an abandoned online checkout FAILED, so the row stops
   * showing as "awaiting capture". The order itself is then cancelled by
   * `cancelStaleOpenOrders` in the same sweep.
   */
  private async failStalePendingPayments(now: Date = new Date()) {
    const cutoff = new Date(now.getTime() - this.staleAfterHours() * 3_600_000);
    const stale = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.CREATED,
        createdAt: { lt: cutoff },
        order: { status: OrderStatus.PAYMENT_PENDING, subscriptionDeliveryId: null },
      },
      select: { id: true },
      take: this.batchSize() * this.maxBatches(),
    });
    if (stale.length === 0) return 0;
    const result = await prisma.payment.updateMany({
      where: { id: { in: stale.map((p) => p.id) }, status: PaymentStatus.CREATED },
      data: { status: PaymentStatus.FAILED, failureReason: 'AUTO_EXPIRED_STALE_CHECKOUT' },
    });
    return result.count;
  }

  /**
   * Cancels open orders older than the stale cutoff. Batched, and each order is
   * claimed with a status-guarded `updateMany` so a concurrent completion is
   * never clobbered.
   */
  async cancelStaleOpenOrders(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.staleAfterHours() * 3_600_000);
    let cancelled = 0;

    for (let batch = 0; batch < this.maxBatches(); batch += 1) {
      const stale: StaleOrder[] = await prisma.order.findMany({
        where: {
          createdAt: { lt: cutoff },
          status: { notIn: TERMINAL_ORDER_STATUSES },
          // A subscription order is the shadow of a delivery day cell; the
          // subscription lifecycle owns its cancellation.
          subscriptionDeliveryId: null,
        },
        select: {
          id: true,
          storeId: true,
          status: true,
          riderId: true,
          items: { select: { productId: true, quantity: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: this.batchSize(),
      });

      if (stale.length === 0) break;

      for (const order of stale) {
        if (await this.cancelOneStaleOrder(order, now, cutoff)) cancelled += 1;
      }

      if (stale.length < this.batchSize()) break;
    }

    return cancelled;
  }

  private async cancelOneStaleOrder(order: StaleOrder, now: Date, cutoff: Date) {
    // Only money collected before payment completes pounds stock; a
    // PAYMENT_FAILED / PAYMENT_PENDING checkout reserved none, so restoring it
    // would create phantom inventory (the live force-cancel path guards this
    // the same way).
    const restoresInventory =
      order.status !== OrderStatus.PAYMENT_FAILED &&
      order.status !== OrderStatus.PAYMENT_PENDING;

    const note =
      order.status === OrderStatus.PAYMENT_FAILED
        ? 'Auto-cancelled: payment never completed and the order was left open'
        : `Auto-cancelled: order was still ${order.status} after ${this.staleAfterHours()}h`;

    try {
      await prisma.$transaction(async (tx: Tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: order.id, status: order.status },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: now,
            ...(order.riderId ? { riderId: null, riderAssignedAt: null } : {}),
          },
        });
        if (claimed.count === 0) return;

        if (restoresInventory) await this.restoreInventory(tx, order);

        await this.cancelDeliveryArtifacts(tx, order.id, order.riderId);

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: OrderStatus.CANCELLED,
            actorRole: Role.ADMIN,
            note,
            metadata: { autoCancelled: true, cutoff: cutoff.toISOString() },
          },
        });

        await tx.couponRedemption.updateMany({
          where: {
            orderId: order.id,
            status: { in: [CouponRedemptionStatus.RESERVED, CouponRedemptionStatus.REDEEMED] },
          },
          data: {
            status: CouponRedemptionStatus.RELEASED,
            releasedAt: now,
            releaseReason: 'AUTO_CANCELLED',
          },
        });
      });
      return true;
    } catch (error) {
      captureBackgroundError(this.logger, `Auto-cancel order ${order.id} failed`, error);
      return false;
    }
  }

  private async restoreInventory(tx: Tx, order: StaleOrder) {
    // Idempotency: a cancel that already restored this order must not restore
    // twice (delivery failures and manual cancels share the same ledger reason).
    const alreadyRestored = await tx.inventoryLedger.findFirst({
      where: { orderId: order.id, reason: InventoryAdjustmentReason.ORDER_CANCEL_RESTORE },
      select: { id: true },
    });
    if (alreadyRestored) return;

    for (const item of order.items) {
      const existing = await tx.inventory.findUnique({
        where: { storeId_productId: { storeId: order.storeId, productId: item.productId } },
      });
      const previousQuantity = existing?.quantity ?? 0;

      await tx.inventory.updateMany({
        where: { storeId: order.storeId, productId: item.productId },
        data: { quantity: { increment: item.quantity } },
      });

      await tx.inventoryLedger.create({
        data: {
          storeId: order.storeId,
          productId: item.productId,
          orderId: order.id,
          reason: InventoryAdjustmentReason.ORDER_CANCEL_RESTORE,
          quantityDelta: item.quantity,
          previousQuantity,
          newQuantity: previousQuantity + item.quantity,
          note: `Auto-cancel ${order.id}: restored ${item.quantity} units`,
        },
      });
    }
  }

  private async cancelDeliveryArtifacts(tx: Tx, orderId: string, riderId: string | null) {
    const job = await tx.deliveryJob.findUnique({
      where: { orderId },
      select: { id: true, status: true },
    });

    if (job && !TERMINAL_DELIVERY_JOB_STATUSES.includes(job.status)) {
      await tx.deliveryJob.update({
        where: { id: job.id },
        data: { status: 'CANCELLED', currentRiderId: null, version: { increment: 1 } },
      });
      await tx.dispatchAssignment.updateMany({
        where: { deliveryJobId: job.id, status: { in: ['CREATED', 'OFFERED', 'ACCEPTED'] } },
        data: { status: 'CANCELLED', respondedAt: new Date() },
      });
    }

    const stops = await tx.deliveryRunStop.findMany({
      where: { deliveryJob: { orderId } },
      select: { id: true, deliveryRunId: true },
    });
    if (stops.length > 0) {
      await tx.deliveryRunStop.updateMany({
        where: {
          id: { in: stops.map((s) => s.id) },
          status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] },
        },
        data: { status: 'CANCELLED', failedAt: new Date(), failureReason: 'AUTO_CANCELLED_STALE_ORDER' },
      });
      for (const runId of [...new Set(stops.map((s) => s.deliveryRunId).filter(Boolean))]) {
        const live = await tx.deliveryRunStop.count({
          where: { deliveryRunId: runId, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } },
        });
        const run = await tx.deliveryRun.findUnique({
          where: { id: runId },
          select: { status: true },
        });
        if (run && live === 0 && run.status !== 'COMPLETED' && run.status !== 'CANCELLED') {
          await tx.deliveryRun.update({
            where: { id: runId },
            data: { status: 'CANCELLED', completedAt: new Date(), version: { increment: 1 } },
          });
        }
      }
    }

    // Release the rider so a stale order does not pin them BUSY with no work.
    if (riderId) await reconcileRiderOperationalStatus(tx, riderId);
  }
}
