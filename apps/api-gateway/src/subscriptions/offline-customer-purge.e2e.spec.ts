import { prisma, Role } from '@aagam/database';
import { OfflineCustomerService } from './offline-customer.service';

/**
 * Regression: purging a second offline customer that has historical orders
 * used to 500. The anonymize branch writes a single fixed `purged@offline.local`
 * email, which the second purge collided with on the unique email constraint.
 * Purged emails must be unique while still matching the offline identity
 * predicate (startsWith 'offline.'), otherwise the row becomes invisible to the
 * store's offline-customer views.
 */
const PREFIX = '_test_purge_';

async function cleanup() {
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ storeId: { in: storeIds } }, { customer: { email: { contains: PREFIX } } }] },
    select: { id: true, customerId: true },
  });
  const orderIds = orders.map((o) => o.id);
  const customersFromOrders = orders.map((o) => o.customerId);
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { contains: PREFIX } }, { id: { in: customersFromOrders } }] },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  await prisma.deliveryJob.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe('OfflineCustomerService.permanentDeleteCustomer', () => {
  const service = new OfflineCustomerService();

  beforeAll(cleanup);
  afterAll(cleanup);

  test('purges multiple order-bearing offline customers without an email collision', async () => {
    const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER } });
    const store = await prisma.store.create({ data: { name: `${PREFIX}store`, address: 'x', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });

    const makeCustomer = async (n: number) => {
      const customer = await prisma.user.create({
        data: {
          email: `${PREFIX}c${n}@aagaam.local`,
          phone: `90000000${n}${n}`,
          name: `Purge QA ${n}`,
          role: Role.CUSTOMER,
          acquisitionSource: 'OFFLINE_STORE',
          offlineStoreId: store.id,
        },
      });
      await prisma.order.create({
        data: { storeId: store.id, customerId: customer.id, status: 'DELIVERED', totalAmount: 100, orderSource: 'SUBSCRIPTION' },
      });
      return customer;
    };

    const first = await makeCustomer(1);
    const second = await makeCustomer(2);

    const r1 = await service.permanentDeleteCustomer(first.id, { id: owner.id, role: Role.STORE_OWNER });
    const r2 = await service.permanentDeleteCustomer(second.id, { id: owner.id, role: Role.STORE_OWNER });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    const rows = await prisma.user.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(rows).toHaveLength(2);
    const emails = rows.map((r) => r.email);
    expect(new Set(emails).size).toBe(2);
    for (const row of rows) {
      expect(row.isActive).toBe(false);
      expect(row.phone).toBeNull();
      expect(row.email?.startsWith('offline.')).toBe(true);
    }
  });
});
