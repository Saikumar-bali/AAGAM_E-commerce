import { Role } from '@aagam/database';
import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';

jest.mock('@aagam/database', () => ({
  prisma: {
    customerSubscription: { groupBy: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    subscriptionDelivery: { groupBy: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    cashDepositBatch: { groupBy: jest.fn() },
  },
  Role: { ADMIN: 'ADMIN', STORE_OWNER: 'STORE_OWNER', RIDER: 'RIDER', CUSTOMER: 'CUSTOMER' },
  CustomerSubscriptionStatus: {
    ACTIVE: 'ACTIVE',
    PENDING_CASH_COLLECTION: 'PENDING_CASH_COLLECTION',
    PAUSED: 'PAUSED',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'COMPLETED',
  },
  SubscriptionDeliveryStatus: {
    SCHEDULED: 'SCHEDULED',
    DELIVERED: 'DELIVERED',
    SKIPPED: 'SKIPPED',
    CANCELLED: 'CANCELLED',
  },
  CashDepositBatchStatus: {},
  DeliveryJobStatus: {},
  SubscriptionIssueStatus: {},
  SubscriptionProofMode: {},
  Prisma: {},
}));

const { prisma } = jest.requireMock('@aagam/database');

/**
 * The analytics KPIs sum the raw ledger columns. When the ledger lags the cash
 * already recorded on day cells, the same subscription reports a smaller
 * "Collected" (and larger "Due") here than in the Subscribers tab or the milk
 * grid. The KPI must reconcile through `reconcileSubscriptionBalance` too.
 */
describe('SubscriptionAdminReportingService — analytics money reconciliation', () => {
  const funding: any = {};
  const service = new SubscriptionAdminReportingService(funding);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.subscriptionDelivery.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.subscriptionDelivery.count as jest.Mock).mockResolvedValue(0);
    (prisma.subscriptionDelivery.aggregate as jest.Mock).mockResolvedValue({ _sum: { cashCollectedPaise: 0 } });
    (prisma.cashDepositBatch.groupBy as jest.Mock).mockResolvedValue([]);
  });

  it('absorbs day-cell cash the ledger is missing before totalling store KPIs', async () => {
    (prisma.customerSubscription.groupBy as jest.Mock).mockResolvedValue([
      {
        status: 'PENDING_CASH_COLLECTION',
        _count: { _all: 2 },
        _sum: { amountCollectedPaise: 2000, amountDuePaise: 100000 },
      },
    ]);
    (prisma.customerSubscription.findMany as jest.Mock).mockResolvedValue([
      // Ledger short by 4000, which its day cells already hold.
      { status: 'PENDING_CASH_COLLECTION', amountCollectedPaise: 1000, amountDuePaise: 50000, deliveries: [{ cashCollectedPaise: 5000 }] },
      // Already in step: untouched by reconciliation.
      { status: 'PENDING_CASH_COLLECTION', amountCollectedPaise: 1000, amountDuePaise: 50000, deliveries: [{ cashCollectedPaise: 1000 }] },
    ]);

    const result = await service.storeAnalytics({ id: 'owner-1', role: Role.STORE_OWNER });
    const row = result.subscriptions[0];

    // 1000 + 1000 ledger, plus the 4000 drift on the first contract.
    expect(row._sum.amountCollectedPaise).toBe(6000);
    // 50000 + 50000 due, minus the 4000 drift.
    expect(row._sum.amountDuePaise).toBe(96000);
    expect(row._count._all).toBe(2);
  });

  it('leaves analytics rows untouched when no drift exists', async () => {
    (prisma.customerSubscription.groupBy as jest.Mock).mockResolvedValue([
      { status: 'ACTIVE', _count: { _all: 1 }, _sum: { amountCollectedPaise: 5000, amountDuePaise: 0 } },
    ]);

    const result = await service.storeAnalytics({ id: 'owner-1', role: Role.STORE_OWNER });

    expect(prisma.customerSubscription.findMany).not.toHaveBeenCalled();
    expect(result.subscriptions[0]._sum.amountCollectedPaise).toBe(5000);
  });
});
