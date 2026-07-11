import { OrderStatus, Role, prisma } from '@aagam/database';
import { NotificationDeliveryService } from './notifications/notification-delivery.service';
import { NotificationRoutingService } from './notifications/notification-routing.service';
import { NotificationService } from './notifications/notification.service';
import { OutboxService } from './notifications/outbox.service';
import { PushSubscriptionService } from './notifications/push-subscription.service';

const PREFIX = '_test_phase1_notifications_';

function services(pushOverrides: Record<string, any> = {}) {
  const push = {
    send: jest.fn().mockResolvedValue({ status: 'SKIPPED', reason: 'Provider disabled in tests' }),
    isInvalidSubscriptionError: jest.fn().mockReturnValue(false),
    ...pushOverrides,
  };
  const routing = new NotificationRoutingService();
  const outbox = new OutboxService();
  const delivery = new NotificationDeliveryService(push as any);
  const notifications = new NotificationService(routing, delivery, outbox, push as any);
  const subscriptions = new PushSubscriptionService();
  return { push, routing, outbox, delivery, notifications, subscriptions };
}

async function entityIds() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((store) => store.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const jobs = await prisma.deliveryJob.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const jobIds = jobs.map((job) => job.id);
  const assignments = await prisma.dispatchAssignment.findMany({ where: { deliveryJobId: { in: jobIds } }, select: { id: true } });
  const assignmentIds = assignments.map((assignment) => assignment.id);
  return { userIds, storeIds, orderIds, jobIds, assignmentIds };
}

async function cleanup() {
  const ids = await entityIds();
  const aggregateIds = [...ids.userIds, ...ids.orderIds, ...ids.jobIds, ...ids.assignmentIds];

  await prisma.notificationDeliveryAttempt.deleteMany({ where: { recipient: { userId: { in: ids.userIds } } } });
  await prisma.notificationRecipient.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ orderId: { in: ids.orderIds } }, { deliveryJobId: { in: ids.jobIds } }] } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: aggregateIds } } });
  await prisma.deliveryEvent.deleteMany({ where: { deliveryJobId: { in: ids.jobIds } } });
  await prisma.dispatchAssignment.deleteMany({ where: { deliveryJobId: { in: ids.jobIds } } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: ids.jobIds } } });
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ orderId: { in: ids.orderIds } }, { storeId: { in: ids.storeIds } }] } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: ids.orderIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: ids.storeIds } } });
  await prisma.store.deleteMany({ where: { id: { in: ids.storeIds } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
}

async function seed() {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({ data: { email: `${PREFIX}admin_${suffix}@test.com`, role: Role.ADMIN, name: 'Admin' } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer_${suffix}@test.com`, role: Role.CUSTOMER, name: 'Customer' } });
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner_${suffix}@test.com`, role: Role.STORE_OWNER, name: 'Owner' } });
  const riderUserA = await prisma.user.create({ data: { email: `${PREFIX}rider_a_${suffix}@test.com`, role: Role.RIDER, name: 'Rider A' } });
  const riderUserB = await prisma.user.create({ data: { email: `${PREFIX}rider_b_${suffix}@test.com`, role: Role.RIDER, name: 'Rider B' } });
  const riderA = await prisma.riderProfile.create({ data: { userId: riderUserA.id, status: 'ONLINE' } });
  const riderB = await prisma.riderProfile.create({ data: { userId: riderUserB.id, status: 'ONLINE' } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}category_${suffix}` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}product_${suffix}`, price: 100, pricePaise: 10000, categoryId: category.id } });
  const store = await prisma.store.create({
    data: { name: `${PREFIX}store_${suffix}`, address: 'Notification Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id },
  });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 20 } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      status: OrderStatus.PACKED,
      totalAmount: 100,
      subtotal: 100,
      grandTotal: 100,
      subtotalPaise: 10000,
      grandTotalPaise: 10000,
      packedAt: new Date(),
      items: { create: [{ productId: product.id, quantity: 1, price: 100, unitPricePaise: 10000, lineTotalPaise: 10000 }] },
    },
  });
  const job = await prisma.deliveryJob.create({ data: { orderId: order.id, status: 'WAITING_FOR_DISPATCH' } });
  const assignment = await prisma.dispatchAssignment.create({
    data: {
      deliveryJobId: job.id,
      riderProfileId: riderA.id,
      status: 'OFFERED',
      offeredAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      createdByUserId: admin.id,
    },
  });
  return { admin, customer, owner, riderUserA, riderUserB, riderA, riderB, category, product, store, order, job, assignment };
}

