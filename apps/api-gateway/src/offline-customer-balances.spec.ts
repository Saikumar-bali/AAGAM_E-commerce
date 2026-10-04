import { Role } from '@aagam/database';
import { OfflineCustomerService } from './subscriptions/offline-customer.service';

jest.mock('@aagam/database', () => ({
  prisma: {
    user: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    order: { count: jest.fn().mockResolvedValue(0) },
  },
  Role: { ADMIN: 'ADMIN', STORE_OWNER: 'STORE_OWNER', RIDER: 'RIDER', CUSTOMER: 'CUSTOMER' },
  Prisma: {},
}));

const { prisma } = jest.requireMock('@aagam/database');

/**
 * The offline directory shows a per-customer "Collected / Due" pair. It must
 * reconcile the ledger against the day cells, or it renders Rs 0 collected for
 * a customer whose grid cells already hold cash (the Nookalamma divergence).
 */
describe('OfflineCustomerService money reconciliation', () => {
  const service = new OfflineCustomerService();

  const customer = {
    id: 'cust-1',
    name: 'Nookalamma',
    phone: '9999999999',
    email: 'offline.x@aagaam.local',
    isActive: true,
    addresses: [],
    orders: [],
    _count: { orders: 0, customerSubscriptions: 1 },
    customerSubscriptions: [
      {
        id: 'sub-1',
        status: 'PENDING_CASH_COLLECTION',
        amountCollectedPaise: 0,
        amountDuePaise: 51900,
        completedDeliveries: 1,
        deliveries: [{ cashCollectedPaise: 4000 }],
      },
    ],
  };

  beforeEach(() => {
    prisma.user.findMany.mockResolvedValue([customer]);
    prisma.user.count.mockResolvedValue(1);
  });

  test('list summary absorbs day-cell cash the ledger is missing', async () => {
    const result = await service.listCustomers({});

    expect(result.customers[0].summary.totalCollectedPaise).toBe(4000);
    expect(result.customers[0].summary.totalDuePaise).toBe(47900);
    // Reconciliation cells are not leaked into the payload.
    expect(result.customers[0].customerSubscriptions[0]).not.toHaveProperty('deliveries');
  });

  test('detail overall summary and per-subscription rows reconcile', async () => {
    prisma.user.findFirst.mockResolvedValue(customer);

    const detail = await service.getCustomerDetail('cust-1', { id: 'store-1', role: Role.STORE_OWNER });

    expect(detail.overallSummary.totalCollectedPaise).toBe(4000);
    expect(detail.overallSummary.totalDuePaise).toBe(47900);
    expect(detail.subscriptions[0].amountCollectedPaise).toBe(4000);
    expect(detail.subscriptions[0].amountDuePaise).toBe(47900);
  });
});
