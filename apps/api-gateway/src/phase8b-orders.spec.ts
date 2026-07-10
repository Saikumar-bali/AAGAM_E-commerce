import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './orders/order.service';
import { StoreFulfillmentService } from './orders/store-fulfillment.service';
import { RefundsService } from './payments/refunds.service';

describe('Phase 8.2 store item issues', () => {
  const prefix = '_test_p8b_';

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

  it('blocks ready pickup until unavailable item is substituted', async () => {
    const owner = await prisma.user.create({ data: { email: `${prefix}owner@test.com`, role: Role.STORE_OWNER } });
    const customer = await prisma.user.create({ data: { email: `${prefix}customer@test.com`, role: Role.CUSTOMER } });
    const category = await prisma.category.create({ data: { name: `${prefix}cat` } });
    const original = await prisma.product.create({ data: { name: `${prefix}rice`, price: 10, pricePaise: 1000, categoryId: category.id } });
    const substitute = await prisma.product.create({ data: { name: `${prefix}atta`, price: 12, pricePaise: 1200, categoryId: category.id } });
    const store = await prisma.store.create({ data: { name: `${prefix}store`, address: 'test', latitude: 1, longitude: 1, ownerId: owner.id } });
    await prisma.inventory.createMany({ data: [
      { storeId: store.id, productId: original.id, quantity: 5 },
      { storeId: store.id, productId: substitute.id, quantity: 5 },
    ] });
    const order = await prisma.order.create({ data: { customerId: customer.id, storeId: store.id, status: OrderStatus.CONFIRMED, totalAmount: 10, subtotal: 10, grandTotal: 10, subtotalPaise: 1000, grandTotalPaise: 1000, items: { create: [{ productId: original.id, quantity: 1, price: 10, unitPricePaise: 1000, lineTotalPaise: 1000 }] } }, include: { items: true } });
    const itemId = order.items[0].id;
    const gateway = { emitOrderStatusUpdated: jest.fn(), emitOrderTimelineUpdated: jest.fn(), emitRiderAssigned: jest.fn() } as any;
    const orderService = new OrderService(gateway, new RefundsService());
    const service = new StoreFulfillmentService(orderService);

    await service.markItemUnavailable(order.id, itemId, owner.id, 'not found on shelf');
    await expect(service.readyForPickup(order.id, owner.id)).rejects.toThrow('Resolve unavailable items before marking ready for pickup');

    const options = await service.listSubstitutes(order.id, itemId, owner.id);
    expect(options.map((item: any) => item.id)).toContain(substitute.id);

    const replaced = await service.substituteItem(order.id, itemId, substitute.id, owner.id);
    expect(replaced.items[0].productId).toBe(substitute.id);
    expect(replaced.grandTotalPaise).toBe(1200);

    const ready = await service.readyForPickup(order.id, owner.id);
    expect(ready.status).toBe(OrderStatus.PACKED);
  }, 30000);
});
