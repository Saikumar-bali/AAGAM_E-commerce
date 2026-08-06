export type GeoPoint = {
  latitude: number;
  longitude: number;
};

export type RouteCandidate<T> = GeoPoint & {
  id: string;
  parcelCount: number;
  cashDuePaise: number;
  value: T;
};

export type RouteConstraints = {
  maximumStops: number;
  maximumParcels: number;
  maximumCashPaise: number;
  maximumDistanceKm: number;
  maximumDurationMinutes: number;
  averageSpeedKph?: number;
  serviceMinutesPerStop?: number;
};

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
};

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(left: GeoPoint, right: GeoPoint) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLon = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function normalizePolygon(value: unknown): GeoPoint[] {
  const source = (() => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (candidate.type === 'Polygon' && Array.isArray(candidate.coordinates)) {
        const firstRing = candidate.coordinates[0];
        return Array.isArray(firstRing) ? firstRing : [];
      }
      if (Array.isArray(candidate.points)) return candidate.points;
    }
    return [];
  })();

  return source.flatMap((raw) => {
    if (Array.isArray(raw) && raw.length >= 2) {
      const longitude = Number(raw[0]);
      const latitude = Number(raw[1]);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{ latitude, longitude }]
        : [];
    }
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const latitude = Number(item.latitude ?? item.lat);
    const longitude = Number(item.longitude ?? item.lng ?? item.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? [{ latitude, longitude }]
      : [];
  });
}

export function pointInPolygon(point: GeoPoint, polygonValue: unknown) {
  const polygon = normalizePolygon(polygonValue);
  if (polygon.length < 3) return false;
  let inside = false;
  const x = point.longitude;
  const y = point.latitude;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].longitude;
    const yi = polygon[i].latitude;
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;
    const intersects = ((yi > y) !== (yj > y))
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function nearestNeighbourOrder<T>(origin: GeoPoint, candidates: RouteCandidate<T>[]) {
  const pending = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const ordered: RouteCandidate<T>[] = [];
  let current = origin;
  while (pending.length) {
    pending.sort((a, b) => {
      const distance = haversineKm(current, a) - haversineKm(current, b);
      return Math.abs(distance) > 1e-9 ? distance : a.id.localeCompare(b.id);
    });
    const next = pending.shift()!;
    ordered.push(next);
    current = next;
  }
  return ordered;
}

export function estimateRoute<T>(origin: GeoPoint, ordered: RouteCandidate<T>[], constraints?: Pick<RouteConstraints, 'averageSpeedKph' | 'serviceMinutesPerStop'>): RouteEstimate {
  let distanceKm = 0;
  let current = origin;
  for (const stop of ordered) {
    distanceKm += haversineKm(current, stop);
    current = stop;
  }
  const averageSpeedKph = Math.max(5, constraints?.averageSpeedKph ?? 22);
  const serviceMinutesPerStop = Math.max(1, constraints?.serviceMinutesPerStop ?? 5);
  const durationMinutes = Math.ceil((distanceKm / averageSpeedKph) * 60 + ordered.length * serviceMinutesPerStop);
  return {
    distanceKm: Math.round(distanceKm * 100) / 100,
    durationMinutes,
  };
}

export function splitByOperationalConstraints<T>(
  origin: GeoPoint,
  candidates: RouteCandidate<T>[],
  constraints: RouteConstraints,
) {
  const remaining = [...candidates].sort((a, b) => {
    if (a.latitude !== b.latitude) return a.latitude - b.latitude;
    if (a.longitude !== b.longitude) return a.longitude - b.longitude;
    return a.id.localeCompare(b.id);
  });
  const clusters: RouteCandidate<T>[][] = [];

  while (remaining.length) {
    const seed = remaining.shift()!;
    const cluster = [seed];
    let changed = true;
    while (changed && remaining.length) {
      changed = false;
      const orderedCurrent = nearestNeighbourOrder(origin, cluster);
      const anchor = orderedCurrent[orderedCurrent.length - 1] ?? seed;
      const candidateOrder = [...remaining].sort((a, b) => {
        const distance = haversineKm(anchor, a) - haversineKm(anchor, b);
        return Math.abs(distance) > 1e-9 ? distance : a.id.localeCompare(b.id);
      });
      for (const candidate of candidateOrder) {
        const proposed = [...cluster, candidate];
        const ordered = nearestNeighbourOrder(origin, proposed);
        const estimate = estimateRoute(origin, ordered, constraints);
        const parcels = proposed.reduce((sum, item) => sum + item.parcelCount, 0);
        const cash = proposed.reduce((sum, item) => sum + item.cashDuePaise, 0);
        const feasible = proposed.length <= constraints.maximumStops
          && parcels <= constraints.maximumParcels
          && cash <= constraints.maximumCashPaise
          && estimate.distanceKm <= constraints.maximumDistanceKm
          && estimate.durationMinutes <= constraints.maximumDurationMinutes;
        if (!feasible) continue;
        cluster.push(candidate);
        remaining.splice(remaining.findIndex((item) => item.id === candidate.id), 1);
        changed = true;
        break;
      }
    }
    clusters.push(nearestNeighbourOrder(origin, cluster));
  }

  return clusters;
}

export function routeCapacityWarnings<T>(
  origin: GeoPoint,
  stops: RouteCandidate<T>[],
  constraints: RouteConstraints,
) {
  const estimate = estimateRoute(origin, nearestNeighbourOrder(origin, stops), constraints);
  const parcels = stops.reduce((sum, item) => sum + item.parcelCount, 0);
  const cash = stops.reduce((sum, item) => sum + item.cashDuePaise, 0);
  const warnings: string[] = [];
  if (stops.length > constraints.maximumStops) warnings.push('CAPACITY_RISK');
  if (parcels > constraints.maximumParcels) warnings.push('PARCEL_CAPACITY_RISK');
  if (cash > constraints.maximumCashPaise) warnings.push('CASH_LIMIT_RISK');
  if (estimate.distanceKm > constraints.maximumDistanceKm) warnings.push('DISTANCE_RISK');
  if (estimate.durationMinutes > constraints.maximumDurationMinutes) warnings.push('SLOT_RISK');
  return { ...estimate, parcels, cash, warnings };
}
