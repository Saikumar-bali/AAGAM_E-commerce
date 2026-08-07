import { expect, test } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';
import { loginWithCookieSession } from './helpers/login';

const screenshots = path.resolve(__dirname, '../../../docs/qa/regional-routing');
mkdirSync(screenshots, { recursive: true });

const zoneA = {
  id: 'zone-pm-palem', code: 'PMP', name: 'PM Palem', polygon: [
    { latitude: 17.735, longitude: 83.305 },
    { latitude: 17.735, longitude: 83.345 },
    { latitude: 17.775, longitude: 83.345 },
    { latitude: 17.775, longitude: 83.305 },
  ],
  maximumStopsPerRun: 15, maximumRouteDistanceKm: 25, maximumEstimatedDurationMinutes: 120,
  maximumParcelCount: 30, maximumWeightKg: 25, slotEndBufferMinutes: 15, timezone: 'Asia/Kolkata', cashRiskLimitPaise: 1_000_000, deliveryCount: 10,
  availableRiderCount: 1, estimatedDurationMinutes: 72, expectedCashPaise: 239900, status: 'READY',
};
const zoneB = {
  id: 'zone-madhurawada', code: 'MDW', name: 'Madhurawada', polygon: [
    { latitude: 17.785, longitude: 83.335 },
    { latitude: 17.785, longitude: 83.375 },
    { latitude: 17.825, longitude: 83.375 },
    { latitude: 17.825, longitude: 83.335 },
  ],
  maximumStopsPerRun: 15, maximumRouteDistanceKm: 25, maximumEstimatedDurationMinutes: 120,
  maximumParcelCount: 30, maximumWeightKg: 25, slotEndBufferMinutes: 15, timezone: 'Asia/Kolkata', cashRiskLimitPaise: 1_000_000, deliveryCount: 10,
  availableRiderCount: 1, estimatedDurationMinutes: 68, expectedCashPaise: 115800, status: 'READY',
};

