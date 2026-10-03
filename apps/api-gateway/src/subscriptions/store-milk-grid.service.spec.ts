import { prisma, Role } from '@aagam/database';
import { StoreMilkGridService } from './store-milk-grid.service';

jest.mock('@aagam/database', () => ({
  prisma: {
    subscriptionDelivery: { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    customerSubscription: { findUnique: jest.fn(), update: jest.fn() },
    deliveryRunStop: { update: jest.fn(), aggregate: jest.fn(), count: jest.fn() },
    deliveryRun: { update: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
  },
  Role: { STORE_OWNER: 'STORE_OWNER', ADMIN: 'ADMIN', RIDER: 'RIDER' },
  SubscriptionDeliveryStatus: {
    SCHEDULED: 'SCHEDULED',
    DELIVERED: 'DELIVERED',
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
});