describe('Phase 1 web push and transactional notification foundation', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('creates ORDER_PLACED in the same order transaction and routes only to store/admin', async () => {
    const data = await seed();
    const api = services();
    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${data.order.id}:ORDER_PLACED` },
    });
    expect(event).not.toBeNull();

    const routed = await api.routing.route(event);
    const userIds = routed.recipients.map((recipient) => recipient.userId);
    expect(userIds).toContain(data.owner.id);
    expect(userIds).toContain(data.admin.id);
    expect(userIds).not.toContain(data.riderUserA.id);
    expect(userIds).not.toContain(data.riderUserB.id);
  });

  it('routes assignment offers to the selected rider only', async () => {
    const data = await seed();
    const api = services();
    const deliveryEvent = await prisma.deliveryEvent.create({
      data: {
        deliveryJobId: data.job.id,
        assignmentId: data.assignment.id,
        eventType: 'ASSIGNMENT_OFFERED',
        actorUserId: data.admin.id,
        actorRole: Role.ADMIN,
        metadata: { riderUserId: data.riderUserA.id, riderProfileId: data.riderA.id },
      },
    });
    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `delivery-event:${deliveryEvent.id}:ASSIGNMENT_OFFERED` },
    });
    expect(event).not.toBeNull();

    const notification = await api.notifications.materializeOutboxEvent(event);
    const recipients = await prisma.notificationRecipient.findMany({ where: { notificationId: notification!.id } });
    expect(recipients.map((recipient) => recipient.userId)).toEqual([data.riderUserA.id]);
  });

  it('deduplicates outbox materialization and recipient creation', async () => {
    const data = await seed();
    const api = services();
    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${data.order.id}:ORDER_PLACED` },
    });
    expect(event).not.toBeNull();

    await Promise.all([
      api.notifications.materializeOutboxEvent(event),
      api.notifications.materializeOutboxEvent(event),
    ]);

    expect(await prisma.notification.count({ where: { outboxEventId: event!.id } })).toBe(1);
    const notification = await prisma.notification.findUnique({ where: { outboxEventId: event!.id } });
    const recipients = await prisma.notificationRecipient.findMany({ where: { notificationId: notification!.id } });
    expect(new Set(recipients.map((recipient) => recipient.userId)).size).toBe(recipients.length);
  });

  it('stores read/open state outside OrderStatusHistory', async () => {
    const data = await seed();
    const api = services();
    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${data.order.id}:ORDER_PLACED` },
    });
    const notification = await api.notifications.materializeOutboxEvent(event);
    const recipient = await prisma.notificationRecipient.findFirst({
      where: { notificationId: notification!.id, userId: data.owner.id },
    });
    const before = await prisma.orderStatusHistory.count({ where: { orderId: data.order.id } });

    await api.notifications.markRead({ id: data.owner.id, role: Role.STORE_OWNER }, recipient!.id);
    await api.notifications.markOpened({ id: data.owner.id, role: Role.STORE_OWNER }, recipient!.id);

    expect(await prisma.orderStatusHistory.count({ where: { orderId: data.order.id } })).toBe(before);
    const updated = await prisma.notificationRecipient.findUnique({ where: { id: recipient!.id } });
    expect(updated?.status).toBe('READ');
    expect(updated?.readAt).toBeTruthy();
    expect(updated?.openedAt).toBeTruthy();
  });

  it('supports multiple devices per user and disables invalid subscriptions', async () => {
    const data = await seed();
    const api = services({
      send: jest.fn().mockRejectedValue(Object.assign(new Error('Token not registered'), { code: 'messaging/registration-token-not-registered' })),
      isInvalidSubscriptionError: jest.fn().mockReturnValue(true),
    });
    const first = await api.subscriptions.register(data.riderUserA.id, { provider: 'FCM_WEB', token: `token-a-${Date.now()}` });
    await api.subscriptions.register(data.riderUserA.id, { provider: 'FCM_WEB', token: `token-b-${Date.now()}` });
    expect(await prisma.pushSubscription.count({ where: { userId: data.riderUserA.id, isActive: true } })).toBe(2);

    const notification = await prisma.notification.create({
      data: { eventType: 'ASSIGNMENT_OFFERED', title: 'Offer', body: 'Delivery offer', deliveryJobId: data.job.id },
    });
    const recipient = await prisma.notificationRecipient.create({
      data: { notificationId: notification.id, userId: data.riderUserA.id, dedupeKey: `invalid-token-${Date.now()}` },
    });

    await expect(api.delivery.deliverRecipient(recipient.id)).rejects.toThrow('Token not registered');
    expect((await prisma.pushSubscription.findUnique({ where: { id: first.id } }))?.isActive).toBe(false);
    expect(await prisma.notificationDeliveryAttempt.count({ where: { recipientId: recipient.id, status: 'FAILED' } })).toBe(2);
  });

  it('creates no recipient when both push and in-app delivery are disabled', async () => {
    const data = await seed();
    const api = services();
    await api.notifications.updatePreference(data.owner.id, {
      eventType: 'ORDER_PLACED',
      inAppEnabled: false,
      pushEnabled: false,
    });
    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${data.order.id}:ORDER_PLACED` },
    });
    const notification = await api.notifications.materializeOutboxEvent(event);
    const ownerRecipient = await prisma.notificationRecipient.findFirst({
      where: { notificationId: notification!.id, userId: data.owner.id },
    });
    expect(ownerRecipient).toBeNull();
  });

  it('delivers push-only events without exposing them in the in-app inbox', async () => {
    const data = await seed();
    const send = jest.fn().mockResolvedValue({ status: 'SENT', responseId: 'push-only-response' });
    const api = services({ send });
    await api.notifications.updatePreference(data.owner.id, {
      eventType: 'ORDER_PLACED',
      inAppEnabled: false,
      pushEnabled: true,
    });
    await api.subscriptions.register(data.owner.id, {
      provider: 'FCM_WEB',
      token: `push-only-${Date.now()}`,
    });

    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${data.order.id}:ORDER_PLACED` },
    });
    const notification = await api.notifications.materializeOutboxEvent(event);
    const ownerRecipient = await prisma.notificationRecipient.findFirst({
      where: { notificationId: notification!.id, userId: data.owner.id },
    });
    expect(ownerRecipient).not.toBeNull();

    await api.delivery.deliverRecipient(ownerRecipient!.id);
    expect(send).toHaveBeenCalledTimes(1);

    const ownerInbox = await api.notifications.listInbox({ id: data.owner.id, role: Role.STORE_OWNER }, 100);
    expect(ownerInbox.items.some((item) => item.recipientId === ownerRecipient!.id)).toBe(false);

    const adminInbox = await api.notifications.listInbox({ id: data.admin.id, role: Role.ADMIN }, 100);
    const adminItem = adminInbox.items.find((item) => item.orderId === data.order.id);
    expect(adminItem?.metadata?.inAppHiddenRecipientIds).toBeUndefined();
  });

  it('keeps in-app-only events visible without attempting device push', async () => {
    const data = await seed();
    const send = jest.fn().mockResolvedValue({ status: 'SENT', responseId: 'should-not-send' });
    const api = services({ send });
    await api.notifications.updatePreference(data.owner.id, {
      eventType: 'ORDER_PLACED',
      inAppEnabled: true,
      pushEnabled: false,
    });
    await api.subscriptions.register(data.owner.id, {
      provider: 'FCM_WEB',
      token: `in-app-only-${Date.now()}`,
    });

    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${data.order.id}:ORDER_PLACED` },
    });
    const notification = await api.notifications.materializeOutboxEvent(event);
    const ownerRecipient = await prisma.notificationRecipient.findFirst({
      where: { notificationId: notification!.id, userId: data.owner.id },
    });
    expect(ownerRecipient).not.toBeNull();

    await api.delivery.deliverRecipient(ownerRecipient!.id);
    expect(send).not.toHaveBeenCalled();

    const ownerInbox = await api.notifications.listInbox({ id: data.owner.id, role: Role.STORE_OWNER }, 100);
    expect(ownerInbox.items.some((item) => item.recipientId === ownerRecipient!.id)).toBe(true);
  });
});
