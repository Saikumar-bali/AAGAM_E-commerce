import { prisma } from '@aagam/database';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';

jest.mock('@aagam/database', () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: 'Serializable' },
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({ strings, values }),
  },
  Role: { STORE_OWNER: 'STORE_OWNER', ADMIN: 'ADMIN' },
  CustomerSubscriptionStatus: {
    ACTIVE: 'ACTIVE',
    PENDING_CASH_COLLECTION: 'PENDING_CASH_COLLECTION',
    PAYMENT_DUE: 'PAYMENT_DUE',
    GRACE_PERIOD: 'GRACE_PERIOD',
    COMPLETED: 'COMPLETED',
  },
  SubscriptionDeliveryStatus: {
    SCHEDULED: 'SCHEDULED',
    DELIVERED: 'DELIVERED',
    SKIPPED: 'SKIPPED',
  },
  DeliveryRunStopStatus: { DELIVERED: 'DELIVERED' },
  PaymentMethod: { COD: 'COD', CASH: 'CASH' },
  PaymentStatus: { CAPTURED: 'CAPTURED', PENDING_COD: 'PENDING_COD' },
  SubscriptionFundingCycle: { FULL_PLAN: 'FULL_PLAN', WEEKLY: 'WEEKLY' },
  CodSettlementStatus: { PENDING: 'PENDING', HELD_BY_RIDER: 'HELD_BY_RIDER' },
  prisma: {
    $transaction: jest.fn(),
    subscriptionDelivery: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    customerSubscription: { findUnique: jest.fn(), update: jest.fn() },
    subscriptionAuditEntry: { findUnique: jest.fn(), create: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
  },
}));

describe('SubscriptionCashFundingService — delivery-first completion', () => {
  const service = new SubscriptionCashFundingService({} as any);
  const tx: any = (prisma as any);
  const actor = { id: 'store-user', role: 'STORE_OWNER' as any };

  const subscription = (overrides: Record<string, any> = {}) => ({
    id: 'sub-1',
    status: 'PENDING_CASH_COLLECTION',
    completedDeliveries: 0,
    remainingFundedDeliveries: 0,
    amountDuePaise: 59900,
    amountCollectedPaise: 0,
    planVersion: { totalDeliveries: 30 },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(1);
    tx.subscriptionAuditEntry.findUnique.mockResolvedValue(null);
    tx.subscriptionAuditEntry.create.mockResolvedValue({});
    tx.subscriptionDelivery.update.mockResolvedValue({});
    tx.subscriptionDelivery.findFirst.mockResolvedValue(null);
    tx.subscriptionDelivery.findMany.mockResolvedValue([]);
    tx.customerSubscription.update.mockResolvedValue({});
  });

  it('activates an unfunded plan on completion and preserves the pending balance', async () => {
    tx.subscriptionDelivery.findUnique
      .mockResolvedValueOnce({
        id: 'del-1',
        status: 'SCHEDULED',
        serviceDate: new Date('2026-09-12T00:00:00.000Z'),
        subscription: subscription(),
      })
      .mockResolvedValueOnce({ id: 'del-1', status: 'DELIVERED' });

    await service.consumeDeliveredWithinTransaction(tx, 'del-1', actor, 'key-1');

    expect(tx.customerSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          status: 'ACTIVE',
          completedDeliveries: 1,
          remainingFundedDeliveries: 0,
          amountDuePaise: 59900,
        }),
      }),
    );
  });

  it('marks the plan COMPLETED and clears the balance on the final delivery', async () => {
    tx.subscriptionDelivery.findUnique
      .mockResolvedValueOnce({
        id: 'del-last',
        status: 'SCHEDULED',
        serviceDate: new Date('2026-09-12T00:00:00.000Z'),
        subscription: subscription({ completedDeliveries: 29, remainingFundedDeliveries: 0, amountDuePaise: 1000 }),
      })
      .mockResolvedValueOnce({ id: 'del-last', status: 'DELIVERED' });

    await service.consumeDeliveredWithinTransaction(tx, 'del-last', actor, 'key-last');

    expect(tx.customerSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', completedDeliveries: 30, amountDuePaise: 0 }),
      }),
    );
  });

  it('is idempotent: an already-DELIVERED delivery is not counted twice', async () => {
    tx.subscriptionDelivery.findUnique.mockResolvedValueOnce({
      id: 'del-done',
      status: 'DELIVERED',
      subscription: subscription(),
    });

    await service.consumeDeliveredWithinTransaction(tx, 'del-done', actor, 'key-done');

    expect(tx.customerSubscription.update).not.toHaveBeenCalled();
    expect(tx.subscriptionAuditEntry.create).not.toHaveBeenCalled();
  });

  describe('allocateAfterCodCollectionWithinTransaction — under-collection carry-forward (BUG-010)', () => {
    // The allocation is triggered by a fully-collected day; the day-cell
    // shortfall that must survive comes from an *earlier* delivered day whose
    // cash was recorded short on its own cell.
    const allocationDelivery = (overrides: Record<string, any> = {}) => ({
      id: 'del-trigger',
      subscriptionId: 'sub-1',
      sequenceNumber: 4,
      serviceDate: new Date('2026-10-08T00:00:00.000Z'),
      cashDuePaise: 10500,
      cashCollectedPaise: 0,
      status: 'DELIVERED',
      subscription: subscription({
        id: 'sub-1',
        status: 'ACTIVE',
        completedDeliveries: 3,
        amountDuePaise: 4500,
        amountCollectedPaise: 6000,
        fundingCycle: 'WEEKLY',
        planVersion: { totalDeliveries: 7 },
      }),
      deliveryJob: {
        codLedger: {
          id: 'ledger-1',
          status: 'HELD_BY_RIDER',
          collectedAmountPaise: 10500,
          expectedAmountPaise: 10500,
          depositedAmountPaise: 0,
          riderHoldingBalancePaise: 10500,
        },
        order: {
          payment: { method: 'COD', status: 'CAPTURED' },
        },
      },
      ...overrides,
    });

    beforeEach(() => {
      tx.subscriptionFundingAllocation = { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'alloc-1' }) };
      (tx as any).subscriptionAuditEntry.findUnique.mockResolvedValue(null);
    });

    it('carries an earlier day-cell shortfall into the allocation instead of zeroing the due', async () => {
      tx.subscriptionDelivery.findUnique.mockResolvedValueOnce(allocationDelivery());
      // An earlier delivered day collected Rs 60 of Rs 105 on its cell: Rs 45 is
      // still owed and must survive the allocation.
      tx.subscriptionDelivery.findMany.mockResolvedValueOnce([
        { cashDuePaise: 10500, cashCollectedPaise: 6000 },
      ]);

      await service.allocateAfterCodCollectionWithinTransaction(tx, 'job-1', actor, 'key-alloc');

      expect(tx.customerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amountDuePaise: 4500 }),
        }),
      );
    });

    it('keeps a fully-paid plan at zero due (no phantom residual)', async () => {
      tx.subscriptionDelivery.findUnique.mockResolvedValueOnce(allocationDelivery());
      // No cell has recorded cash at all (COD records cash on the ledger).
      tx.subscriptionDelivery.findMany.mockResolvedValueOnce([]);

      await service.allocateAfterCodCollectionWithinTransaction(tx, 'job-1', actor, 'key-alloc');

      expect(tx.customerSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amountDuePaise: 0 }),
        }),
      );
    });
  });
});
