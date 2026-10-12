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
  DeliveryJobStatus: {
    DELIVERED: 'DELIVERED',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    RIDER_AT_CUSTOMER: 'RIDER_AT_CUSTOMER',
    STORE_DELIVERING: 'STORE_DELIVERING',
    RETURNED_TO_STORE: 'RETURNED_TO_STORE',
    CANCELLED: 'CANCELLED',
  },
  OrderStatus: {
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    STORE_DELIVERED: 'STORE_DELIVERED',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  },
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
  const transition = jest.fn();
  const funding: any = { consumeDeliveredWithinTransaction: consume };
  const workflow: any = { transitionWithinTransaction: transition };
  const lifecycle = new SubscriptionLifecycleService();
  const service = new StoreMilkGridService(funding, lifecycle, workflow);
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

  it('advances the linked order/job through the workflow when the linked job is out for delivery', async () => {
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(
      delivery({ deliveryJobId: 'job-1', runStop: { id: 'stop-1', deliveryRunId: 'run-1' } }),
    );
    tx.deliveryRunStop = { findUnique: jest.fn().mockResolvedValue({ id: 'stop-1', deliveryRunId: 'run-1', deliveryJobId: 'job-1' }), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }), aggregate: jest.fn().mockResolvedValue({ _count: { _all: 1 }, _sum: {} }), count: jest.fn().mockResolvedValue(1) };
    tx.deliveryRun = { update: jest.fn().mockResolvedValue({}) };
    tx.deliveryJob = { findUnique: jest.fn().mockResolvedValue({ status: 'RIDER_AT_CUSTOMER', order: { status: 'OUT_FOR_DELIVERY' } }) };

    await service.executeQuickAction({ id: 'store-user', role: Role.ADMIN }, 'del-1', { type: 'TOGGLE_DELIVERED' });

    expect(transition).toHaveBeenCalledWith(
      tx,
      'job-1',
      'DELIVERED',
      { id: 'store-user', role: Role.ADMIN },
      expect.objectContaining({ skipRoleCheck: true }),
    );
  });

  it('does not advance the order when the job is still at the store (illegal transition)', async () => {
    (prisma.subscriptionDelivery.findUnique as jest.Mock).mockResolvedValue(
      delivery({ deliveryJobId: 'job-1', runStop: { id: 'stop-1', deliveryRunId: 'run-1' } }),
    );
    tx.deliveryRunStop = { findUnique: jest.fn().mockResolvedValue({ id: 'stop-1', deliveryRunId: 'run-1', deliveryJobId: 'job-1' }), update: jest.fn().mockResolvedValue({}), aggregate: jest.fn().mockResolvedValue({ _count: { _all: 1 }, _sum: {} }), count: jest.fn().mockResolvedValue(1) };
    tx.deliveryRun = { update: jest.fn().mockResolvedValue({}) };
    tx.deliveryJob = { findUnique: jest.fn().mockResolvedValue({ status: 'RIDER_AT_STORE', order: { status: 'RIDER_ASSIGNED' } }) };

    await service.executeQuickAction({ id: 'store-user', role: Role.ADMIN }, 'del-1', { type: 'TOGGLE_DELIVERED' });

    expect(transition).not.toHaveBeenCalled();
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
            // The dispatch queries also refuse other terminal statuses (DELIVERED,
            // FAILED); assert containment so adding a terminal status does not
            // break this intent test.
            status: { notIn: expect.arrayContaining(['SKIPPED', 'CANCELLED']) },
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

    it('assigns every delivery the customer has that day, not just the picked contract', async () => {
      // Dispatching is per customer: picking one of a customer's contracts must
      // pull in the sibling contract's stop for the same day/slot too.
      const sibling = { ...delivery, id: 'del-2', subscriptionId: 'sub-2' };
      (prisma.subscriptionDelivery.findMany as jest.Mock)
        .mockResolvedValueOnce([delivery])       // the requested stop
        .mockResolvedValueOnce([delivery, sibling]); // the customer's full day set

      await service.dispatchToRider({ id: 'store-user', role: Role.ADMIN }, { deliveryIds: ['del-1'], riderProfileId: 'rider-1' });

      expect(dispatchTx.subscriptionDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'del-2' }, data: expect.objectContaining({ status: 'ASSIGNED' }) }),
      );
    });

    it('excludes terminal deliveries from the dispatch fan-out but still assigns a dispatchable sibling', async () => {
      // The picked stop's own DELIVERED exclusion lives in the grid UI; this
      // fan-out is automatic, so a terminal sibling must be refused here or a
      // finished day is flipped back to ASSIGNED and its stop resurrected. The
      // dispatchable sibling must still be assigned.
      const sibling = { ...delivery, id: 'del-2', subscriptionId: 'sub-2' };
      (prisma.subscriptionDelivery.findMany as jest.Mock)
        .mockResolvedValueOnce([delivery])            // the requested stop
        .mockResolvedValueOnce([delivery, sibling]);  // the customer's full day set

      await service.dispatchToRider({ id: 'store-user', role: Role.ADMIN }, { deliveryIds: ['del-1'], riderProfileId: 'rider-1' });

      // Both the selected-delivery query and the sibling query refuse terminal
      // statuses, so neither a picked nor a fanned-out finished day is reassigned.
      for (const call of (prisma.subscriptionDelivery.findMany as jest.Mock).mock.calls) {
        expect(call[0].where.status.notIn).toEqual(
          expect.arrayContaining(['SKIPPED', 'CANCELLED', 'DELIVERED', 'FAILED']),
        );
        // RESCHEDULED is a retry-pending day, not terminal: it must stay eligible
        // so autoDispatchDefaultRiders can put it back on the rider's route.
        expect(call[0].where.status.notIn).not.toContain('RESCHEDULED');
      }
      expect(dispatchTx.subscriptionDelivery.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'del-2' }, data: expect.objectContaining({ status: 'ASSIGNED' }) }),
      );
    });

    it('refuses a dispatch whose selected delivery is already terminal', async () => {
      (prisma.subscriptionDelivery.findMany as jest.Mock).mockResolvedValueOnce([]);

      await expect(
        service.dispatchToRider({ id: 'store-user', role: Role.ADMIN }, { deliveryIds: ['del-1'], riderProfileId: 'rider-1' }),
      ).rejects.toThrow('No matching deliveries found');
    });
  });
});

