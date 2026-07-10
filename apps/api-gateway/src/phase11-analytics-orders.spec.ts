import { OrderStatus, Role, prisma } from '@aagam/database';
import { AnalyticsService } from './analytics/analytics.service';

const PREFIX = '_test_phase11_analytics_';

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { OR: [{ storeId: { in: storeIds } }, { customerId: { in: userIds } }] }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const ledger = (prisma as any).inventoryLedger;
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await ledger.deleteMany({ where: { orderId: { in: orderIds } } });
  await ledger.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function seed() {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({ data: { email: `${PREFIX}admin_${unique}@test.com`, role: Role.ADMIN, name: 'Admin' } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer_${unique}@test.com`, role: Role.CUSTOMER, name: 'Customer' } });
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner_${unique}@test.com`, role: Role.STORE_OWNER, name: 'Owner' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider_${unique}@test.com`, role: Role.RIDER, name: 'Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, status: 'BUSY', latitude: 17.7, longitude: 83.3 } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}cat_${unique}` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}product_${unique}`, price: 25, pricePaise: 2500, categoryId: category.id } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store_${unique}`, address: 'Analytics Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 50 } });

  async function createOrder(status: OrderStatus, paise: number, riderId: string | null = null) {
    return prisma.order.create({
      data: {
        customerId: customer.id,
        storeId: store.id,
        riderId,
        status,
        totalAmount: paise / 100,
        subtotal: paise / 100,
        grandTotal: paise / 100,
        subtotalPaise: paise,
        grandTotalPaise: paise,
        deliveredAt: status === OrderStatus.DELIVERED ? new Date() : null,
        items: { create: [{ productId: product.id, quantity: 1, price: paise / 100, unitPricePaise: paise, lineTotalPaise: paise }] },
      },
    });
  }

  const delivered = await createOrder(OrderStatus.DELIVERED, 2500, rider.id);
  await createOrder(OrderStatus.CANCELLED, 1000, null);
  await createOrder(OrderStatus.PACKED, 1200, null);
  await createOrder(OrderStatus.OUT_FOR_DELIVERY, 1800, rider.id);

  await prisma.orderStatusHistory.create({ data: { orderId: delivered.id, fromStatus: OrderStatus.DELIVERED, toStatus: OrderStatus.DELIVERED, actorUserId: customer.id, actorRole: Role.CUSTOMER, note: 'Customer submitted delivery rating.', metadata: { event: 'CUSTOMER_RATING_SUBMITTED', orderRating: 4 } } });
  await prisma.orderStatusHistory.create({ data: { orderId: delivered.id, fromStatus: OrderStatus.DELIVERED, toStatus: OrderStatus.DELIVERED, actorUserId: customer.id, actorRole: Role.CUSTOMER, note: 'Customer opened support ticket.', metadata: { event: 'CUSTOMER_SUPPORT_TICKET_OPENED', status: 'OPEN', category: 'MISSING_ITEM', priority: 'HIGH' } } });

  return { admin, customer, store, rider };
}

function service() {
  return new AnalyticsService();
}

describe('Phase 11 admin business analytics', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('admin sees revenue, status, store, rider, support and rating metrics', async () => {
    const data = await seed();
    const analytics = await service().businessDashboard({ id: data.admin.id, role: Role.ADMIN }, 30);

    expect(analytics.summary.totalOrders).toBeGreaterThanOrEqual(4);
    expect(analytics.summary.deliveredOrders).toBeGreaterThanOrEqual(1);
    expect(analytics.summary.cancelledOrders).toBeGreaterThanOrEqual(1);
    expect(analytics.summary.activeOrders).toBeGreaterThanOrEqual(2);
    expect(analytics.summary.revenuePaise).toBeGreaterThanOrEqual(2500);
    expect(analytics.summary.averageOrderValuePaise).toBeGreaterThanOrEqual(1);
    expect(analytics.summary.supportTickets).toBeGreaterThanOrEqual(1);
    expect(analytics.summary.averageRating).toBeGreaterThanOrEqual(1);
    expect(analytics.statusCounts.DELIVERED).toBeGreaterThanOrEqual(1);
    expect(analytics.statusCounts.CANCELLED).toBeGreaterThanOrEqual(1);

    const seededStore = analytics.storePerformance.find((row: any) => row.storeId === data.store.id);
    expect(seededStore).toBeTruthy();
    expect(seededStore.revenuePaise).toBe(2500);

    const seededRider = analytics.riderPerformance.find((row: any) => row.riderProfileId === data.rider.id);
    expect(seededRider).toBeTruthy();
    expect(seededRider.delivered).toBeGreaterThanOrEqual(1);
    expect(analytics.support.byCategory.MISSING_ITEM).toBeGreaterThanOrEqual(1);
    expect(analytics.trend.length).toBeGreaterThan(0);
  });

  it('blocks non-admin users and validates date range', async () => {
    const data = await seed();
    await expect(service().businessDashboard({ id: data.customer.id, role: Role.CUSTOMER }, 30)).rejects.toThrow('Only admin can view analytics');
    await expect(service().businessDashboard({ id: data.admin.id, role: Role.ADMIN }, 0)).rejects.toThrow('days must be an integer from 1 to 180');
    await expect(service().businessDashboard({ id: data.admin.id, role: Role.ADMIN }, 181)).rejects.toThrow('days must be an integer from 1 to 180');
  });
});
