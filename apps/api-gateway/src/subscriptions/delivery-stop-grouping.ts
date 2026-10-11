/**
 * A delivery "stop" row is per subscription-day (`DeliveryRunStop` is unique on
 * `subscriptionDeliveryId`), but the store and rider think in *delivery points*:
 * one door the rider walks up to, however many subscriptions that household
 * holds. A customer with several subscriptions at the same address therefore
 * produces several stop rows for one physical stop, which inflates every
 * "stops" figure (run row, rider board, route totals, ETA).
 *
 * These helpers give the read surfaces an address-level count while the
 * per-subscription rows — with their own proof/cash/status — stay untouched.
 */

export type StopAddressLike = {
  id?: string | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  deliveryJobId?: string | null;
  addressSnapshot?: unknown;
};

export type StopAddressGroup<S extends StopAddressLike = StopAddressLike> = {
  /** Stable identity of the physical delivery point, for the given service day. */
  key: string;
  stops: S[];
};

const ADDRESS_PRECISION = 5; // ~1.1 m at the equator — collapses float jitter, not neighbours.

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Best-effort coordinates for a stop: the stop's pinned point first (what the
 * rider map/nav uses), then the subscription's snapshot, then the order's.
 */
function stopPoint(stop: StopAddressLike): { latitude: number; longitude: number } | null {
  const snapshot = (stop.addressSnapshot ?? {}) as Record<string, unknown>;
  const latitude = finiteNumber(stop.deliveryLatitude) ?? finiteNumber(snapshot.latitude);
  const longitude = finiteNumber(stop.deliveryLongitude) ?? finiteNumber(snapshot.longitude);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

/**
 * Identity of the physical delivery point for one stop.
 *
 * Coordinates are the only reliable signal: two subscriptions for the same
 * house can carry different address *text* (a QA tag, a corrected line1) but
 * always share the same pinned lat/lng, so a text key would still split them.
 *
 * A retry of the same `deliveryJobId` is always one point even if it sits on a
 * different run — keying on the job id collapses that instead of the address.
 * Callers group within a single service date, so the date is not part of the
 * key; add it when mixing days.
 */
export function stopAddressKey(stop: StopAddressLike): string {
  const snapshot = (stop.addressSnapshot ?? {}) as Record<string, unknown>;
  const point = stopPoint(stop);
  if (point) {
    return `point:${point.latitude.toFixed(ADDRESS_PRECISION)}:${point.longitude.toFixed(ADDRESS_PRECISION)}`;
  }
  const pincode = text(snapshot.pincode);
  const line = text(snapshot.line1 ?? snapshot.formattedAddress);
  if (pincode || line) return `addr:${pincode}|${line}`;
  if (stop.deliveryJobId) return `job:${stop.deliveryJobId}`;
  return `unknown:${stop.id ?? Math.random().toString(36).slice(2)}`;
}

/** Collapse a run's stops into distinct physical delivery points. */
export function groupStopsByAddress<S extends StopAddressLike>(stops: S[]): StopAddressGroup<S>[] {
  const groups: StopAddressGroup<S>[] = [];
  const byKey = new Map<string, StopAddressGroup<S>>();
  for (const stop of stops) {
    const key = stopAddressKey(stop);
    let group = byKey.get(key);
    if (!group) {
      group = { key, stops: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.stops.push(stop);
  }
  return groups;
}

/**
 * Number of distinct physical delivery points among a set of stops. Equals
 * `stops.length` when every stop is a different address.
 */
export function countAddressStops<S extends StopAddressLike>(stops: S[]): number {
  const keys = new Set<string>();
  for (const stop of stops) keys.add(stopAddressKey(stop));
  return keys.size;
}
