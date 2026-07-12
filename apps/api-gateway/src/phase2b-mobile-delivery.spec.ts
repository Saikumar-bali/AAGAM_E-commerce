import { OrderStatus, Role, prisma } from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { DeliveryEventService } from './orders/delivery-event.service';
import { DeliveryJobService } from './orders/delivery-job.service';
import { DeliveryWorkflowService } from './orders/delivery-workflow.service';
import { DispatchAssignmentService } from './orders/dispatch-assignment.service';
import { DispatchService } from './orders/dispatch.service';
import { TrackingService } from './tracking/tracking.service';

const PREFIX = '_test_phase2b_mobile_';

function services() {
  const events = new DeliveryEventService();
  const jobs = new DeliveryJobService(events);
  const workflow = new DeliveryWorkflowService(events);
  const assignments = new DispatchAssignmentService(jobs, workflow, events);
  const dispatch = new DispatchService(jobs, assignments, workflow);
  const gateway = {
    emitRiderLocationUpdated: jest.fn(),
    emitTrackingStopped: jest.fn(),
  };
  const orderService = {
    getTracking: jest.fn(async () => ({
      tracking: {
        etaMinutes: 7,
        distanceKm: 1.4,
        trackingState: 'LIVE',
      },
    })),
  };
  const tracking = new TrackingService(gateway as any, orderService as any);
  return { events, jobs, workflow, assignments, dispatch, gateway, orderService, tracking };
}

async function entityIds() {
  const users = await prisma.user.findMany({
    where: { email: { contains: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const stores = await prisma.store.findMany({
    where: { name: { contains: PREFIX } },
    select: { id: true },
  });
  const storeIds = stores.map((store) => store.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const jobs = await prisma.deliveryJob.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const jobIds = jobs.map((job) => job.id);
  const assignments = await prisma.dispatchAssignment.findMany({
    where: { deliveryJobId: { in: jobIds } },
    select: { id: true },
  });
  return {
    userIds,
    storeIds,
    orderIds,
    jobIds,
    assignmentIds: assignments.map((assignment) => assignment.id),
  };
}

async function cleanup() {
  const ids = await entityIds();
  const aggregateIds = [
    ...ids.userIds,
    ...ids.orderIds,
    ...ids.jobIds,
    ...ids.assignmentIds,
  ];

  await prisma.notificationDeliveryAttempt.deleteMany({
    where: { recipient: { userId: { in: ids.userIds } } },
  });
  await prisma.notificationRecipient.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { orderId: { in: ids.orderIds } },
        { deliveryJobId: { in: ids.jobIds } },
      ],
    },
  });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: aggregateIds } } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.notificationPreference.deleteMany({ where: { userId: { in: ids.userIds } } });
  await prisma.deliveryEvent.deleteMany({ where: { deliveryJobId: { in: ids.jobIds } } });
  await prisma.dispatchAssignment.deleteMany({ where: { deliveryJobId: { in: ids.jobIds } } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: ids.jobIds } } });
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.inventoryLedger.deleteMany({
    where: { OR: [{ orderId: { in: ids.orderIds } }, { storeId: { in: ids.storeIds } }] },
  });
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
  const owner = await prisma.user.create({
    data: { email: `${PREFIX}owner_${suffix}@test.com`, role: Role.STORE_OWNER, name: 'Owner' },
  });
  const admin = await prisma.user.create({
    data: { email: `${PREFIX}admin_${suffix}@test.com`, role: Role.ADMIN, name: 'Admin' },
  });
  const customer = await prisma.user.create({
    data: { email: `${PREFIX}customer_${suffix}@test.com`, role: Role.CUSTOMER, name: 'Customer' },
  });
  const riderUserA = await prisma.user.create({
    data: { email: `${PREFIX}rider_a_${suffix}@test.com`, role: Role.RIDER, name: 'Rider A' },
  });
  const riderUserB = await prisma.user.create({
    data: { email: `${PREFIX}rider_b_${suffix}@test.com`, role: Role.RIDER, name: 'Rider B' },
  });
  const riderA = await prisma.riderProfile.create({
    data: { userId: riderUserA.id, status: 'ONLINE', latitude: 17.7, longitude: 83.3 },
  });
  const riderB = await prisma.riderProfile.create({
    data: { userId: riderUserB.id, status: 'ONLINE', latitude: 17.71, longitude: 83.31 },
  });
  const category = await prisma.category.create({
    data: { name: `${PREFIX}category_${suffix}` },
  });
  const product = await prisma.product.create({
    data: {
      name: `${PREFIX}product_${suffix}`,
      price: 100,
      pricePaise: 10000,
      categoryId: category.id,
    },
  });
  const store = await prisma.store.create({
    data: {
      name: `${PREFIX}store_${suffix}`,
      address: 'Phase 2B Test Store',
      latitude: 17.7,
      longitude: 83.3,
      ownerId: owner.id,
    },
  });
  await prisma.inventory.create({
    data: { storeId: store.id, productId: product.id, quantity: 20 },
  });
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
      deliveryLat: 17.72,
      deliveryLng: 83.32,
      addressSnapshot: {
        recipientName: 'Customer',
        phoneE164: '+919999999999',
        line1: 'Test address',
        city: 'Visakhapatnam',
        pincode: '530001',
      },
      items: {
        create: [{
          productId: product.id,
          quantity: 1,
          price: 100,
          unitPricePaise: 10000,
          lineTotalPaise: 10000,
        }],
      },
    },
  });
  return {
    owner,
    admin,
    customer,
    riderUserA,
    riderUserB,
    riderA,
    riderB,
    category,
    product,
    store,
    order,
  };
}

