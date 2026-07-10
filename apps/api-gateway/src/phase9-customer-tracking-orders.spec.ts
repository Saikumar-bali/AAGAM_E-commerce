import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './orders/order.service';
import { RefundsService } from './payments/refunds.service';

const PREFIX = '_test_p9customer_tracking_';

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

async function seed(status: OrderStatus, pingAgeMinutes = 0) {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner_${status}_${pingAgeMinutes}@test.com`, role: Role.STORE_OWNER, name: 'Store Owner' } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer_${status}_${pingAgeMinutes}@test.com`, role: Role.CUSTOMER, name: 'Customer' } });
  const otherCustomer = await prisma.user.create({ data: { email: `${PREFIX}other_${status}_${pingAgeMinutes}@test.com`, role: Role.CUSTOMER, name: 'Other Customer' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider_${status}_${pingAgeMinutes}@test.com`, role: Role.RIDER, name: 'Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, status: status === OrderStatus.DELIVERED ? 'ONLINE' : 'BUSY', latitude: 17.705, longitude: 83.305 } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}cat_${status}_${pingAgeMinutes}` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}item_${status}_${pingAgeMinutes}`, price: 30, pricePaise: 3000, categoryId: category.id } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store_${status}_${pingAgeMinutes}`, address: 'Customer Tracking Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 10 } });
  const now = new Date();
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      riderId: rider.id,
      status,
      totalAmount: 30,
      subtotal: 30,
      grandTotal: 30,
      subtotalPaise: 3000,
      grandTotalPaise: 3000,
      deliveryLat: 17.71,
      deliveryLng: 83.31,
      riderAssignedAt: now,
      outForDeliveryAt: status === OrderStatus.OUT_FOR_DELIVERY || status === OrderStatus.DELIVERED ? now : null,
      deliveredAt: status === OrderStatus.DELIVERED ? now : null,
      items: { create: [{ productId: product.id, quantity: 1, price: 30, unitPricePaise: 3000, lineTotalPaise: 3000 }] },
    },
  });
  await prisma.riderLocationPing.create({
    data: {
      orderId: order.id,
      riderProfileId: rider.id,
      latitude: 17.705,
      longitude: 83.305,
      source: 'MOBILE',
      createdAt: new Date(Date.now() - pingAgeMinutes * 60 * 1000),
    },
  });
  if (status === OrderStatus.DELIVERED) {
    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: OrderStatus.DELIVERED,
        toStatus: OrderStatus.DELIVERED,
        actorUserId: riderUser.id,
        actorRole: Role.RIDER,
        note: 'Rider submitted delivery proof.',
        metadata: { event: 'DELIVERY_PROOF_RECORDED', proofType: 'RIDER_CONFIRMATION', code: '1234', note: 'Handed to customer' },
      },
    });
  }
  return { customer, otherCustomer, order };
}

function orderService() {
  const gateway = { emitOrderStatusUpdated: jest.fn(), emitOrderTimelineUpdated: jest.fn(), emitRiderAssigned: jest.fn() } as any;
  return new OrderService(gateway, new RefundsService());
}

describe('Phase 9.3 customer tracking polish', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('customer sees delivered tracking state with proof metadata and trip summary', async () => {
    const data = await seed(OrderStatus.DELIVERED, 1);
    const service = orderService();
    const tracking = await service.getTracking(data.order.id, { id: data.customer.id, role: Role.CUSTOMER });

    expect(tracking.order.status).toBe(OrderStatus.DELIVERED);
    expect(tracking.tracking.trackingState).toBe('DELIVERED');
    expect(tracking.tracking.isLive).toBe(false);
    expect(tracking.tracking.tripSummary.points).toBe(1);
    expect(tracking.timeline.some((entry: any) => entry.metadata?.event === 'DELIVERY_PROOF_RECORDED')).toBe(true);
  });

  it('customer sees stale tracking state when rider location is old', async () => {
    const data = await seed(OrderStatus.OUT_FOR_DELIVERY, 10);
    const service = orderService();
    const tracking = await service.getTracking(data.order.id, { id: data.customer.id, role: Role.CUSTOMER });

    expect(tracking.order.status).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(tracking.tracking.trackingState).toBe('STALE');
    expect(tracking.tracking.etaStale).toBe(true);
    expect(tracking.tracking.lastPingAt).toBeTruthy();
  });

  it('customer cannot view another customer tracking payload', async () => {
    const data = await seed(OrderStatus.OUT_FOR_DELIVERY, 0);
    const service = orderService();
    await expect(service.getTracking(data.order.id, { id: data.otherCustomer.id, role: Role.CUSTOMER })).rejects.toThrow('Not allowed');
  });
});
