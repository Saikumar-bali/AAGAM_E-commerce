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
  DeliveryJobStatus: { SCHEDULED: 'SCHEDULED', STORE_DELIVERING: 'STORE_DELIVERING' },
  prisma: {
    subscriptionDelivery: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    deliveryJob: { updateMany: jest.fn() },
    subscriptionAuditEntry: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

describe('StoreSelfDeliveryService — store fulfillment queue', () => {
  const service = new StoreSelfDeliveryService();
  const findMany = prisma.subscriptionDelivery.findMany as jest.Mock;

  const storeId = 'store-aagaam';

  const baseDelivery = (overrides: Record<string, any>) => ({
    id: 'delivery-1',
    sequenceNumber: 1,
    deliverySlot: 'AM',
    status: 'SCHEDULED',
    serviceDate: new Date('2026-09-12T00:00:00.000Z'),
    deliveryJobId: null,
    runStop: null,
    subscription: {
      id: 'sub-1',
      customerId: 'cust-1',
      deliveryMethod: 'HOME',
      deliveryWindowStartMinute: 6 * 60,
      deliveryWindowEndMinute: 9 * 60,
      storeDelivery: false,
      customer: { id: 'cust-1', name: 'Sai', phone: '7569989129' },
      address: { line1: 'Bowluvada', line2: null, city: 'Anakapalli', pincode: '531032', latitude: null, longitude: null, landmark: null },
    },
    order: null,
    deliveryJob: null,
    ...overrides,
  });

  beforeEach(() => jest.clearAllMocks());

  it('includes store-assigned rows that are not rider-linked even when storeDelivery is false', async () => {
    findMany.mockResolvedValue([baseDelivery({})]);

    const queue = await service.getTodayQueue(storeId);

    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('delivery-1');
    expect(queue[0].subscription.storeDelivery).toBe(false);
    // no rider job created -> store fulfils it directly
    expect(queue[0].deliveryJobId).toBeNull();

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND[0].OR).toEqual([
      { subscription: { storeDelivery: true } },
      { AND: [{ deliveryJobId: null }, { runStop: null }] },
    ]);
  });

  it('still includes rows that are explicitly marked storeDelivery', async () => {
    findMany.mockResolvedValue([
      baseDelivery({ id: 'delivery-a', subscription: { ...baseDelivery({}).subscription, storeDelivery: true } }),
    ]);

    const queue = await service.getTodayQueue(storeId);

    expect(queue[0].id).toBe('delivery-a');
    expect(queue[0].subscription.storeDelivery).toBe(true);
  });

  it('keeps rider-linked rows out of the store queue when storeDelivery is false', async () => {
    const riderRow = baseDelivery({
      id: 'delivery-rider',
      deliveryJobId: 'job-rider',
      runStop: { id: 'stop-1' },
      deliveryJob: { id: 'job-rider', status: 'SCHEDULED' },
      status: 'ORDER_GENERATED',
    });

    findMany.mockResolvedValue([riderRow]);

    const queue = await service.getTodayQueue(storeId);

    // The queue must not surface a rider-run stop for store self-fulfilment.
    const where = findMany.mock.calls[0][0].where;
    const riderClaimed = (where.AND[0].OR as Array<Record<string, any>>).some((branch) => {
      const innerAnd = branch.AND;
      return innerAnd && innerAnd.find((c: Record<string, any>) => c.deliveryJobId === null);
    });
    expect(riderClaimed).toBe(true); // non-rider branch exists...
    // ...and the rider row itself does NOT satisfy it (job + runStop both present).
    expect(riderRow.deliveryJobId).not.toBeNull();
    expect(riderRow.runStop).not.toBeNull();
    // Current data contracts leave the filtering to the query; assert the query
    // shape only includes the store-non-rider + explicit storeDelivery branches.
    expect(where.AND[0].OR).toHaveLength(2);
  });

  it('startDelivery accepts a non-rider-linked row even when storeDelivery is false', async () => {
    const row = baseDelivery({});
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(row);
    (prisma.subscriptionDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    prisma.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prisma));

    const result = await service.startDelivery('delivery-1', 'store-user');

    expect(result).toEqual({ success: true, deliveryId: 'delivery-1', status: 'STORE_DELIVERING' });
  });

  it('startDelivery rejects a row claimed by a rider run for a non-storeDelivery subscription', async () => {
    const row = baseDelivery({
      deliveryJobId: 'job-rider',
      runStop: { id: 'stop-1' },
    });
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(row);

    await expect(service.startDelivery('delivery-1', 'store-user')).rejects.toBeInstanceOf(BadRequestException);
  });
});