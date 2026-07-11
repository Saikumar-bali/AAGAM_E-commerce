import { Role, prisma } from '@aagam/database';
import { NotificationRoutingService } from './notifications/notification-routing.service';
import { NotificationService } from './notifications/notification.service';
import { NotificationWorkerService } from './notifications/notification-worker.service';
import { OutboxService } from './notifications/outbox.service';

const PREFIX = '_test_phase1_routing_';

async function ids() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((store) => store.id);
  const orders = await prisma.order.findMany({ where: { OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }] }, select: { id: true } });
  const orderIds = orders.map((order) => order.id);
  const jobs = await prisma.deliveryJob.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const jobIds = jobs.map((job) => job.id);
  return { userIds, storeIds, orderIds, jobIds };
}

async function cleanup() {
  const found = await ids();
  await prisma.notificationDeliveryAttempt.deleteMany({ where: { recipient: { userId: { in: found.userIds } } } });
  await prisma.notificationRecipient.deleteMany({ where: { userId: { in: found.userIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ orderId: { in: found.orderIds } }, { deliveryJobId: { in: found.jobIds } }] } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [...found.orderIds, ...found.jobIds, ...found.userIds] } } });
  await prisma.deliveryEvent.deleteMany({ where: { deliveryJobId: { in: found.jobIds } } });
  await prisma.dispatchAssignment.deleteMany({ where: { deliveryJobId: { in: found.jobIds } } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: found.jobIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: found.orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: found.orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: found.orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ orderId: { in: found.orderIds } }, { storeId: { in: found.storeIds } }] } });
  await prisma.order.deleteMany({ where: { id: { in: found.orderIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: found.storeIds } } });
  await prisma.store.deleteMany({ where: { id: { in: found.storeIds } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: found.userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: found.userIds } } });
}

async function seed() {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({ data: { email: `${PREFIX}admin_${suffix}@test.com`, role: Role.ADMIN, name: 'Admin' } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer_${suffix}@test.com`, role: Role.CUSTOMER, name: 'Customer' } });
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner_${suffix}@test.com`, role: Role.STORE_OWNER, name: 'Owner' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider_${suffix}@test.com`, role: Role.RIDER, name: 'Rider' } });
  const otherRiderUser = await prisma.user.create({ data: { email: `${PREFIX}other_rider_${suffix}@test.com`, role: Role.RIDER, name: 'Other Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, status: 'BUSY' } });
  await prisma.riderProfile.create({ data: { userId: otherRiderUser.id, status: 'ONLINE' } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}category_${suffix}` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}product_${suffix}`, price: 75, pricePaise: 7500, categoryId: category.id } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store_${suffix}`, address: 'Routing Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 10 } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      riderId: rider.id,
      status: 'RIDER_ASSIGNED',
      totalAmount: 75,
      subtotal: 75,
      grandTotal: 75,
      subtotalPaise: 7500,
      grandTotalPaise: 7500,
      items: { create: [{ productId: product.id, quantity: 1, price: 75, unitPricePaise: 7500, lineTotalPaise: 7500 }] },
    },
  });
  const job = await prisma.deliveryJob.create({ data: { orderId: order.id, status: 'RIDER_ASSIGNED', currentRiderId: rider.id } });
  const assignment = await prisma.dispatchAssignment.create({
    data: {
      deliveryJobId: job.id,
      riderProfileId: rider.id,
      status: 'ACCEPTED',
      offeredAt: new Date(),
      respondedAt: new Date(),
      createdByUserId: admin.id,
    },
  });
  return { admin, customer, owner, riderUser, otherRiderUser, rider, store, order, job, assignment };
}

function recipientIds(routed: Awaited<ReturnType<NotificationRoutingService['route']>>) {
  return new Set(routed.recipients.map((recipient) => recipient.userId));
}

async function route(
  routing: NotificationRoutingService,
  data: Awaited<ReturnType<typeof seed>>,
  eventType: any,
  payload: Record<string, unknown> = {},
) {
  return routing.route({
    id: `event_${eventType}_${Date.now()}_${Math.random()}`,
    eventType,
    aggregateType: 'DELIVERY_JOB',
    aggregateId: data.job.id,
    payload: {
      orderId: data.order.id,
      deliveryJobId: data.job.id,
      assignmentId: data.assignment.id,
      riderUserId: data.riderUser.id,
      ...payload,
    },
  });
}

