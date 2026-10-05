import { prisma, Role } from '@aagam/database';
import { StoreMilkGridService } from './store-milk-grid.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

jest.mock('@aagam/database', () => ({
  prisma: {
    subscriptionDelivery: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    customerSubscription: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    riderProfile: { findFirst: jest.fn() },
    deliveryRunStop: { update: jest.fn(), aggregate: jest.fn(), count: jest.fn() },
    deliveryRun: { update: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  },
  Role: { STORE_OWNER: 'STORE_OWNER', ADMIN: 'ADMIN', RIDER: 'RIDER' },
  DeliveryJobStatus: { DELIVERED: 'DELIVERED', RETURNED_TO_STORE: 'RETURNED_TO_STORE', CANCELLED: 'CANCELLED' },
  DeliveryRunStatus: { COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' },
  SubscriptionDeliveryStatus: {
    SCHEDULED: 'SCHEDULED',
    DELIVERED: 'DELIVERED',
    ASSIGNED: 'ASSIGNED',
    SKIPPED: 'SKIPPED',
    CANCELLED: 'CANCELLED',
    RESCHEDULED: 'RESCHEDULED',
    FAILED: 'FAILED',
  },
  PaymentMethod: { CASH: 'CASH', PHONE_PE: 'PHONE_PE' },
  PaymentStatus: { CAPTURED: 'CAPTURED', PENDING_COD: 'PENDING_COD' },
}));

describe('StoreMilkGridService — TOGGLE_DELIVERED routes through funding entitlement', () => {
  const consume = jest.fn();
  const funding: any = { consumeDeliveredWithinTransaction: consume };
  const lifecycle = new SubscriptionLifecycleService();
  const service = new StoreMilkGridService(funding, lifecycle);
  const tx: any = {
    subscriptionDelivery: {
      update: jest.fn().mockResolvedValue({ id: 'del-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'del-1' }),
    },
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

  it('cancels the rider run stop when the store marks a delivery skipped', async () => {
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(
      delivery({ runStop: { id: 'stop-1', deliveryRunId: 'run-1' }, deliveryJobId: 'job-1' }),
    );
    tx.deliveryRunStop = { findUnique: jest.fn().mockResolvedValue({ id: 'stop-1', deliveryRunId: 'run-1', deliveryJobId: 'job-1' }), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }), aggregate: jest.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: {} }), count: jest.fn().mockResolvedValue(0) };
    tx.deliveryJob = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    tx.order = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    tx.deliveryRun = {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ riderId: 'rider-1', status: 'READY_FOR_PICKUP', totalStopCount: 1, _count: { stops: 1 } }),
      findMany: jest.fn().mockResolvedValue([]),
    };
    tx.riderProfile = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    tx.deliveryJob.findMany = jest.fn().mockResolvedValue([]);
    tx.subscriptionDelivery.findUnique = jest.fn().mockResolvedValue({ deliveryJobId: 'job-1', order: { id: 'order-1' } });

    const result = await service.executeQuickAction({ id: 'store-user', role: Role.ADMIN }, 'del-1', { type: 'SKIP' });

    expect(tx.deliveryRunStop.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(tx.deliveryJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    // The last live stop is gone, so the emptied run is cancelled and the
    // rider released instead of being pinned BUSY by a stop-less run.
    expect(tx.deliveryRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(tx.riderProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ONLINE' }) }),
    );
    expect(result.success).toBe(true);
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
      deliveryJob: { create: jest.fn().mockResolvedValue({ id: 'job-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
      // A pre-pickup job must be advanced to the store, otherwise the rider's
      // route pickup rejects the stop ("not ready for rider receipt").
      expect(dispatchTx.deliveryJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RIDER_AT_STORE', currentRiderId: 'rider-1' }) }),
      );
    });

    it('creates a freshly dispatched job at the store, not already out for delivery', async () => {
      const noJob = { ...delivery, deliveryJobId: null, deliveryJob: null, order: { id: 'order-1', items: [], payment: null } };
      (prisma.subscriptionDelivery.findMany as jest.Mock).mockResolvedValue([noJob]);

      await service.dispatchToRider({ id: 'store-user', role: Role.ADMIN }, { deliveryIds: ['del-1'], riderProfileId: 'rider-1' });

      expect(dispatchTx.deliveryJob.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RIDER_AT_STORE' }) }),
      );
    });

    it('does not dispatch skipped deliveries', async () => {
      await service.dispatchToRider({ id: 'store-user', role: Role.ADMIN }, { deliveryIds: ['del-1'], riderProfileId: 'rider-1' });

      expect(prisma.subscriptionDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['SKIPPED', 'CANCELLED'] },
          }),
        }),
      );
    });

    it('does not mint a COD ledger for a prepaid day with zero cash due', async () => {
      // CodLedger has a CHECK(expectedAmountPaise > 0); creating one for a
      // fully-funded day used to 500 the whole dispatch.
      const prepaid = { ...delivery, cashDuePaise: 0, deliveryJobId: null, deliveryJob: null, order: { id: 'order-1', items: [], payment: null } };
      (prisma.subscriptionDelivery.findMany as jest.Mock).mockResolvedValue([prepaid]);

      await service.dispatchToRider({ id: 'store-user', role: Role.ADMIN }, { deliveryIds: ['del-1'], riderProfileId: 'rider-1' });

      expect(dispatchTx.codLedger.upsert).not.toHaveBeenCalled();
    });

    it('mints a COD ledger when cash is due', async () => {
      const cashDay = { ...delivery, cashDuePaise: 1500, deliveryJobId: null, deliveryJob: null, order: { id: 'order-1', items: [], payment: null } };
      (prisma.subscriptionDelivery.findMany as jest.Mock).mockResolvedValue([cashDay]);

      await service.dispatchToRider({ id: 'store-user', role: Role.ADMIN }, { deliveryIds: ['del-1'], riderProfileId: 'rider-1' });

      expect(dispatchTx.codLedger.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ expectedAmountPaise: 1500 }) }),
      );
    });
  });
});

