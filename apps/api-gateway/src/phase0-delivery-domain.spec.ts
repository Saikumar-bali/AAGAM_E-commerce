import { OrderStatus, Role, prisma } from '@aagam/database';
import { DeliveryJobStatus } from '@aagam/types';
import { DeliveryEventService } from './orders/delivery-event.service';
import { DeliveryJobService } from './orders/delivery-job.service';
import { DeliveryWorkflowService } from './orders/delivery-workflow.service';
import { DispatchAssignmentService } from './orders/dispatch-assignment.service';
import { DispatchService } from './orders/dispatch.service';

const PREFIX = '_test_phase0_delivery_';

function services() {
  const events = new DeliveryEventService();
  const jobs = new DeliveryJobService(events);
  const workflow = new DeliveryWorkflowService(events);
  const assignments = new DispatchAssignmentService(jobs, workflow, events);
  const dispatch = new DispatchService(jobs, assignments, workflow);
  return { events, jobs, workflow, assignments, dispatch };
}

async function cleanup() {
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
    where: { OR: [{ storeId: { in: storeIds } }, { customerId: { in: userIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);

  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ orderId: { in: orderIds } }, { storeId: { in: storeIds } }] } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function seed(orderStatus: OrderStatus = OrderStatus.PACKED) {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const owner = await prisma.user.create({
    data: { email: `${PREFIX}owner_${suffix}@test.com`, role: Role.STORE_OWNER, name: 'Store Owner' },
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
  const category = await prisma.category.create({ data: { name: `${PREFIX}category_${suffix}` } });
  const product = await prisma.product.create({
    data: { name: `${PREFIX}product_${suffix}`, price: 100, pricePaise: 10000, categoryId: category.id },
  });
  const store = await prisma.store.create({
    data: {
      name: `${PREFIX}store_${suffix}`,
      address: 'Phase 0 Test Store',
      latitude: 17.7,
      longitude: 83.3,
      ownerId: owner.id,
    },
  });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 20 } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      status: orderStatus,
      totalAmount: 100,
      subtotal: 100,
      grandTotal: 100,
      subtotalPaise: 10000,
      grandTotalPaise: 10000,
      packedAt: orderStatus === OrderStatus.PACKED ? new Date() : null,
      deliveryLat: 17.72,
      deliveryLng: 83.32,
      items: {
        create: [{ productId: product.id, quantity: 1, price: 100, unitPricePaise: 10000, lineTotalPaise: 10000 }],
      },
    },
  });

  return { owner, admin, customer, riderUserA, riderUserB, riderA, riderB, store, order, product };
}

async function createSecondPackedOrder(data: Awaited<ReturnType<typeof seed>>) {
  return prisma.order.create({
    data: {
      customerId: data.customer.id,
      storeId: data.store.id,
      status: OrderStatus.PACKED,
      totalAmount: 100,
      subtotal: 100,
      grandTotal: 100,
      subtotalPaise: 10000,
      grandTotalPaise: 10000,
      packedAt: new Date(),
      items: {
        create: [{ productId: data.product.id, quantity: 1, price: 100, unitPricePaise: 10000, lineTotalPaise: 10000 }],
      },
    },
  });
}

