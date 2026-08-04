import {
  createRiderNavigationSession,
  destinationForJob,
  navigationPhaseForStatus,
} from './riderNavigationSession';
import type { RiderDeliveryJob } from './riderWorkspace';

const job = (status: RiderDeliveryJob['status']): RiderDeliveryJob => ({
  id: 'job-1',
  orderId: 'order-1',
  status,
  order: {
    id: 'order-1',
    deliveryLat: 17.73,
    deliveryLng: 83.31,
    customer: { name: 'Customer' },
    store: { name: 'Owning store', latitude: 17.71, longitude: 83.30 },
  },
});

describe('RiderNavigationSession', () => {
  it.each([
    ['RIDER_ASSIGNED', 'TO_STORE'],
    ['RIDER_AT_STORE', 'AT_STORE'],
    ['PICKUP_VERIFIED', 'TO_CUSTOMER'],
    ['RIDER_AT_CUSTOMER', 'AT_CUSTOMER'],
    ['RETURNING_TO_STORE', 'RETURN_TO_STORE'],
  ] as const)('maps %s to %s', (status, phase) => {
    expect(navigationPhaseForStatus(status)).toBe(phase);
  });

  it('switches from the store to the customer after pickup verification', () => {
    expect(destinationForJob(job('RIDER_EN_ROUTE_TO_STORE')).destination).toEqual({
      latitude: 17.71,
      longitude: 83.30,
    });
    expect(destinationForJob(job('PICKUP_VERIFIED')).destination).toEqual({
      latitude: 17.73,
      longitude: 83.31,
    });
  });

  it('returns to the original owning store after a failure', () => {
    const route = destinationForJob(job('RETURNING_TO_STORE'));
    expect(route.label).toBe('Owning store');
    expect(route.destination).toEqual({ latitude: 17.71, longitude: 83.30 });
  });

  it('reports distance, ETA and stale route state', () => {
    const session = createRiderNavigationSession({
      job: job('OUT_FOR_DELIVERY'),
      riderLocation: { latitude: 17.72, longitude: 83.30 },
      routeUpdatedAt: '2026-08-04T00:00:00.000Z',
      nowMs: new Date('2026-08-04T00:01:00.000Z').getTime(),
    });
    expect(session.remainingDistanceKm).toBeGreaterThan(0);
    expect(session.etaMinutes).toBeGreaterThan(0);
    expect(session.stale).toBe(true);
  });
});
