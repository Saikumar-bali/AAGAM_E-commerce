import { OrderStatus, Role, prisma } from '@aagam/database';
import { DeliveryEventService } from './orders/delivery-event.service';
import { DeliveryJobService } from './orders/delivery-job.service';
import { DeliveryWorkflowService } from './orders/delivery-workflow.service';
import { DispatchAssignmentService } from './orders/dispatch-assignment.service';
import { DispatchService } from './orders/dispatch.service';
import { OrderService } from './orders/order.service';
import { RefundsService } from './payments/refunds.service';
import { TrackingService } from './tracking/tracking.service';

const PREFIX = '_test_p9delivery_';

function dispatchFactory() {
  const events = new DeliveryEventService();
  const jobs = new DeliveryJobService(events);
  const workflow = new DeliveryWorkflowService(events);
  const assignments = new DispatchAssignmentService(jobs, workflow, events);
  return new DispatchService(jobs, assignments, workflow);
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { OR: [{ storeId: { in: storeIds } }, { customerId: { in: userIds } }] }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
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

async function seed() {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER, name: 'Store Owner' } });
  const admin = await prisma.user.create({ data: { email: `${PREFIX}admin@test.com`, role: Role.ADMIN, name: 'Admin' } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer@test.com`, role: Role.CUSTOMER, name: 'Customer' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider@test.com`, role: Role.RIDER, name: 'Rider', phone: '+919111119999' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, status: 'ONLINE', latitude: 17.7, longitude: 83.3 } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}cat` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}bread`, price: 40, pricePaise: 4000, categoryId: category.id } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store`, address: 'Delivery Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 10 } });
  const order = await prisma.order.create({ data: { customerId: customer.id, storeId: store.id, status: OrderStatus.PACKED, totalAmount: 40, subtotal: 40, grandTotal: 40, subtotalPaise: 4000, grandTotalPaise: 4000, deliveryLat: 17.71, deliveryLng: 83.31, packedAt: new Date(), items: { create: [{ productId: product.id, quantity: 1, price: 40, unitPricePaise: 4000, lineTotalPaise: 4000 }] } } });
  return { admin, riderUser, rider, order };
}

function gatewayMock() {
  return { emitOrderStatusUpdated: jest.fn(), emitOrderTimelineUpdated: jest.fn(), emitRiderAssigned: jest.fn(), emitRiderLocationUpdated: jest.fn(), emitTrackingStopped: jest.fn() } as any;
}

describe('Phase 9.2 delivery proof completion', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('rider completes delivery with proof and tracking rejects post-delivery pings', async () => {
    const gateway = gatewayMock();
    const orderService = new OrderService(gateway, new RefundsService());
    const dispatch = dispatchFactory();
    const tracking = new TrackingService(gateway, orderService);
    const data = await seed();

    await dispatch.assignPackedOrder(data.order.id, data.riderUser.id, { id: data.admin.id, role: Role.ADMIN });
    await dispatch.acceptAssignment(data.order.id, data.riderUser.id);
    await dispatch.markPickedUp(data.order.id, data.riderUser.id);

    const ping = await tracking.ingestRiderLocation(data.riderUser.id, { orderId: data.order.id, latitude: 17.705, longitude: 83.305, accuracy: 8, speed: 6, heading: 90, source: 'MOBILE' });
    expect(ping.orderId).toBe(data.order.id);

    const delivered = await dispatch.markDelivered(data.order.id, data.riderUser.id, { proofType: 'CUSTOMER_OTP_PIN', riderConfirmed: true, code: '1234', note: 'Handed to customer', latitude: 17.71, longitude: 83.31 });
    expect(delivered.status).toBe(OrderStatus.DELIVERED);
    expect(delivered.deliveredAt).not.toBeNull();

    const riderAfterDelivery = await prisma.riderProfile.findUnique({ where: { id: data.rider.id } });
    expect(riderAfterDelivery?.status).toBe('ONLINE');

    const proofHistory = await prisma.orderStatusHistory.findFirst({
      where: { orderId: data.order.id, toStatus: OrderStatus.DELIVERED },
      orderBy: { createdAt: 'desc' },
    });
    expect((proofHistory?.metadata as any)?.deliveryProof?.code).toBe('1234');

    await expect(tracking.ingestRiderLocation(data.riderUser.id, { orderId: data.order.id, latitude: 17.711, longitude: 83.311, source: 'MOBILE' })).rejects.toThrow('Order is not currently live-trackable');
  });

  it('delivery proof is blocked before rider pickup', async () => {
    const dispatch = dispatchFactory();
    const data = await seed();

    await dispatch.assignPackedOrder(data.order.id, data.riderUser.id, { id: data.admin.id, role: Role.ADMIN });
    await dispatch.acceptAssignment(data.order.id, data.riderUser.id);
    await expect(dispatch.markDelivered(data.order.id, data.riderUser.id, { proofType: 'CUSTOMER_OTP_PIN', riderConfirmed: true, code: '1234' })).rejects.toThrow('Cannot transition delivery');
  });
});
