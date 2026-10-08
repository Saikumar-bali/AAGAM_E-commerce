export type RunActionInput = {
  status: string;
  totalStopCount?: number | null;
  expectedBagCount?: number | null;
  packedBagCount?: number | null;
  /** Number of stops currently loaded on the run (fallback for the target). */
  stopCount?: number | null;
};

export type RunActions = {
  bagTarget: number;
  canPack: boolean;
  canHandoff: boolean;
};

/**
 * Whether a store-facing delivery run can be packed and/or handed to its rider.
 *
 * `status === 'PLANNED'` is not a safe gate for the Pack action: the same-day
 * "Dispatch to Rider" quick action creates the run already in
 * `READY_FOR_PICKUP` with the handoff stamped, so gating on PLANNED hides the
 * Pack button forever and the run's `packedBagCount` stays 0 while the route is
 * live. The store still owes an independent bag-count confirmation, so gate on
 * whether the bags have actually been packed yet.
 */
export function resolveRunActions(run: RunActionInput): RunActions {
  const bagTarget = run.expectedBagCount || run.totalStopCount || run.stopCount || 0;
  const canPack =
    ["PLANNED", "READY_FOR_PICKUP"].includes(run.status) &&
    bagTarget > 0 &&
    (run.packedBagCount ?? 0) < bagTarget;
  const canHandoff = !canPack && run.status === "READY_FOR_PICKUP";
  return { bagTarget, canPack, canHandoff };
}

/**
 * Re-point an open stop panel at the refreshed run payload while preserving the
 * user's open selection. Returns the fresh stop merged over `current` when it
 * still exists, otherwise `current` unchanged (or `null` when nothing is open).
 *
 * The rider Runs screen holds `selectedStop` as a snapshot. After `arrive()`
 * refreshes the run, that snapshot is stale and the completion form gated on
 * the fresh status never renders, so the rider cannot finish the stop.
 */
export function mergeRunIntoOpenStop<T extends { id: string }>(
  current: T | null,
  stops: T[] | null | undefined,
): T | null {
  if (!current) return current;
  const fresh = stops?.find((stop) => stop.id === current.id);
  return fresh ? { ...current, ...fresh } : current;
}
