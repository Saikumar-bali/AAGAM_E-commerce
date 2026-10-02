import { BadRequestException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { StoreSelfDeliveryService } from './store-self-delivery.service';

jest.mock('@aagam/database', () => ({
  Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } },
  Role: { STORE_OWNER: 'STORE_OWNER', ADMIN: 'ADMIN' },
  SubscriptionDeliveryStatus: {
    SCHEDULED: 'SCHEDULED',
    ORDER_GENERATED: 'ORDER_GENERATED',
    PREPARING: 'PREPARING',
    PACKED: 'PACKED',
    STORE_DELIVERING: 'STORE_DELIVERING',
    DELIVERED: 'DELIVERED',
    FAILED: 'FAILED',
  },
  PaymentStatus: { CAPTURED: 'CAPTURED', CREATED: 'CREATED', PENDING_COD: 'PENDING_COD' },
  CustomerSubscriptionStatus: { ACTIVE: 'ACTIVE', PENDING_CASH_COLLECTION: 'PENDING_CASH_COLLECTION', PAYMENT_DUE: 'PAYMENT_DUE' },
  DeliveryJobStatus: { SCHEDULED: 'SCHEDULED', STORE_DELIVERING: 'STORE_DELIVERING' },
  prisma: {
    subscriptionDelivery: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    customerSubscription: { findUnique: jest.fn(), update: jest.fn() },
    order: { findUnique: jest.fn(), update: jest.fn() },
    payment: { update: jest.fn() },
    store: { findUnique: jest.fn() },
    storeDeliveryProof: { create: jest.fn() },
    deliveryJob: { updateMany: jest.fn(), update: jest.fn() },
    subscriptionAuditEntry: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

/**
 * Coverage for the optional `from` / `to` window added to the store
 * self-delivery queue so the Deliveries date rail can show future days.
 */
describe('StoreSelfDeliveryService.getTodayQueue — date range', () => {
  const service = new StoreSelfDeliveryService();
  const findMany = prisma.subscriptionDelivery.findMany as jest.Mock;
  const storeId = 'store-aagaam';

  const localDay = (value: string, plusDays = 0) => {
    const day = new Date(`${value}T00:00:00`);
    day.setDate(day.getDate() + plusDays);
    return day;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it('defaults to a single local day (backwards compatible)', async () => {
    await service.getTodayQueue(storeId);

    const { serviceDate } = findMany.mock.calls[0][0].where;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    expect(serviceDate.gte).toEqual(today);
    expect(serviceDate.lt).toEqual(tomorrow);
  });

  it('widens the window inclusively when from/to are supplied', async () => {
    await service.getTodayQueue(storeId, { from: '2026-10-05', to: '2026-10-08' });

    const { serviceDate } = findMany.mock.calls[0][0].where;
    // inclusive of the whole of `to`
    expect(serviceDate.gte).toEqual(localDay('2026-10-05'));
    expect(serviceDate.lt).toEqual(localDay('2026-10-08', 1));
  });

  it('honours a future-only window (the Deliveries date rail case)', async () => {
    await service.getTodayQueue(storeId, { from: '2026-10-03' });

    const { serviceDate } = findMany.mock.calls[0][0].where;
    expect(serviceDate.gte).toEqual(localDay('2026-10-03'));
    expect(serviceDate.lt).toEqual(localDay('2026-10-04'));
  });

  it('accepts a 31-day inclusive window', async () => {
    await expect(
      service.getTodayQueue(storeId, { from: '2026-01-01', to: '2026-01-31' }),
    ).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['2026-10-05', '10/05/2026'],
    ['not-a-date', undefined],
  ])('rejects a malformed date (from=%s, to=%s)', async (from, to) => {
    await expect(service.getTodayQueue(storeId, { from, to })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects `to` earlier than `from`', async () => {
    await expect(
      service.getTodayQueue(storeId, { from: '2026-10-05', to: '2026-10-04' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects a window wider than 31 days', async () => {
    await expect(
      service.getTodayQueue(storeId, { from: '2026-01-01', to: '2026-02-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
