import { DeliveryRunStopStatus } from '@aagam/database';

/**
 * Run stops that have reached the end of their life on a route. Run-level bulk
 * actions (packing, store handoff, rider receipt, run start) iterate every stop
 * to move it forward; a route can already carry a delivered/failed/returned/
 * cancelled stop when the rest is actioned, and those must be skipped rather
 * than abort the whole route (BUG-011).
 */
export const TERMINAL_RUN_STOP_STATUSES = new Set<DeliveryRunStopStatus>([
  DeliveryRunStopStatus.DELIVERED,
  DeliveryRunStopStatus.FAILED,
  DeliveryRunStopStatus.RETURNED,
  DeliveryRunStopStatus.CANCELLED,
]);

export function isTerminalRunStopStatus(status: DeliveryRunStopStatus | string): boolean {
  return TERMINAL_RUN_STOP_STATUSES.has(status as DeliveryRunStopStatus);
}