function stops(prefix: string, count: number, latitude: number, longitude: number, cash: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-stop-${index + 1}`,
    sequenceNumber: index + 1,
    status: 'PLANNED',
    version: 0,
    cashDuePaise: index === 0 ? cash : 0,
    expectedParcelCount: 1,
    deliveryLatitude: latitude + (index % 5) * 0.002,
    deliveryLongitude: longitude + Math.floor(index / 5) * 0.002,
    deliveryJob: { order: { customer: { name: `${prefix} Customer ${index + 1}` } } },
  }));
}

const runA = {
  id: 'run-pmp', routeCode: 'RUN-PMP-001', version: 3, status: 'PLANNED',
  serviceDate: '2026-08-07T00:00:00.000Z', slotStart: '2026-08-07T06:00:00.000Z', slotEnd: '2026-08-07T08:00:00.000Z',
  totalStopCount: 10, expectedCashPaise: 239900, collectedCashPaise: 0, depositedCashPaise: 0,
  expectedParcelCount: 10, expectedWeightGrams: 18500, estimatedDistanceKm: 12.4, estimatedDurationMinutes: 72,
  assignmentReasonSummary: 'Preferred-zone rider; 1.4 km from pickup', deliveryZoneId: zoneA.id, deliveryZone: zoneA,
  store: { id: 'store-pmp', name: 'Aagaam PM Palem Store', address: 'PM Palem, Visakhapatnam', latitude: 17.748, longitude: 83.322 },
  rider: { id: 'rider-ramesh', user: { id: 'user-ramesh', name: 'Ramesh' }, availabilityLocation: { latitude: 17.746, longitude: 83.319 } },
  stops: stops('PMP', 10, 17.746, 83.324, 239900),
};
const runB = {
  id: 'run-mdw', routeCode: 'RUN-MDW-001', version: 2, status: 'PLANNED',
  serviceDate: '2026-08-07T00:00:00.000Z', slotStart: '2026-08-07T06:00:00.000Z', slotEnd: '2026-08-07T08:00:00.000Z',
  totalStopCount: 10, expectedCashPaise: 115800, collectedCashPaise: 0, depositedCashPaise: 0,
  expectedParcelCount: 10, expectedWeightGrams: 17250, estimatedDistanceKm: 11.2, estimatedDurationMinutes: 68,
  assignmentReasonSummary: 'Preferred-zone rider; 1.1 km from pickup', deliveryZoneId: zoneB.id, deliveryZone: zoneB,
  store: { id: 'store-mdw', name: 'Aagaam Madhurawada Store', address: 'Madhurawada, Visakhapatnam', latitude: 17.807, longitude: 83.354 },
  rider: { id: 'rider-suresh', user: { id: 'user-suresh', name: 'Suresh' }, availabilityLocation: { latitude: 17.805, longitude: 83.351 } },
  stops: stops('MDW', 10, 17.802, 83.350, 115800),
};

const dashboard = {
  date: '2026-08-07', zones: [zoneA, zoneB], runs: [runA, runB], unassigned: [],
  riders: [
    { id: 'rider-ramesh', status: 'ONLINE', homeZoneId: zoneA.id, maximumParcelCapacity: 15, maximumCashHoldingPaise: 1_000_000, availabilityLocation: { latitude: 17.746, longitude: 83.319 }, user: { id: 'user-ramesh', name: 'Ramesh' }, homeZone: zoneA },
    { id: 'rider-suresh', status: 'ONLINE', homeZoneId: zoneB.id, maximumParcelCapacity: 15, maximumCashHoldingPaise: 1_000_000, availabilityLocation: { latitude: 17.805, longitude: 83.351 }, user: { id: 'user-suresh', name: 'Suresh' }, homeZone: zoneB },
  ],
  recentEvents: [
    { id: 'event-1', eventType: 'ROUTE_CLUSTER_CREATED', createdAt: '2026-08-06T10:00:00.000Z', payload: { routeCode: runA.routeCode } },
    { id: 'event-2', eventType: 'DELIVERY_RUN_ASSIGNED', createdAt: '2026-08-06T10:01:00.000Z', payload: { routeCode: runB.routeCode } },
  ],
  totals: { deliveries: 20, runs: 2, unassigned: 0, ridersNeeded: 0, expectedCashPaise: 355700, collectedCashPaise: 0, heldCashPaise: 0 },
};

async function mockRegionalApis(page: import('@playwright/test').Page) {
  await page.route('**/admin/subscriptions/regional-routing/dashboard**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard) }));
  await page.route('**/admin/subscriptions/regional-routing/events**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/admin/subscriptions/regional-routing/plan', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ runs: [runA, runB], deferred: [] }) }));
  await page.route('**/admin/subscriptions/regional-routing/runs/run-pmp/split-preview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    sourceRun: { id: runA.id, routeCode: runA.routeCode, version: runA.version, stopCount: 10 },
    method: 'AUTOMATIC_GEOGRAPHIC',
    resultingRuns: [
      { index: 1, stopIds: runA.stops.slice(0, 6).map((stop) => stop.id), stopCount: 6, parcelCount: 6, expectedCashPaise: 239900, expectedWeightGrams: 11100, estimatedDistanceKm: 7.1, estimatedDurationMinutes: 44 },
      { index: 2, stopIds: runA.stops.slice(6).map((stop) => stop.id), stopCount: 4, parcelCount: 4, expectedCashPaise: 0, expectedWeightGrams: 7400, estimatedDistanceKm: 5.8, estimatedDurationMinutes: 31 },
    ],
  }) }));
}

test.describe('regional route planning UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginWithCookieSession(page, 'ADMIN');
    await mockRegionalApis(page);
  });

  test('admin sees two regional clusters, riders, route estimates and rider-specific cash', async ({ page }) => {
    await page.goto('/admin/route-planning');
    await expect(page.getByRole('heading', { name: 'Region & Route Planning' })).toBeVisible();
    await expect(page.getByText('PM Palem', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Madhurawada', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('RUN-PMP-001', { exact: true })).toBeVisible();
    await expect(page.getByText('RUN-MDW-001', { exact: true })).toBeVisible();
    await expect(page.getByText('Rider: Ramesh')).toBeVisible();
    await expect(page.getByText('Rider: Suresh')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Regional delivery routes map' })).toBeVisible();
    await page.screenshot({ path: `${screenshots}/01-admin-two-region-map-and-runs.png`, fullPage: true });
  });

  test('admin previews a safe non-equal route split before confirmation', async ({ page }) => {
    await page.goto('/admin/route-planning');
    await page.getByText('RUN-PMP-001', { exact: true }).click();
    await expect(page.getByText('Controlled route management')).toBeVisible();
    await page.getByRole('button', { name: 'Preview split' }).click();
    await expect(page.getByText('Proposed run 1')).toBeVisible();
    await expect(page.getByText('6 stops · 11.1 kg · 7.1 km · 44 min · ₹2,399')).toBeVisible();
    await expect(page.getByText('4 stops · 7.4 kg · 5.8 km · 31 min · ₹0')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm split' })).toBeVisible();
    await page.screenshot({ path: `${screenshots}/02-admin-route-split-preview.png`, fullPage: true });
  });
});