describe('StoreMilkGridService — getGrid litre totals include undelivered plan milk', () => {
  const funding: any = { consumeDeliveredWithinTransaction: jest.fn() };
  const lifecycle = new SubscriptionLifecycleService();
  const service = new StoreMilkGridService(funding, lifecycle);

  const delivery = (id: string, day: number, status: string, cash = 0) => ({
    id,
    status,
    serviceDate: new Date(Date.UTC(2026, 9, day)),
    cashCollectedPaise: cash,
    cashDuePaise: 0,
    deliverySlot: 'AM',
    deferredReason: null,
    failureReason: null,
    sequenceNumber: day,
    runStop: null,
    riderPhotoProof: null,
  });

  beforeEach(() => {
    (prisma.customerSubscription.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sub-1',
        status: 'ACTIVE',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        addressSnapshot: { line1: 'Street 1' },
        priceSnapshot: {},
        itemsSnapshot: [],
        homeStore: { id: 'store-1', name: 'Store' },
        defaultRider: null,
        temporaryRider: null,
        pauseEffectiveFrom: null,
        amountCollectedPaise: 5000,
        amountDuePaise: 25000,
        customer: { id: 'cust-1', name: 'Cust', phone: '999', email: 'c@example.com', acquisitionSource: 'MANUAL' },
        plan: { id: 'plan-1', name: 'Cow Milk 1L', code: 'CM1' },
        deliveries: [
          delivery('d1', 1, 'DELIVERED', 5000),
          delivery('d2', 2, 'SCHEDULED'),
          delivery('d3', 3, 'ORDER_GENERATED'),
          delivery('d4', 4, 'SKIPPED'),
        ],
      },
    ]);
  });

  it('sums every non-skipped/cancelled cell so future days are not shown as 0L', async () => {
    const grid = await service.getGrid({ id: 'store-user', role: Role.ADMIN }, 2026, 9);

    expect(grid.rows).toHaveLength(1);
    const row = grid.rows[0];
    // 1L delivered + 1L scheduled + 1L order-generated; skipped day excluded.
    expect(row.totalLiters).toBe(3);
    expect(row.totalDeliveredDays).toBe(1);
    expect(row.totalActiveDeliveries).toBe(3);

    expect(grid.dailyTotals[1]).toMatchObject({ deliveredCount: 1, totalDeliveries: 1, totalLiters: 1, cashCollectedPaise: 5000 });
    expect(grid.dailyTotals[2]).toMatchObject({ scheduledCount: 1, totalDeliveries: 1, totalLiters: 1 });
    expect(grid.dailyTotals[3]).toMatchObject({ deliveredCount: 0, totalDeliveries: 1, totalLiters: 1 });
    expect(grid.dailyTotals[4]).toMatchObject({ deliveredCount: 0, totalDeliveries: 0, totalLiters: 0 });
  });
});

