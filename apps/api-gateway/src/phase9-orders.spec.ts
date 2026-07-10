import { OrderStatus, Role, prisma } from '@aagam/database';
import { DeliveryEventService } from './orders/delivery-event.service';
import { DeliveryJobService } from './orders/delivery-job.service';
import { DeliveryWorkflowService } from './orders/delivery-workflow.service';
import { DispatchAssignmentService } from './orders/dispatch-assignment.service';
import { DispatchService } from './orders/dispatch.service';

const PREFIX = '_test_p9dispatch_';
const TEST_RIDER_PHONES = ['+919000009999', '+919222229999'];

function serviceFactory() {
  const events = new DeliveryEventService();
  const jobs = new DeliveryJobService(events);
  const workflow = new DeliveryWorkflowService(events);
  const assignments = new DispatchAssignmentService(jobs, workflow, events);
  return new DispatchService(jobs, assignments, workflow);
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { OR: [{ email: { contains: PREFIX } }, { phone: { in: TEST_RIDER_PHONES } }] }, select: { id: true } });
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

async function seed(status: OrderStatus = OrderStatus.PACKED) {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER, name: 'Store Owner' } });
  const admin = await prisma.user.create({ data: { email: `${PREFIX}admin@test.com`, role: Role.ADMIN, name: 'Admin' } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer@test.com`, role: Role.CUSTOMER, name: 'Customer' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider@test.com`, role: Role.RIDER, name: 'Rider', phone: '+919222229999' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, status: 'ONLINE', latitude: 17.7, longitude: 83.3 } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}cat` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}milk`, price: 50, pricePaise: 5000, categoryId: category.id } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store`, address: 'Dispatch Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 10 } });
  const order = await prisma.order.create({ data: { customerId: customer.id, storeId: store.id, status, totalAmount: 50, subtotal: 50, grandTotal: 50, subtotalPaise: 5000, grandTotalPaise: 5000, packedAt: new Date(), items: { create: [{ productId: product.id, quantity: 1, price: 50, unitPricePaise: 5000, lineTotalPaise: 5000 }] } } });
  return { owner, admin, customer, riderUser, rider, store, order };
}

describe('Phase 9 rider dispatch operations', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('admin offers packed order, rider accepts, and rider marks pickup', async () => {
    const service = serviceFactory();
    const data = await seed();

    const boardBefore = await service.getBoard({ id: data.admin.id, role: Role.ADMIN });
    expect(boardBefore.waitingForRider.map((order: any) => order.id)).toContain(data.order.id);
    expect(boardBefore.riders.some((r: any) => r.userId === data.riderUser.id && r.available)).toBe(true);

    const offer = await service.assignPackedOrder(data.order.id, data.riderUser.id, { id: data.admin.id, role: Role.ADMIN });
    expect(offer.status).toBe('OFFERED');

    const accepted = await service.acceptAssignment(data.order.id, data.riderUser.id);
    expect(accepted.status).toBe(OrderStatus.RIDER_ASSIGNED);
    expect(accepted.riderId).toBe(data.rider.id);

    const riderAfterAssign = await prisma.riderProfile.findUnique({ where: { id: data.rider.id } });
    expect(riderAfterAssign?.status).toBe('BUSY');

    const picked = await service.markPickedUp(data.order.id, data.riderUser.id);
    expect(picked.status).toBe(OrderStatus.OUT_FOR_DELIVERY);
    expect(picked.outForDeliveryAt).not.toBeNull();
  });

  it('rider can reject accepted assignment and order returns to ready for pickup', async () => {
    const service = serviceFactory();
    const data = await seed();

    await service.assignPackedOrder(data.order.id, data.riderUser.id, { id: data.admin.id, role: Role.ADMIN });
    await service.acceptAssignment(data.order.id, data.riderUser.id);
    const rejected = await service.rejectAssignment(data.order.id, data.riderUser.id, 'vehicle issue');
    expect(rejected.status).toBe('REJECTED');

    const order = await prisma.order.findUnique({ where: { id: data.order.id } });
    expect(order?.status).toBe(OrderStatus.PACKED);
    expect(order?.riderId).toBeNull();

    const riderAfterReject = await prisma.riderProfile.findUnique({ where: { id: data.rider.id } });
    expect(riderAfterReject?.status).toBe('ONLINE');
  });
});
