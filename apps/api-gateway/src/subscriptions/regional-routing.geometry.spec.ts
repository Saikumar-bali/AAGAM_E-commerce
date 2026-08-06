import {
  RouteCandidate,
  haversineKm,
  nearestNeighbourOrder,
  pointInPolygon,
  routeCapacityWarnings,
  splitByOperationalConstraints,
} from './regional-routing.geometry';

type TestStop = { region: string };

const origin = { latitude: 17.748, longitude: 83.322 };
const constraints = {
  maximumStops: 15,
  maximumParcels: 30,
  maximumCashPaise: 1_000_000,
  maximumDistanceKm: 100,
  maximumDurationMinutes: 600,
  averageSpeedKph: 25,
  serviceMinutesPerStop: 3,
};

function stops(region: string, count: number, baseLatitude: number, baseLongitude: number, cashDuePaise = 0): RouteCandidate<TestStop>[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${region}-${String(index + 1).padStart(2, '0')}`,
    latitude: baseLatitude + (index % 5) * 0.002,
    longitude: baseLongitude + Math.floor(index / 5) * 0.002,
    parcelCount: 1,
    cashDuePaise,
    value: { region },
  }));
}

describe('regional route geometry', () => {
  it('uses authoritative polygon containment rather than locality text', () => {
    const polygon = [
      { latitude: 17.72, longitude: 83.29 },
      { latitude: 17.72, longitude: 83.36 },
      { latitude: 17.79, longitude: 83.36 },
      { latitude: 17.79, longitude: 83.29 },
    ];
    expect(pointInPolygon({ latitude: 17.75, longitude: 83.32 }, polygon)).toBe(true);
    expect(pointInPolygon({ latitude: 17.90, longitude: 83.32 }, polygon)).toBe(false);
  });

  it('keeps exact regional groups as two independent 10-stop runs', () => {
    const regionA = splitByOperationalConstraints(origin, stops('PM_PALEM', 10, 17.75, 83.32), constraints);
    const regionB = splitByOperationalConstraints(origin, stops('MADHURAWADA', 10, 17.81, 83.35), constraints);
    expect(regionA).toHaveLength(1);
    expect(regionB).toHaveLength(1);
    expect(regionA[0]).toHaveLength(10);
    expect(regionB[0]).toHaveLength(10);
    expect(regionA[0].every((stop) => stop.value.region === 'PM_PALEM')).toBe(true);
    expect(regionB[0].every((stop) => stop.value.region === 'MADHURAWADA')).toBe(true);
    expect(new Set([...regionA[0], ...regionB[0]].map((stop) => stop.id)).size).toBe(20);
  });

  it('preserves an efficient non-equal 14/6 regional split', () => {
    const regionA = splitByOperationalConstraints(origin, stops('A', 14, 17.74, 83.31), constraints);
    const regionB = splitByOperationalConstraints(origin, stops('B', 6, 17.82, 83.36), constraints);
    expect(regionA.map((cluster) => cluster.length)).toEqual([14]);
    expect(regionB.map((cluster) => cluster.length)).toEqual([6]);
  });

  it('splits an oversized 24-stop zone without exceeding 15 stops', () => {
    const result = splitByOperationalConstraints(origin, stops('A', 24, 17.74, 83.31), constraints);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.flat()).toHaveLength(24);
    expect(result.every((cluster) => cluster.length <= 15)).toBe(true);
    expect(new Set(result.flat().map((stop) => stop.id)).size).toBe(24);
  });

  it('splits before a route exceeds configured cash responsibility', () => {
    const cashConstrained = { ...constraints, maximumCashPaise: 300_000 };
    const result = splitByOperationalConstraints(origin, stops('CASH', 8, 17.74, 83.31, 100_000), cashConstrained);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.every((cluster) => cluster.reduce((sum, stop) => sum + stop.cashDuePaise, 0) <= 300_000)).toBe(true);
  });

  it('produces the same route ownership and order on repeated planning', () => {
    const input = stops('REPEAT', 18, 17.74, 83.31);
    const first = splitByOperationalConstraints(origin, input, constraints).map((cluster) => cluster.map((stop) => stop.id));
    const second = splitByOperationalConstraints(origin, [...input].reverse(), constraints).map((cluster) => cluster.map((stop) => stop.id));
    expect(second).toEqual(first);
  });

  it('nearest-neighbour ordering is deterministic when distances tie', () => {
    const tied = [
      { id: 'B', latitude: 17.75, longitude: 83.32, parcelCount: 1, cashDuePaise: 0, value: { region: 'X' } },
      { id: 'A', latitude: 17.75, longitude: 83.32, parcelCount: 1, cashDuePaise: 0, value: { region: 'X' } },
    ];
    expect(nearestNeighbourOrder(origin, tied).map((stop) => stop.id)).toEqual(['A', 'B']);
  });

  it('reports stop, parcel, cash, distance and duration warnings independently', () => {
    const result = routeCapacityWarnings(origin, stops('WARN', 4, 17.74, 83.31, 200_000), {
      ...constraints,
      maximumStops: 3,
      maximumParcels: 3,
      maximumCashPaise: 500_000,
      maximumDistanceKm: 0.01,
      maximumDurationMinutes: 1,
    });
    expect(result.warnings).toEqual(expect.arrayContaining([
      'CAPACITY_RISK',
      'PARCEL_CAPACITY_RISK',
      'CASH_LIMIT_RISK',
      'DISTANCE_RISK',
      'SLOT_RISK',
    ]));
  });

  it('calculates a realistic positive distance between PM Palem and Madhurawada', () => {
    const distance = haversineKm(
      { latitude: 17.748, longitude: 83.322 },
      { latitude: 17.807, longitude: 83.354 },
    );
    expect(distance).toBeGreaterThan(5);
    expect(distance).toBeLessThan(15);
  });
});