describe('StoreMilkGridService — query parameter validation', () => {
  const service = new StoreMilkGridService({} as any, new SubscriptionLifecycleService());

  it('rejects an out-of-range month instead of silently rolling into another month', async () => {
    await expect(service.getGrid({ id: 'store-user', role: Role.ADMIN }, 2026, 13)).rejects.toThrow(
      /month must be an integer between 0 and 11/,
    );
  });

  it('rejects a non-integer year instead of throwing a RangeError', async () => {
    await expect(service.getGrid({ id: 'store-user', role: Role.ADMIN }, Number('abc'), 1)).rejects.toThrow(
      /year must be an integer/,
    );
    await expect(service.getGrid({ id: 'store-user', role: Role.ADMIN }, 99999, 1)).rejects.toThrow(
      /year must be an integer/,
    );
  });

  it('rejects an unparseable rider-assignment date instead of a 500', async () => {
    await expect(service.getRiderAssignments({ id: 'store-user', role: Role.ADMIN }, 'notadate')).rejects.toThrow(
      /Invalid service date/,
    );
  });
});


describe('StoreMilkGridService — RECORD_PAYMENT over-collection guards', () => {
  const service = new StoreMilkGridService({} as any, new SubscriptionLifecycleService());

  const delivery = (overrides: Record<string, any> = {}) => ({
    id: 'del-1',
    status: 'SCHEDULED',
    serviceDate: new Date('2026-09-12T00:00:00.000Z'),
    cashDuePaise: 6000,
    cashCollectedPaise: 0,
    cashCollectedAt: null,
    subscriptionId: 'sub-1',
    subscription: {
      id: 'sub-1',
      status: 'ACTIVE',
      amountDuePaise: 6000,
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
    (prisma.subscriptionDelivery.update as jest.Mock).mockResolvedValue({ id: 'del-1' });
    (prisma.customerSubscription.update as jest.Mock).mockResolvedValue({ id: 'sub-1' });
    (prisma.$transaction as jest.Mock).mockResolvedValue([{ id: 'del-1' }, { id: 'sub-1' }]);
  });

  it('rejects collecting more than the subscription still owes', async () => {
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(delivery());

    await expect(
      service.executeQuickAction({ id: 'store-user', role: Role.ADMIN }, 'del-1', {
        type: 'RECORD_PAYMENT',
        amountPaise: 10000,
      }),
    ).rejects.toThrow(/cannot exceed the outstanding due balance/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects collecting when the subscription has no outstanding due', async () => {
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(
      delivery({
        subscription: {
          id: 'sub-1',
          status: 'COMPLETED',
          amountDuePaise: 0,
          amountCollectedPaise: 6000,
          homeStore: { ownerId: 'store-user' },
          planVersion: { totalDeliveries: 30 },
        },
      }),
    );

    await expect(
      service.executeQuickAction({ id: 'store-user', role: Role.ADMIN }, 'del-1', {
        type: 'RECORD_PAYMENT',
        amountPaise: 1000,
      }),
    ).rejects.toThrow(/no outstanding due balance/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('records a valid payment up to the day cell outstanding amount', async () => {
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(delivery());

    const result = await service.executeQuickAction({ id: 'store-user', role: Role.ADMIN }, 'del-1', {
      type: 'RECORD_PAYMENT',
      amountPaise: 6000,
    });

    expect(result.success).toBe(true);
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amountCollectedPaise: 6000, amountDuePaise: 0 }),
      }),
    );
  });
});