describe('Phase 1 notification routing matrix and offer expiry', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('routes the delivery lifecycle to the documented roles', async () => {
    const data = await seed();
    const routing = new NotificationRoutingService();

    const cases: Array<[string, string[], string[]]> = [
      ['ASSIGNMENT_OFFERED', [data.riderUser.id], [data.customer.id, data.owner.id, data.admin.id, data.otherRiderUser.id]],
      ['ASSIGNMENT_ACCEPTED', [data.customer.id, data.owner.id, data.admin.id], [data.riderUser.id, data.otherRiderUser.id]],
      ['ASSIGNMENT_REJECTED', [data.owner.id, data.admin.id], [data.customer.id, data.riderUser.id, data.otherRiderUser.id]],
      ['ASSIGNMENT_EXPIRED', [data.owner.id, data.admin.id], [data.customer.id, data.riderUser.id, data.otherRiderUser.id]],
      ['RIDER_EN_ROUTE_TO_STORE', [data.owner.id, data.admin.id], [data.customer.id, data.riderUser.id, data.otherRiderUser.id]],
      ['RIDER_AT_STORE', [data.owner.id], [data.customer.id, data.admin.id, data.riderUser.id, data.otherRiderUser.id]],
      ['PICKUP_VERIFIED', [data.customer.id, data.admin.id], [data.owner.id, data.riderUser.id, data.otherRiderUser.id]],
      ['OUT_FOR_DELIVERY', [data.customer.id], [data.owner.id, data.admin.id, data.riderUser.id, data.otherRiderUser.id]],
      ['RIDER_AT_CUSTOMER', [data.customer.id], [data.owner.id, data.admin.id, data.riderUser.id, data.otherRiderUser.id]],
      ['DELIVERY_COMPLETED', [data.customer.id, data.owner.id, data.admin.id, data.riderUser.id], [data.otherRiderUser.id]],
      ['DELIVERY_FAILED', [data.customer.id, data.owner.id, data.admin.id], [data.riderUser.id, data.otherRiderUser.id]],
      ['DELIVERY_CANCELLED', [data.customer.id, data.owner.id, data.admin.id], [data.riderUser.id, data.otherRiderUser.id]],
    ];

    for (const [eventType, included, excluded] of cases) {
      const recipients = recipientIds(await route(routing, data, eventType));
      for (const userId of included) expect(recipients.has(userId)).toBe(true);
      for (const userId of excluded) expect(recipients.has(userId)).toBe(false);
    }
  });

  it('expires overdue offers once and creates one expiry outbox event', async () => {
    const data = await seed();
    await prisma.deliveryEvent.deleteMany({ where: { assignmentId: data.assignment.id } });
    await prisma.dispatchAssignment.update({
      where: { id: data.assignment.id },
      data: {
        status: 'OFFERED',
        respondedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.deliveryJob.update({ where: { id: data.job.id }, data: { status: 'WAITING_FOR_DISPATCH', currentRiderId: null } });

    const outbox = new OutboxService();
    const notifications = new NotificationService();
    const worker = new NotificationWorkerService(outbox, notifications);

    await worker.processBatch(50);
    await worker.processBatch(50);

    const assignment = await prisma.dispatchAssignment.findUnique({ where: { id: data.assignment.id } });
    expect(assignment?.status).toBe('EXPIRED');
    expect(await prisma.deliveryEvent.count({ where: { assignmentId: data.assignment.id, eventType: 'ASSIGNMENT_EXPIRED' } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { eventType: 'ASSIGNMENT_EXPIRED', aggregateId: data.job.id } })).toBe(1);
  });

  it('backfills one expiry event for legacy EXPIRED assignments', async () => {
    const data = await seed();
    await prisma.deliveryEvent.deleteMany({ where: { assignmentId: data.assignment.id } });
    await prisma.dispatchAssignment.update({
      where: { id: data.assignment.id },
      data: { status: 'EXPIRED', expiresAt: new Date(Date.now() - 120_000), respondedAt: new Date() },
    });

    const worker = new NotificationWorkerService(new OutboxService(), new NotificationService());
    const first = await worker.processBatch(20);
    const second = await worker.processBatch(20);

    expect(first.backfilledExpiryEvents).toBe(1);
    expect(second.backfilledExpiryEvents).toBe(0);
    expect(await prisma.deliveryEvent.count({ where: { assignmentId: data.assignment.id, eventType: 'ASSIGNMENT_EXPIRED' } })).toBe(1);
  });
});
