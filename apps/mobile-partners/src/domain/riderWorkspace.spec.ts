import {
  RiderAssignmentOffer,
  isOfferActionable,
  isTerminalDeliveryStatus,
  isTrackableDeliveryStatus,
  nextActionForStatus,
  normalizeRiderWorkspace,
  offerSecondsRemaining,
  trackingIntervalForStatus,
} from './riderWorkspace';

function offer(expiresAt: string, status: RiderAssignmentOffer['status'] = 'OFFERED'): RiderAssignmentOffer {
  return {
    id: 'assignment-1',
    deliveryJobId: 'job-1',
    status,
    expiresAt,
    deliveryJob: {
      id: 'job-1',
      orderId: 'order-1',
      status: 'WAITING_FOR_DISPATCH',
      order: { id: 'order-1' },
    },
  };
}

describe('rider workspace domain', () => {
  it('normalizes incomplete API payloads safely', () => {
    expect(normalizeRiderWorkspace(null)).toEqual({
      rider: null,
      pendingOffers: [],
      activeJob: null,
      assignmentHistory: [],
    });
    expect(normalizeRiderWorkspace({ pendingOffers: 'invalid' }).pendingOffers).toEqual([]);
  });

  it('expires offers deterministically and never enables answered offers', () => {
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const active = offer('2026-07-11T10:00:09.200Z');
    const expired = offer('2026-07-11T09:59:59.000Z');
    expect(offerSecondsRemaining(active.expiresAt, now)).toBe(10);
    expect(isOfferActionable(active, now)).toBe(true);
    expect(isOfferActionable(expired, now)).toBe(false);
    expect(isOfferActionable(offer(active.expiresAt!, 'ACCEPTED'), now)).toBe(false);
  });

  it('exposes only valid rider transitions and sends completion to Phase 3 operations', () => {
    expect(nextActionForStatus('RIDER_ASSIGNED')?.action).toBe('EN_ROUTE_TO_STORE');
    expect(nextActionForStatus('RIDER_EN_ROUTE_TO_STORE')?.action).toBe('ARRIVED_AT_STORE');
    expect(nextActionForStatus('RIDER_AT_STORE')).toBeNull();
    expect(nextActionForStatus('PICKUP_VERIFIED')?.action).toBe('OUT_FOR_DELIVERY');
    expect(nextActionForStatus('OUT_FOR_DELIVERY')?.action).toBe('ARRIVED_AT_CUSTOMER');
    expect(nextActionForStatus('RIDER_AT_CUSTOMER')).toBeNull();
    expect(nextActionForStatus('DELIVERED')).toBeNull();
  });

  it('uses faster tracking after pickup and stops on terminal states', () => {
    expect(isTrackableDeliveryStatus('RIDER_ASSIGNED')).toBe(true);
    expect(isTrackableDeliveryStatus('OUT_FOR_DELIVERY')).toBe(true);
    expect(isTrackableDeliveryStatus('DELIVERED')).toBe(false);
    expect(isTerminalDeliveryStatus('DELIVERED')).toBe(true);
    expect(isTerminalDeliveryStatus('CANCELLED')).toBe(true);
    expect(trackingIntervalForStatus('RIDER_ASSIGNED')).toBe(20_000);
    expect(trackingIntervalForStatus('PICKUP_VERIFIED')).toBe(12_000);
    expect(trackingIntervalForStatus('OUT_FOR_DELIVERY')).toBe(8_000);
  });
});
