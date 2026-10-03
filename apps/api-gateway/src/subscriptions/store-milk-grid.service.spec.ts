import { prisma, Role } from '@aagam/database';
import { StoreMilkGridService } from './store-milk-grid.service';

jest.mock('@aagam/database', () => ({
  prisma: {
    subscriptionDelivery: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    customerSubscription: { findUnique: jest.fn(), update: jest.fn() },
    riderProfile: { findFirst: jest.fn() },
    deliveryRunStop: { update: jest.fn(), aggregate: jest.fn(), count: jest.fn() },
    deliveryRun: { update: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  },
  Role: { STORE_OWNER: 'STORE_OWNER', ADMIN: 'ADMIN', RIDER: 'RIDER' },
  SubscriptionDeliveryStatus: {
    SCHEDULED: 'SCHEDULED',
    DELIVERED: 'DELIVERED',
    ASSIGNED: 'ASSIGNED',
    SKIPPED: 'SKIPPED',
    RESCHEDULED: 'RESCHEDULED',
    FAILED: 'FAILED',
  },
  PaymentMethod: { CASH: 'CASH', PHONE_PE: 'PHONE_PE' },
  PaymentStatus: { CAPTURED: 'CAPTURED', PENDING_COD: 'PENDING_COD' },
}));

describe('StoreMilkGridService — TOGGLE_DELIVERED routes through funding entitlement', () => {
  const consume = jest.fn();
  const funding: any = { consumeDeliveredWithinTransaction: consume };
  const service = new StoreMilkGridService(funding);
  const tx: any = {
    subscriptionDelivery: { update: jest.fn().mockResolvedValue({ id: 'del-1' }) },
    customerSubscription: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
  };

  const delivery = (overrides: Record<string, any> = {}) => ({
    id: 'del-1',
    status: 'SCHEDULED',
    serviceDate: new Date('2026-09-12T00:00:00.000Z'),
    cashCollectedPaise: 0,
    cashCollectedAt: null,
    subscriptionId: 'sub-1',
    subscription: {
      id: 'sub-1',
      status: 'PENDING_CASH_COLLECTION',
      completedDeliveries: 0,
      skippedDeliveries: 0,
      remainingFundedDeliveries: 0,
      amountDuePaise: 59900,
      amountCollectedPaise: 0,
      homeStore: { ownerId: 'store-user' },
      planVersion: { totalDeliveries: 30 },
    },
    runStop: null,
    deliveryJob: null,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.subscriptionDelivery.update as jest.Mock).mockResolvedValue({});
    (prisma.customerSubscription.update as jest.Mock).mockResolvedValue({});
    consume.mockResolvedValue({ id: 'del-1', status: 'DELIVERED' });
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(tx));
  });

  it('delegates completion to the funding service with deliveryAlreadyCompleted', async () => {
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(delivery());

    await service.executeQuickAction({ id: 'store-user', role: Role.ADMIN }, 'del-1', { type: 'TOGGLE_DELIVERED' });

    expect(consume).toHaveBeenCalledWith(
      tx,
      'del-1',
      { id: 'store-user', role: Role.ADMIN },
      expect.stringContaining('milk-grid-delivered:del-1'),
      { deliveryAlreadyCompleted: true },
    );
  });

  it('rolls the entitlement back on undo without delegating to the funding service', async () => {
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(delivery({ status: 'DELIVERED' }));

    await service.executeQuickAction({ id: 'store-user', role: Role.ADMIN }, 'del-1', { type: 'TOGGLE_DELIVERED' });

    expect(consume).not.toHaveBeenCalled();
    expect(tx.customerSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ remainingFundedDeliveries: 1 }),
      }),
    );
  });

  describe('dispatchToRider', () => {
    const dispatchTx: any = {
      deliveryRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'run-rider', routeCode: 'RUN-AAGA-AM-2026-10-03-f2ce', status: 'READY_FOR_PICKUP' }),
        update: jest.fn().mockResolvedValue({}),
      },
      deliveryRunStop: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequenceNumber: 0 }, _count: { _all: 1 }, _sum: {} }),
        findUnique: jest.fn().mockResolvedValue({ id: 'stop-1', deliveryRunId: 'run-planner' }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      subscriptionDelivery: { update: jest.fn().mockResolvedValue({}) },
      customerSubscription: { updateMany: jest.fn().mockResolvedValue({}) },
      codLedger: { upsert: jest.fn().mockResolvedValue({}) },
      deliveryJob: { create: jest.fn().mockResolvedValue({ id: 'job-1' }) },
    };

    const delivery = {
      id: 'del-1',
      subscriptionId: 'sub-1',
      serviceDate: new Date('2026-10-03T00:00:00.000Z'),
      deliverySlot: 'AM',
      cashDuePaise: 1500,
      deliveryJobId: 'job-1',
      subscription: {
        customerId: 'cust-1',
        customer: { id: 'cust-1', name: 'Saikumar Bali', phone: '999' },
        homeStore: { id: 'store-1', ownerId: 'store-user', name: 'AAGA', address: 'x', latitude: 1, longitude: 1 },
        plan: {},
        addressSnapshot: {},
        itemsSnapshot: [],
      },
      order: { id: 'order-1', items: [], payment: null },
      deliveryJob: { id: 'job-1' },
      runStop: { id: 'stop-1', deliveryRunId: 'run-planner' },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (prisma.riderProfile.findFirst as jest.Mock) = jest.fn().mockResolvedValue({
        id: 'rider-1', status: 'ONLINE', user: { id: 'user-1', name: 'saikumarbali', phone: '999' },
      });
      (prisma.subscriptionDelivery.findMany as jest.Mock) = jest.fn().mockResolvedValue([delivery]);
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(dispatchTx));
    });

    it('moves a pre-existing stop onto the rider run and syncs order.riderId', async () => {
      await service.dispatchToRider({ id: 'store-user', role: Role.ADMIN }, { deliveryIds: ['del-1'], riderProfileId: 'rider-1' });

      expect(dispatchTx.deliveryRunStop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deliveryRunId: 'run-rider', movedFromRunId: 'run-planner' }),
        }),
      );
      expect(dispatchTx.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'order-1' }),
          data: expect.objectContaining({ riderId: 'rider-1', status: 'RIDER_ASSIGNED' }),
        }),
      );
      expect(dispatchTx.subscriptionDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'del-1' },
          data: expect.objectContaining({ status: 'ASSIGNED' }),
        }),
      );
    });
  });
});