describe('StoreMilkGridService — getGrid litre totals include undelivered plan milk', () => {
  const funding: any = { consumeDeliveredWithinTransaction: jest.fn() };
  const lifecycle = new SubscriptionLifecycleService();
  const service = new StoreMilkGridService(funding, lifecycle, {} as any);

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

describe('StoreMilkGridService — merged rows keep each contract\'s partial due', () => {
  const funding: any = { consumeDeliveredWithinTransaction: jest.fn() };
  const lifecycle = new SubscriptionLifecycleService();
  const service = new StoreMilkGridService(funding, lifecycle, {} as any);

  const cell = (day: number, cash: number, due: number) => ({
    id: `del-${day}-${cash}`,
    status: 'DELIVERED',
    serviceDate: new Date(Date.UTC(2026, 9, day)),
    cashCollectedPaise: cash,
    cashDuePaise: due,
    deliverySlot: 'AM',
    deferredReason: null,
    failureReason: null,
    sequenceNumber: day,
    runStop: null,
    riderPhotoProof: null,
  });

  const sub = (id: string, collected: number, due: number, deliveries: any[]) => ({
    id,
    status: 'ACTIVE',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    addressSnapshot: { line1: 'Street 1' },
    priceSnapshot: {},
    itemsSnapshot: [],
    homeStore: { id: 'store-1', name: 'Store' },
    defaultRider: null,
    temporaryRider: null,
    pauseEffectiveFrom: null,
    amountCollectedPaise: collected,
    amountDuePaise: due,
    customer: { id: 'cust-1', name: 'Cust', phone: '999', email: 'c@example.com', acquisitionSource: 'MANUAL' },
    plan: { id: 'plan-1', name: 'Cow Milk 1L', code: 'CM1' },
    deliveries,
  });

  // Regression: one grid row per customer. A customer who holds several
  // contracts must not render one row (and one "Dispatch Deliveries" entry)
  // per contract — they merge onto one day map, and money is reconciled per
  // contract so a sibling's fully-paid ledger cannot absorb an under-collected
  // day cell and clamp its residual to zero (BUG-028/BUG-037).
  it('merges a customer contracts into one row and reconciles each contract', async () => {
    (prisma.customerSubscription.findMany as jest.Mock).mockResolvedValue([
      sub('sub-active', 0, 39900, [cell(10, 20000, 39900)]),
      sub('sub-sibling', 39900, 0, [cell(11, 39900, 39900)]),
    ]);

    const grid = await service.getGrid({ id: 'store-user', role: Role.ADMIN }, 2026, 9);

    expect(grid.rows).toHaveLength(1);
    const row = grid.rows[0];
    // Each contract's delivery stays visible on its own day.
    expect(row.days[10]).toMatchObject({ cashCollectedPaise: 20000, cashDuePaise: 39900 });
    expect(row.days[11]).toMatchObject({ cashCollectedPaise: 39900, cashDuePaise: 39900 });
    // ₹200 collected against ₹399 due on one contract keeps its ₹199 short;
    // the sibling's fully-paid ledger must not erase it.
    expect(row.totalCollectedPaise).toBe(59900);
    expect(row.totalDuePaise).toBe(19900);
    // The customer counts once, not once per plan.
    expect(grid.totalSubscribers).toBe(1);
  });
});

describe('StoreMilkGridService — one row per live contract', () => {
  const funding: any = { consumeDeliveredWithinTransaction: jest.fn() };
  const lifecycle = new SubscriptionLifecycleService();
  const service = new StoreMilkGridService(funding, lifecycle, {} as any);

  const delivery = (id: string, day: number, status: string, slot = 'AM') => ({
    id,
    status,
    serviceDate: new Date(Date.UTC(2026, 9, day)),
    cashCollectedPaise: 0,
    cashDuePaise: 0,
    deliverySlot: slot,
    deferredReason: null,
    failureReason: null,
    sequenceNumber: day,
    runStop: null,
    riderPhotoProof: null,
  });

  const sub = (id: string, planName: string, deliveries: any[]) => ({
    id,
    status: 'ACTIVE',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    addressSnapshot: { line1: 'Street 1' },
    priceSnapshot: {},
    itemsSnapshot: [],
    homeStore: { id: 'store-1', name: 'Store' },
    defaultRider: null,
    temporaryRider: null,
    pauseEffectiveFrom: null,
    amountCollectedPaise: 0,
    amountDuePaise: 0,
    customer: { id: 'cust-1', name: 'Cust', phone: '999', email: 'c@example.com', acquisitionSource: 'MANUAL' },
    plan: { id: `plan-${planName}`, name: planName, code: planName },
    deliveries,
  });

  // Regression: a customer with a same-day second plan used to collide on the
  // day-keyed cell map and drop one plan. Both contracts now merge into ONE
  // customer row, and that day shows both quantities folded into one cell.
  it('merges a same-day second plan into one customer row instead of spamming rows', async () => {
    (prisma.customerSubscription.findMany as jest.Mock).mockResolvedValue([
      sub('sub-cow', 'Cow Milk 1/4L', [delivery('c11', 11, 'SCHEDULED'), delivery('c12', 12, 'SCHEDULED')]),
      sub('sub-buffalo', 'Buffalo Milk (BM) - 1L Daily', [delivery('b11', 11, 'ORDER_GENERATED'), delivery('b12', 12, 'SCHEDULED')]),
    ]);

    const grid = await service.getGrid({ id: 'store-user', role: Role.ADMIN }, 2026, 9);

    // One row for the customer, not one per contract.
    expect(grid.rows).toHaveLength(1);
    expect(grid.totalSubscribers).toBe(1);
    const row = grid.rows[0];
    // Day 11 carries both plans' quantities folded into the single cell.
    expect(row.days[11]?.baseQuantity).toBe('0.25L + 1L');
    // The row's plan label lists both plans.
    expect(row.plan.name).toContain('Cow Milk 1/4L');
    expect(row.plan.name).toContain('Buffalo');
  });

  it('keeps a single row for a customer whose plans are all terminal', async () => {
    (prisma.customerSubscription.findMany as jest.Mock).mockResolvedValue([
      { ...sub('sub-old', 'Cow Milk 1/4L', [delivery('o1', 5, 'DELIVERED')]), status: 'COMPLETED' },
      { ...sub('sub-new', 'Cow Milk 1/4L', [delivery('n1', 20, 'DELIVERED')]), status: 'COMPLETED' },
    ]);

    const grid = await service.getGrid({ id: 'store-user', role: Role.ADMIN }, 2026, 9);

    expect(grid.rows).toHaveLength(1);
    expect(grid.totalSubscribers).toBe(1);
  });
});

describe('StoreMilkGridService — formatDayRange', () => {
  it('collapses consecutive days and keeps gaps', () => {
    expect(StoreMilkGridService.formatDayRange([])).toBe('');
    expect(StoreMilkGridService.formatDayRange([3])).toBe('3');
    expect(StoreMilkGridService.formatDayRange([1, 2, 3, 5, 9, 10])).toBe('1–3, 5, 9–10');
    expect(StoreMilkGridService.formatDayRange([11, 12, 13, 16])).toBe('11–13, 16');
  });
});

describe('StoreMilkGridService — query parameter validation', () => {
  const service = new StoreMilkGridService({} as any, new SubscriptionLifecycleService(), {} as any);

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
  const service = new StoreMilkGridService({} as any, new SubscriptionLifecycleService(), {} as any);

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

describe('StoreMilkGridService — getRiderAssignments reconciles the due it shows', () => {
  const service = new StoreMilkGridService({} as any, new SubscriptionLifecycleService(), {} as any);

  // A full-plan / manual subscription stamps its whole balance on sequence 1.
  // When that day is skipped (resolveMissedDeliveries tears down the rider
  // artifacts without rolling the cash forward) every remaining day cell reads
  // 0 while the ledger still holds the due — the board used to show "0 due".
  const stoppedDelivery = (overrides: Record<string, any> = {}) => ({
    id: 'del-1',
    status: 'SCHEDULED',
    serviceDate: new Date('2026-10-12T00:00:00.000Z'),
    sequenceNumber: 5,
    deliverySlot: 'AM',
    cashDuePaise: 0,
    cashCollectedPaise: 0,
    proofMode: 'RIDER_PHOTO_GPS',
    deferredReason: null,
    failureReason: null,
    subscriptionId: 'sub-1',
    subscription: {
      id: 'sub-1',
      status: 'ACTIVE',
      amountDuePaise: 89903,
      amountCollectedPaise: 29997,
      priceSnapshot: {},
      itemsSnapshot: null,
      addressSnapshot: { line1: 'Rani Home' },
      deliveryMethod: 'PERSONAL_HANDOVER',
      customer: { id: 'cust-1', name: 'Rani', phone: '9000000000' },
      plan: { id: 'plan-1', name: 'Cow Milk 1L', code: 'COW-1L' },
    },
    order: { id: 'order-1', status: 'OUT_FOR_DELIVERY' },
    runStop: null,
    ...overrides,
  });

  it('reports the ledger due as cash to collect when the day cell is stranded at 0', async () => {
    (prisma.subscriptionDelivery.findMany as jest.Mock)
      .mockResolvedValueOnce([stoppedDelivery()])
      .mockResolvedValueOnce([{ subscriptionId: 'sub-1', cashCollectedPaise: 0 }]);

    const board = await service.getRiderAssignments({ id: 'store-user', role: Role.ADMIN }, '2026-10-12');

    expect(board.unassigned).toHaveLength(1);
    expect(board.unassigned[0].cashDuePaise).toBe(0);
    expect(board.unassigned[0].outstandingDuePaise).toBe(89903);
    expect(board.totals.cashToCollectPaise).toBe(89903);
  });

  it('absorbs day-cell cash the ledger never recorded before reporting the due', async () => {
    (prisma.subscriptionDelivery.findMany as jest.Mock)
      .mockResolvedValueOnce([
        stoppedDelivery({
          subscription: {
            ...stoppedDelivery().subscription,
            amountCollectedPaise: 0,
            amountDuePaise: 10000,
          },
          runStop: {
            id: 'stop-1',
            sequenceNumber: 1,
            status: 'READY',
            proofMode: 'RIDER_PHOTO_GPS',
            deliveryRun: {
              id: 'run-1',
              routeCode: 'RUN-AAGA-AM-2026-10-12-f2ce',
              deliverySlot: 'AM',
              status: 'IN_PROGRESS',
              totalStopCount: 1,
              expectedCashPaise: 10000,
              serviceDate: new Date('2026-10-12T00:00:00.000Z'),
              startedAt: null,
              pickupConfirmedAt: null,
              completedAt: null,
              rider: {
                id: 'rider-1',
                status: 'BUSY',
                vehicleType: 'Bike',
                vehicleNumber: 'AP-01-XX-0001',
                user: { id: 'user-1', name: 'Sai', phone: '9111111111' },
              },
            },
          },
        }),
      ])
      .mockResolvedValueOnce([{ subscriptionId: 'sub-1', cashCollectedPaise: 5000 }]);

    const board = await service.getRiderAssignments({ id: 'store-user', role: Role.ADMIN }, '2026-10-12');

    expect(board.riders).toHaveLength(1);
    expect(board.riders[0].runs[0].stops[0].outstandingDuePaise).toBe(5000);
    expect(board.riders[0].runs[0].cashToCollectPaise).toBe(5000);
    expect(board.totals.cashToCollectPaise).toBe(5000);
  });

  it('counts a two-slot (AM+PM) subscription due once, not once per stop', async () => {
    (prisma.subscriptionDelivery.findMany as jest.Mock)
      .mockResolvedValueOnce([
        stoppedDelivery({ id: 'del-am', deliverySlot: 'AM' }),
        stoppedDelivery({ id: 'del-pm', deliverySlot: 'PM' }),
      ])
      .mockResolvedValueOnce([{ subscriptionId: 'sub-1', cashCollectedPaise: 0 }]);

    const board = await service.getRiderAssignments({ id: 'store-user', role: Role.ADMIN }, '2026-10-12');

    expect(board.unassigned).toHaveLength(2);
    // The reconciled due is a subscription-level figure: it rides on the first
    // stop only, so the board does not double the ₹899.03 the customer owes.
    expect(board.unassigned[0].outstandingDuePaise).toBe(89903);
    expect(board.unassigned[1].outstandingDuePaise).toBe(0);
    expect(board.totals.cashToCollectPaise).toBe(89903);
  });
});

