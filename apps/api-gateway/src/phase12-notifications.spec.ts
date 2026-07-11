import { OrderStatus, Role, prisma } from '@aagam/database';
import { NotificationService } from './notifications/notification.service';

const PREFIX = '_test_phase12_notifications_';

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { OR: [{ storeId: { in: storeIds } }, { customerId: { in: userIds } }] }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);

  await prisma.notificationDeliveryAttempt.deleteMany({ where: { recipient: { userId: { in: userIds } } } });
  await prisma.notificationRecipient.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: { in: orderIds } }, { aggregateId: { in: userIds } }] } });
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { storeId: { in: storeIds } }] } });
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
  const otherCustomer = await prisma.user.create({ data: { email: `${PREFIX}other_${unique}@test.com`, role: Role.CUSTOMER, name: 'Other Customer' } });
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner_${unique}@test.com`, role: Role.STORE_OWNER, name: 'Owner' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider_${unique}@test.com`, role: Role.RIDER, name: 'Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, status: 'BUSY', latitude: 17.7, longitude: 83.3 } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}cat_${unique}` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}product_${unique}`, price: 25, pricePaise: 2500, categoryId: category.id } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store_${unique}`, address: 'Notification Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 20 } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      riderId: rider.id,
      status: OrderStatus.OUT_FOR_DELIVERY,
      totalAmount: 25,
      subtotal: 25,
      grandTotal: 25,
      subtotalPaise: 2500,
      grandTotalPaise: 2500,
      items: { create: [{ productId: product.id, quantity: 1, price: 25, unitPricePaise: 2500, lineTotalPaise: 2500 }] },
    },
  });
  const confirmed = await prisma.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: OrderStatus.PENDING, toStatus: OrderStatus.CONFIRMED, actorUserId: owner.id, actorRole: Role.STORE_OWNER, note: 'Store confirmed your order.' } });
  await prisma.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: OrderStatus.RIDER_ASSIGNED, toStatus: OrderStatus.OUT_FOR_DELIVERY, actorUserId: riderUser.id, actorRole: Role.RIDER, note: 'Rider picked the order and is on the way.' } });
  const support = await prisma.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: OrderStatus.OUT_FOR_DELIVERY, toStatus: OrderStatus.OUT_FOR_DELIVERY, actorUserId: customer.id, actorRole: Role.CUSTOMER, note: 'Customer opened support ticket.', metadata: { event: 'CUSTOMER_SUPPORT_TICKET_OPENED', status: 'OPEN', category: 'DELIVERY_ISSUE', priority: 'HIGH' } } });
  return { admin, customer, otherCustomer, owner, riderUser, rider, order, confirmed, support };
}

function service() {
  return new NotificationService();
}

describe('Phase 12 compatibility over the dedicated notification layer', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('customer sees legacy notifications during migration and read state moves to NotificationRecipient', async () => {
    const data = await seed();
    const notifications = service();
    const beforeHistoryCount = await prisma.orderStatusHistory.count({ where: { orderId: data.order.id } });
    const inbox = await notifications.listInbox({ id: data.customer.id, role: Role.CUSTOMER }, 20);
    expect(inbox.items.length).toBeGreaterThanOrEqual(3);
    expect(inbox.items.some((item: any) => item.title === 'Order confirmed')).toBe(true);
    expect(inbox.items.some((item: any) => item.type === 'CUSTOMER_SUPPORT_TICKET_OPENED')).toBe(true);

    await notifications.markRead({ id: data.customer.id, role: Role.CUSTOMER }, data.confirmed.id);
    const afterRead = await notifications.listInbox({ id: data.customer.id, role: Role.CUSTOMER }, 20);
    const readItem = afterRead.items.find((item: any) => item.sourceHistoryId === data.confirmed.id);
    expect(readItem?.readAt).toBeTruthy();
    expect(await prisma.orderStatusHistory.count({ where: { orderId: data.order.id } })).toBe(beforeHistoryCount);
    expect(await prisma.notificationRecipient.count({ where: { userId: data.customer.id, status: 'READ' } })).toBe(1);
  });

  it('does not leak customer notifications to another customer', async () => {
    const data = await seed();
    const notifications = service();
    const inbox = await notifications.listInbox({ id: data.otherCustomer.id, role: Role.CUSTOMER }, 20);
    expect(inbox.items.some((item: any) => item.orderId === data.order.id)).toBe(false);
    await expect(notifications.markRead({ id: data.otherCustomer.id, role: Role.CUSTOMER }, data.confirmed.id)).rejects.toThrow('Notification not found');
  });

  it('store owner and rider retain role-scoped legacy fallback during migration', async () => {
    const data = await seed();
    const notifications = service();
    const storeInbox = await notifications.listInbox({ id: data.owner.id, role: Role.STORE_OWNER }, 20);
    const riderInbox = await notifications.listInbox({ id: data.riderUser.id, role: Role.RIDER }, 20);
    expect(storeInbox.items.some((item: any) => item.orderId === data.order.id)).toBe(true);
    expect(riderInbox.items.some((item: any) => item.orderId === data.order.id)).toBe(true);
  });

  it('admin sees support alerts and broadcasts are durable outbox events', async () => {
    const data = await seed();
    const notifications = service();
    const adminInbox = await notifications.listInbox({ id: data.admin.id, role: Role.ADMIN }, 20);
    expect(adminInbox.items.some((item: any) => item.sourceHistoryId === data.support.id && item.title === 'New support ticket')).toBe(true);

    const broadcast = await notifications.createBroadcastPlaceholder({ id: data.admin.id, role: Role.ADMIN }, { title: 'Service update', body: 'Test broadcast', audience: 'ALL_USERS' });
    expect(broadcast.ok).toBe(true);
    expect(broadcast.status).toBe('QUEUED');
    expect(await prisma.outboxEvent.count({ where: { id: broadcast.outboxEventId } })).toBe(1);
    await expect(notifications.createBroadcastPlaceholder({ id: data.customer.id, role: Role.CUSTOMER }, { title: 'No', body: 'No' })).rejects.toThrow('Only admin can create broadcasts');
  });
});
