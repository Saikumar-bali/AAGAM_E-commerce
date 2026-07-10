import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './orders/order.service';
import { RefundsService } from './payments/refunds.service';
import { PostDeliveryService } from './orders/post-delivery.service';

const PREFIX = '_test_phase10_post_delivery_';

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

async function seed(status: OrderStatus = OrderStatus.DELIVERED) {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner_${status}@test.com`, role: Role.STORE_OWNER, name: 'Store Owner' } });
  const admin = await prisma.user.create({ data: { email: `${PREFIX}admin_${status}@test.com`, role: Role.ADMIN, name: 'Admin' } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer_${status}@test.com`, role: Role.CUSTOMER, name: 'Customer' } });
  const otherCustomer = await prisma.user.create({ data: { email: `${PREFIX}other_${status}@test.com`, role: Role.CUSTOMER, name: 'Other Customer' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider_${status}@test.com`, role: Role.RIDER, name: 'Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, status: status === OrderStatus.DELIVERED ? 'ONLINE' : 'BUSY', latitude: 17.705, longitude: 83.305 } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}cat_${status}` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}item_${status}`, price: 45, pricePaise: 4500, categoryId: category.id } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store_${status}`, address: 'Post Delivery Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 10 } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      riderId: rider.id,
      status,
      totalAmount: 45,
      subtotal: 45,
      grandTotal: 45,
      subtotalPaise: 4500,
      grandTotalPaise: 4500,
      deliveredAt: status === OrderStatus.DELIVERED ? new Date() : null,
      items: { create: [{ productId: product.id, quantity: 1, price: 45, unitPricePaise: 4500, lineTotalPaise: 4500 }] },
    },
  });
  return { admin, customer, otherCustomer, order };
}

function service() {
  const gateway = { emitOrderStatusUpdated: jest.fn(), emitOrderTimelineUpdated: jest.fn(), emitRiderAssigned: jest.fn() } as any;
  return new PostDeliveryService(new OrderService(gateway, new RefundsService()));
}

describe('Phase 10 post-delivery ratings and support', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('customer can rate a delivered order once', async () => {
    const data = await seed(OrderStatus.DELIVERED);
    const post = service();
    const result = await post.submitRating(data.order.id, data.customer.id, { orderRating: 5, storeRating: 4, riderRating: 5, comment: 'Fast delivery' });
    expect(result.ok).toBe(true);
    expect(result.rating.orderRating).toBe(5);

    const payload = await post.listMyPostDelivery(data.order.id, data.customer.id);
    expect((payload.rating?.metadata as any)?.event).toBe('CUSTOMER_RATING_SUBMITTED');
    await expect(post.submitRating(data.order.id, data.customer.id, { orderRating: 5 })).rejects.toThrow('Rating already submitted');
  });

  it('blocks rating before delivery and invalid rating values', async () => {
    const data = await seed(OrderStatus.OUT_FOR_DELIVERY);
    const post = service();
    await expect(post.submitRating(data.order.id, data.customer.id, { orderRating: 5 })).rejects.toThrow('Ratings are allowed only after delivery');

    const delivered = await seed(OrderStatus.DELIVERED);
    await expect(post.submitRating(delivered.order.id, delivered.customer.id, { orderRating: 6 })).rejects.toThrow('orderRating must be an integer from 1 to 5');
  });

  it('customer can open a support ticket and admin can see it', async () => {
    const data = await seed(OrderStatus.DELIVERED);
    const post = service();
    const ticket = await post.createSupportTicket(data.order.id, data.customer.id, { category: 'MISSING_ITEM', message: 'One item is missing', priority: 'HIGH', requestedRefund: true });
    expect(ticket.ok).toBe(true);
    expect(ticket.ticket.status).toBe('OPEN');
    expect(ticket.ticket.requestedRefund).toBe(true);

    const queue = await post.adminSupportQueue({ id: data.admin.id, role: Role.ADMIN });
    expect(queue.some((row: any) => row.id === ticket.ticketId && row.metadata?.category === 'MISSING_ITEM')).toBe(true);
  });

  it('keeps post-delivery data private to the order customer', async () => {
    const data = await seed(OrderStatus.DELIVERED);
    const post = service();
    await expect(post.listMyPostDelivery(data.order.id, data.otherCustomer.id)).rejects.toThrow('Not allowed');
    await expect(post.createSupportTicket(data.order.id, data.otherCustomer.id, { category: 'OTHER', message: 'Wrong customer' })).rejects.toThrow('Not allowed');
  });
});
