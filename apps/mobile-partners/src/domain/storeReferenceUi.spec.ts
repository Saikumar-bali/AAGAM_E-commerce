import {
  buildStorePickupReceipt,
  orderPaymentMethod,
  orderStatusTab,
  pickupStatusTab,
  shortStoreOrderId,
  summarizeStoreOrders,
} from './storeReferenceUi';

describe('store reference UI helpers', () => {
  it('maps live order statuses into every approved order tab', () => {
    expect(orderStatusTab('PENDING')).toBe('NEW');
    expect(orderStatusTab('PICKING')).toBe('PREPARING');
    expect(orderStatusTab('PACKED')).toBe('READY');
    expect(orderStatusTab('RIDER_ASSIGNED')).toBe('PICKUP');
    expect(orderStatusTab('DELIVERED')).toBe('DELIVERED');
    expect(orderStatusTab('CANCELLED')).toBe('ISSUES');
    expect(orderStatusTab('PAYMENT_FAILED')).toBe('ISSUES');
  });

  it('summarizes the visible queue including operational issues without inventing counts', () => {
    expect(summarizeStoreOrders([
      { status: 'PENDING' },
      { status: 'CONFIRMED' },
      { status: 'PACKED' },
      { status: 'OUT_FOR_DELIVERY' },
      { status: 'DELIVERED' },
      { status: 'CANCELLED' },
    ])).toEqual({ NEW: 1, PREPARING: 1, READY: 1, PICKUP: 1, DELIVERED: 1, ISSUES: 1 });
  });

  it('maps pickup queue states and builds the success receipt from live data', () => {
    expect(pickupStatusTab('RIDER_AT_STORE')).toBe('WAITING');
    expect(pickupStatusTab('RIDER_ASSIGNED')).toBe('EN_ROUTE');
    expect(pickupStatusTab('RETURNING_TO_STORE')).toBe('OTHER');

    const receipt = buildStorePickupReceipt({
      id: 'job-1',
      currentRider: { user: { name: 'Suresh', phone: '+919876511122', rating: 4.8 } },
      order: {
        id: 'order-12548',
        payment: { method: 'COD' },
        customer: { name: 'Rahul' },
      },
    }, 2, new Date('2026-08-02T10:00:00.000Z'));

    expect(receipt).toMatchObject({
      deliveryJobId: 'job-1',
      orderId: 'order-12548',
      riderName: 'Suresh',
      customerName: 'Rahul',
      paymentMethod: 'COD',
      parcelCount: 2,
    });
  });

  it('normalizes payment labels and short order identifiers', () => {
    expect(orderPaymentMethod({ payment: { method: 'COD' } })).toBe('COD');
    expect(orderPaymentMethod({ payment: { method: 'CARD' } })).toBe('Prepaid');
    expect(shortStoreOrderId('order-ABCDEFGH')).toBe('ABCDEFGH');
  });
});