async function acceptedDelivery() {
  const api = services();
  const data = await seed();
  const job = await api.jobs.createForPackedOrder(data.order.id, {
    id: data.admin.id,
    role: Role.ADMIN,
  });
  const offer = await api.assignments.offer(job.id, data.riderUserA.id, {
    id: data.admin.id,
    role: Role.ADMIN,
  });
  await api.assignments.accept(offer.id, data.riderUserA.id);
  return { api, data, job, offer };
}

describe('Phase 2B mobile delivery and live tracking', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('returns only offers addressed to the authenticated rider', async () => {
    const api = services();
    const data = await seed();
    const job = await api.jobs.createForPackedOrder(data.order.id, {
      id: data.admin.id,
      role: Role.ADMIN,
    });
    const offer = await api.assignments.offer(job.id, data.riderUserA.id, {
      id: data.admin.id,
      role: Role.ADMIN,
    });

    const workspaceA = await api.dispatch.getRiderWorkspace(data.riderUserA.id);
    const workspaceB = await api.dispatch.getRiderWorkspace(data.riderUserB.id);
    expect(workspaceA.pendingOffers.map((item) => item.id)).toEqual([offer.id]);
    expect(workspaceB.pendingOffers).toEqual([]);
    expect(workspaceA.activeJob).toBeNull();
    expect(workspaceB.activeJob).toBeNull();
  });

  it('rejects wrong-rider and expired acceptance attempts', async () => {
    const api = services();
    const data = await seed();
    const job = await api.jobs.createForPackedOrder(data.order.id, {
      id: data.admin.id,
      role: Role.ADMIN,
    });
    const offer = await api.assignments.offer(job.id, data.riderUserA.id, {
      id: data.admin.id,
      role: Role.ADMIN,
    });

    await expect(api.assignments.accept(offer.id, data.riderUserB.id)).rejects.toThrow('another rider');
    await prisma.dispatchAssignment.update({
      where: { id: offer.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(api.assignments.accept(offer.id, data.riderUserA.id)).rejects.toThrow('expired');
  });

  it('accepts one offer and exposes exactly one canonical active job', async () => {
    const { api, data, job } = await acceptedDelivery();
    const workspace = await api.dispatch.getRiderWorkspace(data.riderUserA.id);

    expect(workspace.pendingOffers).toEqual([]);
    expect(workspace.activeJob?.id).toBe(job.id);
    expect(workspace.activeJob?.status).toBe(DeliveryJobStatus.RIDER_ASSIGNED);
    expect(workspace.activeJob?.currentRiderId).toBe(data.riderA.id);
    expect((await prisma.riderProfile.findUnique({ where: { id: data.riderA.id } }))?.status).toBe('BUSY');
  });

  it('keeps tracking start/stop neutral and deduplicates mobile retries', async () => {
    const { api, data, job } = await acceptedDelivery();
    const before = await prisma.order.findUnique({ where: { id: data.order.id } });

    const started = await api.tracking.startTracking(data.order.id, {
      id: data.riderUserA.id,
      role: Role.RIDER,
    });
    expect(started.active).toBe(true);
    expect(started.deliveryJobId).toBe(job.id);
    expect((await prisma.order.findUnique({ where: { id: data.order.id } }))?.status).toBe(before?.status);

    const dto = {
      orderId: data.order.id,
      latitude: 17.7001,
      longitude: 83.3001,
      accuracy: 8,
      source: 'MOBILE_PARTNERS',
      clientPingId: 'phase2b-ping-0001',
      sequence: 1,
      capturedAt: new Date().toISOString(),
    };
    const first = await api.tracking.ingestRiderLocation(data.riderUserA.id, dto);
    const duplicate = await api.tracking.ingestRiderLocation(data.riderUserA.id, dto);
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(await prisma.riderLocationPing.count({ where: { orderId: data.order.id } })).toBe(1);
    expect(api.gateway.emitRiderLocationUpdated).toHaveBeenCalledTimes(1);

    const stopped = await api.tracking.stopTracking(
      data.order.id,
      { id: data.riderUserA.id, role: Role.RIDER },
      'TEST_STOP',
    );
    expect(stopped.active).toBe(false);
    expect((await prisma.deliveryJob.findUnique({ where: { id: job.id } }))?.status).toBe(DeliveryJobStatus.RIDER_ASSIGNED);
    expect((await prisma.order.findUnique({ where: { id: data.order.id } }))?.status).toBe(before?.status);
  });

  it('rejects out-of-order pings and another rider location updates', async () => {
    const { api, data } = await acceptedDelivery();
    const capturedAt = new Date().toISOString();

    await api.tracking.ingestRiderLocation(data.riderUserA.id, {
      orderId: data.order.id,
      latitude: 17.7001,
      longitude: 83.3001,
      clientPingId: 'phase2b-ping-0003',
      sequence: 3,
      capturedAt,
    });
    await expect(api.tracking.ingestRiderLocation(data.riderUserA.id, {
      orderId: data.order.id,
      latitude: 17.7001,
      longitude: 83.3001,
      clientPingId: 'phase2b-ping-0002',
      sequence: 2,
      capturedAt,
    })).rejects.toThrow('not newer');
    await expect(api.tracking.ingestRiderLocation(data.riderUserB.id, {
      orderId: data.order.id,
      latitude: 17.71,
      longitude: 83.31,
      clientPingId: 'phase2b-wrong-rider',
      sequence: 1,
      capturedAt,
    })).rejects.toThrow('your active delivery');
  });

  it('runs the explicit mobile delivery sequence and blocks terminal pings', async () => {
    const { api, data, job } = await acceptedDelivery();
    const riderActor = { id: data.riderUserA.id, role: Role.RIDER };

    await api.workflow.transition(job.id, DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE, riderActor);
    await api.workflow.transition(job.id, DeliveryJobStatus.RIDER_AT_STORE, riderActor);
    await expect(
      api.workflow.transition(job.id, DeliveryJobStatus.OUT_FOR_DELIVERY, riderActor),
    ).rejects.toThrow(/Cannot transition|not allowed/);
    await api.workflow.transition(job.id, DeliveryJobStatus.PICKUP_VERIFIED, {
      id: data.owner.id,
      role: Role.STORE_OWNER,
    });
    await api.workflow.transition(job.id, DeliveryJobStatus.OUT_FOR_DELIVERY, riderActor);
    await api.workflow.transition(job.id, DeliveryJobStatus.RIDER_AT_CUSTOMER, riderActor);
    await api.workflow.transition(job.id, DeliveryJobStatus.DELIVERED, riderActor, {
      deliveryProof: { proofType: 'RIDER_CONFIRMATION' },
    });

    const storedJob = await prisma.deliveryJob.findUnique({ where: { id: job.id } });
    const storedOrder = await prisma.order.findUnique({ where: { id: data.order.id } });
    expect(storedJob?.status).toBe(DeliveryJobStatus.DELIVERED);
    expect(storedOrder?.status).toBe(OrderStatus.DELIVERED);

    await expect(api.tracking.ingestRiderLocation(data.riderUserA.id, {
      orderId: data.order.id,
      latitude: 17.72,
      longitude: 83.32,
      clientPingId: 'phase2b-terminal-ping',
      sequence: 1,
      capturedAt: new Date().toISOString(),
    })).rejects.toThrow('tracking ended');
  });
});