describe('Phase 0 delivery domain and state-machine foundation', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('runs the canonical job state machine and synchronizes legacy order fields', async () => {
    const api = services();
    const data = await seed();
    const job = await api.jobs.createForPackedOrder(data.order.id, { id: data.owner.id, role: Role.STORE_OWNER });
    expect(job.status).toBe(DeliveryJobStatus.WAITING_FOR_DISPATCH);

    const offer = await api.assignments.offer(job.id, data.riderUserA.id, { id: data.admin.id, role: Role.ADMIN });
    const accepted = await api.assignments.accept(offer.id, data.riderUserA.id);
    expect(accepted.deliveryJob).not.toBeNull();
    expect(accepted.deliveryJob!.status).toBe(DeliveryJobStatus.RIDER_ASSIGNED);

    await api.workflow.transition(job.id, DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE, { id: data.riderUserA.id, role: Role.RIDER });
    await api.workflow.transition(job.id, DeliveryJobStatus.RIDER_AT_STORE, { id: data.riderUserA.id, role: Role.RIDER });
    await api.workflow.transition(job.id, DeliveryJobStatus.PICKUP_VERIFIED, { id: data.owner.id, role: Role.STORE_OWNER });
    await api.workflow.transition(job.id, DeliveryJobStatus.OUT_FOR_DELIVERY, { id: data.riderUserA.id, role: Role.RIDER });
    await api.workflow.transition(job.id, DeliveryJobStatus.RIDER_AT_CUSTOMER, { id: data.riderUserA.id, role: Role.RIDER });
    const delivered = await api.workflow.transition(job.id, DeliveryJobStatus.DELIVERED, { id: data.riderUserA.id, role: Role.RIDER }, { deliveryProof: { code: '1234' } });

    expect(delivered.status).toBe(DeliveryJobStatus.DELIVERED);
    const order = await prisma.order.findUnique({ where: { id: data.order.id } });
    expect(order?.status).toBe(OrderStatus.DELIVERED);
    expect(order?.riderId).toBe(data.riderA.id);
    const rider = await prisma.riderProfile.findUnique({ where: { id: data.riderA.id } });
    expect(rider?.status).toBe('ONLINE');
  });

  it('enforces role permissions for store and rider transitions', async () => {
    const api = services();
    const data = await seed();
    const job = await api.jobs.createForPackedOrder(data.order.id, { id: data.admin.id, role: Role.ADMIN });

    await expect(
      api.workflow.transition(job.id, DeliveryJobStatus.RIDER_ASSIGNED, { id: data.owner.id, role: Role.STORE_OWNER }),
    ).rejects.toThrow('Store transition not allowed');

    const offer = await api.assignments.offer(job.id, data.riderUserA.id, { id: data.admin.id, role: Role.ADMIN });
    await expect(api.assignments.accept(offer.id, data.riderUserB.id)).rejects.toThrow('another rider');
    await api.assignments.accept(offer.id, data.riderUserA.id);

    await expect(
      api.workflow.transition(job.id, DeliveryJobStatus.RIDER_EN_ROUTE_TO_STORE, { id: data.riderUserB.id, role: Role.RIDER }),
    ).rejects.toThrow('your active delivery');
  });

  it('prevents duplicate offers and keeps one active delivery per rider', async () => {
    const api = services();
    const data = await seed();
    const firstJob = await api.jobs.createForPackedOrder(data.order.id, { id: data.admin.id, role: Role.ADMIN });
    await api.assignments.offer(firstJob.id, data.riderUserA.id, { id: data.admin.id, role: Role.ADMIN });
    await expect(
      api.assignments.offer(firstJob.id, data.riderUserB.id, { id: data.admin.id, role: Role.ADMIN }),
    ).rejects.toThrow('active assignment offer');

    const current = await prisma.dispatchAssignment.findFirst({ where: { deliveryJobId: firstJob.id } });
    await api.assignments.accept(current!.id, data.riderUserA.id);

    const secondOrder = await createSecondPackedOrder(data);
    const secondJob = await api.jobs.createForPackedOrder(secondOrder.id, { id: data.admin.id, role: Role.ADMIN });
    await expect(
      api.assignments.offer(secondJob.id, data.riderUserA.id, { id: data.admin.id, role: Role.ADMIN }),
    ).rejects.toThrow(/online and available|active delivery/);
  });

  it('allows only one winner during concurrent two-rider acceptance attempts', async () => {
    const api = services();
    const data = await seed();
    const job = await api.jobs.createForPackedOrder(data.order.id, { id: data.admin.id, role: Role.ADMIN });
    const offer = await api.assignments.offer(job.id, data.riderUserA.id, { id: data.admin.id, role: Role.ADMIN });

    const results = await Promise.allSettled([
      api.assignments.accept(offer.id, data.riderUserA.id),
      api.assignments.accept(offer.id, data.riderUserB.id),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const storedJob = await prisma.deliveryJob.findUnique({ where: { id: job.id } });
    expect(storedJob?.currentRiderId).toBe(data.riderA.id);
  });

  it('rejects invalid state transitions', async () => {
    const api = services();
    const data = await seed();
    const job = await api.jobs.createForPackedOrder(data.order.id, { id: data.admin.id, role: Role.ADMIN });

    await expect(
      api.workflow.transition(job.id, DeliveryJobStatus.OUT_FOR_DELIVERY, { id: data.admin.id, role: Role.ADMIN }),
    ).rejects.toThrow('Cannot transition delivery');
  });

  it('does not expose confirmed or picking orders to the rider queue', async () => {
    const api = services();
    const confirmed = await seed(OrderStatus.CONFIRMED);
    const picking = await prisma.order.create({
      data: {
        customerId: confirmed.customer.id,
        storeId: confirmed.store.id,
        status: OrderStatus.PICKING,
        totalAmount: 100,
        subtotal: 100,
        grandTotal: 100,
        subtotalPaise: 10000,
        grandTotalPaise: 10000,
        items: { create: [{ productId: confirmed.product.id, quantity: 1, price: 100, unitPricePaise: 10000, lineTotalPaise: 10000 }] },
      },
    });
    expect(picking.status).toBe(OrderStatus.PICKING);

    const workspace = await api.dispatch.getRiderWorkspace(confirmed.riderUserA.id);
    expect(workspace.pendingOffers).toEqual([]);
    expect(workspace.activeJob).toBeNull();
  });
});