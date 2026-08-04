import type { DeliveryJobStatus, RiderDeliveryJob } from './riderWorkspace';

export type RiderNavigationPhase =
  | 'TO_STORE'
  | 'AT_STORE'
  | 'TO_CUSTOMER'
  | 'AT_CUSTOMER'
  | 'RETURN_TO_STORE'
  | 'INACTIVE';

export type NavigationCoordinate = {
  latitude: number;
  longitude: number;
};

export type RiderNavigationSession = {
  key: string;
  jobId: string;
  phase: RiderNavigationPhase;
  destination: NavigationCoordinate | null;
  destinationLabel: string;
  remainingDistanceKm: number | null;
  etaMinutes: number | null;
  lastRouteUpdateAt: string;
  stale: boolean;
};

const EARTH_RADIUS_KM = 6371;
const DEFAULT_URBAN_SPEED_KPH = 24;
const STALE_AFTER_MS = 45_000;

function validCoordinate(point?: NavigationCoordinate | null): point is NavigationCoordinate {
  return Boolean(
    point
    && Number.isFinite(point.latitude)
    && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90
    && Math.abs(point.longitude) <= 180,
  );
}

function toCoordinate(latitude: unknown, longitude: unknown): NavigationCoordinate | null {
  const point = { latitude: Number(latitude), longitude: Number(longitude) };
  return validCoordinate(point) ? point : null;
}

export function navigationPhaseForStatus(status: DeliveryJobStatus): RiderNavigationPhase {
  if (status === 'RIDER_ASSIGNED' || status === 'RIDER_EN_ROUTE_TO_STORE') return 'TO_STORE';
  if (status === 'RIDER_AT_STORE') return 'AT_STORE';
  if (status === 'PICKUP_VERIFIED' || status === 'OUT_FOR_DELIVERY') return 'TO_CUSTOMER';
  if (status === 'RIDER_AT_CUSTOMER') return 'AT_CUSTOMER';
  if (status === 'DELIVERY_FAILED' || status === 'RETURNING_TO_STORE') return 'RETURN_TO_STORE';
  return 'INACTIVE';
}

export function destinationForJob(job: RiderDeliveryJob): {
  phase: RiderNavigationPhase;
  destination: NavigationCoordinate | null;
  label: string;
} {
  const phase = navigationPhaseForStatus(job.status);
  const store = toCoordinate(job.order.store?.latitude, job.order.store?.longitude);
  const customer = toCoordinate(job.order.deliveryLat, job.order.deliveryLng);
  const customerLabel = job.order.customer?.name
    || job.order.addressSnapshot?.recipientName
    || 'Customer delivery';
  const storeLabel = job.order.store?.name || 'Pickup store';

  if (phase === 'TO_STORE' || phase === 'AT_STORE' || phase === 'RETURN_TO_STORE') {
    return { phase, destination: store, label: storeLabel };
  }
  if (phase === 'TO_CUSTOMER' || phase === 'AT_CUSTOMER') {
    return { phase, destination: customer, label: customerLabel };
  }
  return { phase, destination: null, label: 'No active route' };
}

export function distanceKmBetween(
  from?: NavigationCoordinate | null,
  to?: NavigationCoordinate | null,
): number | null {
  if (!validCoordinate(from) || !validCoordinate(to)) return null;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude))
      * Math.cos(radians(to.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateEtaMinutes(distanceKm: number | null, speedKph = DEFAULT_URBAN_SPEED_KPH) {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  const safeSpeed = Number.isFinite(speedKph) && speedKph > 4 ? speedKph : DEFAULT_URBAN_SPEED_KPH;
  return Math.max(1, Math.ceil((distanceKm / safeSpeed) * 60));
}

export function createRiderNavigationSession(input: {
  job: RiderDeliveryJob;
  riderLocation?: NavigationCoordinate | null;
  routeUpdatedAt?: string | null;
  nowMs?: number;
  averageSpeedKph?: number;
}): RiderNavigationSession {
  const route = destinationForJob(input.job);
  const nowMs = input.nowMs ?? Date.now();
  const parsedRouteTime = input.routeUpdatedAt ? new Date(input.routeUpdatedAt).getTime() : nowMs;
  const routeTime = Number.isFinite(parsedRouteTime) ? parsedRouteTime : nowMs;
  const remainingDistanceKm = distanceKmBetween(input.riderLocation, route.destination);
  return {
    key: `${input.job.id}:${route.phase}`,
    jobId: input.job.id,
    phase: route.phase,
    destination: route.destination,
    destinationLabel: route.label,
    remainingDistanceKm,
    etaMinutes: estimateEtaMinutes(remainingDistanceKm, input.averageSpeedKph),
    lastRouteUpdateAt: new Date(routeTime).toISOString(),
    stale: nowMs - routeTime > STALE_AFTER_MS,
  };
}

export function navigationPhaseLabel(phase: RiderNavigationPhase) {
  switch (phase) {
    case 'TO_STORE': return 'Navigate to pickup store';
    case 'AT_STORE': return 'Pickup at store';
    case 'TO_CUSTOMER': return 'Navigate to customer';
    case 'AT_CUSTOMER': return 'Customer handoff';
    case 'RETURN_TO_STORE': return 'Return to owning store';
    default: return 'Route inactive';
  }
}
