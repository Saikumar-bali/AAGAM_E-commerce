import type { Prisma } from '@aagam/database';

type Tx = Prisma.TransactionClient;

/**
 * Re-derives a `DeliveryRun`'s stop counters from the rows it actually has.
 *
 * `totalStopCount`/`completedStopCount` (and the expected totals) are written as
 * a snapshot at planning/dispatch, so any path that adds or removes a
 * `DeliveryRunStop` must call this or the run drifts from its rows (BUG-030):
 * the rider board, run prep and admin workload all read the counters.
 *
 * Kept in its own module — with no rider-lifecycle import — so a caller that
 * only needs the recompute (e.g. the offline-customer purge) does not pull the
 * whole `SubscriptionLifecycleService` dependency graph into its bundle. The
 * method of the same name on `SubscriptionLifecycleService` delegates here.
 */
export async function recomputeRunCounters(tx: Tx, deliveryRunId: string) {
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
