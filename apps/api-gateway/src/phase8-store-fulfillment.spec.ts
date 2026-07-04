import { OrderStatus, Role, prisma } from '@aagam/database';

const TEST_PREFIX = '_test_phase8store_';

function trackingGatewayMock() {
  return {
    emitOrderStatusUpdated: jest.fn(),
    emitOrderTimelineUpdated: jest.fn(),
    emitRiderAssigned: jest.fn(),
  };
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: TEST_PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: TEST_PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { OR: [{ storeId: { in: storeIds } }, { customerId: { in: userIds } }] }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);

  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { orderId: { in: orderIds } }] } });
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function seed() {
  const owner = await prisma.user.create({ data: { email: `${TEST_PREFIX}owner@test.com`, role: Role.STORE_OWNER, name: 'Phase 8 Owner' } });
  const otherOwner = await prisma.user.create({ data: { email: `${TEST_PREFIX}other-owner@test.com`, role: Role.STORE_OWNER, name: 'Other Owner' } });
  const customer = await prisma.user.create({ data: { email: `${TEST_PREFIX}customer@test.com`, role: Role.CUSTOMER, name: 'Phase 8 Customer' } });
  const category = await prisma.category.create({ data: { name: `${TEST_PREFIX}Groceries` } });
  const rice = await prisma.product.create({ data: { name: `${TEST_PREFIX}Rice`, price: 120, pricePaise: 12000, categoryId: category.id } });
  const milk = await prisma.product.create({ data: { name: `${TEST_PREFIX}Milk`, price: 60, pricePaise: 6000, categoryId: category.id } });
  const store = await prisma.store.create({ data: { name: `${TEST_PREFIX}Store`, address: 'Phase 8 Test', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  const otherStore = await prisma.store.create({ data: { name: `${TEST_PREFIX}OtherStore`, address: 'Other', latitude: 17.8, longitude: 83.4, ownerId: otherOwner.id } });
  await prisma.inventory.createMany({ data: [
    { storeId: store.id, productId: rice.id, quantity: 20 },
    { storeId: store.id, productId: milk.id, quantity: 20 },
    { storeId: otherStore.id, productId: rice.id, quantity: 20 },
  ] });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      status: OrderStatus.PENDING,
      totalAmount: 180,
      subtotal: 180,
      grandTotal: 180,
      subtotalPaise: 18000,
      grandTotalPaise: 18000,
      items: { create: [
        { productId: rice.id, quantity: 1, price: 120, unitPricePaise: 12000, lineTotalPaise: 12000 },
        { productId: milk.id, quantity: 1, price: 60, unitPricePaise: 6000, lineTotalPaise: 6000 },
      ] },
    },
  });
  return { owner, otherOwner, customer, store, otherStore, rice, order };
}

describe('Phase 8 Store Fulfillment', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('store owner completes order queue flow: pending to accepted to preparing to ready for pickup', async () => {
    const { OrderService } = await import('./orders/order.service');
    const { RefundsService } = await import('./payments/refunds.service');
    const service = new OrderService(trackingGatewayMock() as any, new RefundsService());
    const data = await seed();

    const queue = await service.findStoreOrders(data.owner.id);
    const queued = queue.find((order: any) => order.id === data.order.id);
    expect(queued).toBeDefined();
    expect(queued.items).toHaveLength(2);

    const accepted = await service.updateStatus(data.order.id, OrderStatus.CONFIRMED, { id: data.owner.id, role: Role.STORE_OWNER });
    expect(accepted.status).toBe(OrderStatus.CONFIRMED);
    expect(accepted.confirmedAt).not.toBeNull();

    const preparing = await service.updateStatus(data.order.id, OrderStatus.PICKING, { id: data.owner.id, role: Role.STORE_OWNER });
    expect(preparing.status).toBe(OrderStatus.PICKING);
    expect(preparing.pickingAt).not.toBeNull();

    const ready = await service.updateStatus(data.order.id, OrderStatus.PACKED, { id: data.owner.id, role: Role.STORE_OWNER });
    expect(ready.status).toBe(OrderStatus.PACKED);
    expect(ready.packedAt).not.toBeNull();

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: data.order.id }, orderBy: { createdAt: 'asc' } });
    expect(history.map((item) => item.toStatus)).toEqual([OrderStatus.CONFIRMED, OrderStatus.PICKING, OrderStatus.PACKED]);
    expect(history.every((item) => item.actorRole === Role.STORE_OWNER)).toBe(true);
  });

  it('store owner cannot fulfill another store order', async () => {
    const { OrderService } = await import('./orders/order.service');
    const { RefundsService } = await import('./payments/refunds.service');
    const service = new OrderService(trackingGatewayMock() as any, new RefundsService());
    const data = await seed();

    await expect(
      service.updateStatus(data.order.id, OrderStatus.CONFIRMED, { id: data.otherOwner.id, role: Role.STORE_OWNER }),
    ).rejects.toThrow('Not allowed to update orders for this store');
  });
});
