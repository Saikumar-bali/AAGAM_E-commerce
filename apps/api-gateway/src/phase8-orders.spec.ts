import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './orders/order.service';
import { RefundsService } from './payments/refunds.service';

describe('Phase 8 store fulfillment smoke', () => {
  const prefix = '_test_p8_smoke_';

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { contains: prefix } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    const stores = await prisma.store.findMany({ where: { name: { contains: prefix } }, select: { id: true } });
    const storeIds = stores.map((s) => s.id);
    const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
    const orderIds = orders.map((o) => o.id);
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.product.deleteMany({ where: { name: { contains: prefix } } });
    await prisma.category.deleteMany({ where: { name: { contains: prefix } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('store owner can move order from new to ready for pickup', async () => {
    const owner = await prisma.user.create({ data: { email: `${prefix}owner@test.com`, role: Role.STORE_OWNER } });
    const customer = await prisma.user.create({ data: { email: `${prefix}customer@test.com`, role: Role.CUSTOMER } });
    const category = await prisma.category.create({ data: { name: `${prefix}cat` } });
    const product = await prisma.product.create({ data: { name: `${prefix}rice`, price: 10, pricePaise: 1000, categoryId: category.id } });
    const store = await prisma.store.create({ data: { name: `${prefix}store`, address: 'test', latitude: 1, longitude: 1, ownerId: owner.id } });
    const order = await prisma.order.create({ data: { customerId: customer.id, storeId: store.id, status: OrderStatus.PENDING, totalAmount: 10, grandTotal: 10, items: { create: [{ productId: product.id, quantity: 1, price: 10 }] } } });
    const gateway = { emitOrderStatusUpdated: jest.fn(), emitOrderTimelineUpdated: jest.fn(), emitRiderAssigned: jest.fn() } as any;
    const service = new OrderService(gateway, new RefundsService());

    await service.updateStatus(order.id, OrderStatus.CONFIRMED, { id: owner.id, role: Role.STORE_OWNER });
    await service.updateStatus(order.id, OrderStatus.PICKING, { id: owner.id, role: Role.STORE_OWNER });
    const ready = await service.updateStatus(order.id, OrderStatus.PACKED, { id: owner.id, role: Role.STORE_OWNER });

    expect(ready.status).toBe(OrderStatus.PACKED);
    expect(ready.packedAt).not.toBeNull();
  });
});
