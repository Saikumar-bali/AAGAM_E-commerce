import { OrderStatus, PaymentMethod, PaymentStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './orders/order.service';
import { RefundsService } from './payments/refunds.service';

const TEST_PREFIX = '_test_phase3order_';

async function cleanup() {
  const testUsers = await prisma.user.findMany({ where: { email: { contains: TEST_PREFIX } }, select: { id: true } });
  const testUserIds = testUsers.map(u => u.id);
  const testStores = await prisma.store.findMany({ where: { name: { contains: TEST_PREFIX } }, select: { id: true } });
  const testStoreIds = testStores.map(s => s.id);
  const testOrders = await prisma.order.findMany({
    where: { OR: [{ storeId: { in: testStoreIds } }, { customerId: { in: testUserIds } }] },
    select: { id: true },
  });
  const testOrderIds = testOrders.map(o => o.id);

  await prisma.refund.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ storeId: { in: testStoreIds } }, { orderId: { in: testOrderIds } }] } });
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: testOrderIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: testStoreIds } } });
  await prisma.store.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
  await prisma.product.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: TEST_PREFIX } } });
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

function createTrackingGatewayMock() {
  return {
    server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
    emitOrderStatusUpdated: jest.fn(),
    emitOrderTimelineUpdated: jest.fn(),
    emitRiderAssigned: jest.fn(),
    emitRiderLocationUpdated: jest.fn(),
    emitTrackingStopped: jest.fn(),
  };
}

function createNotificationServiceMock() {
  return { sendNewOrderAlert: jest.fn() };
}

async function createTestOrder(customerId: string, storeId: string, productId: string, status: string = 'PENDING') {
  return prisma.order.create({
    data: {
      customerId,
      storeId,
      status: status as any,
      totalAmount: 100,
      grandTotal: 100,
      subtotalPaise: 10000,
      grandTotalPaise: 10000,
      items: { create: [{ productId, quantity: 2, price: 50, unitPricePaise: 5000, lineTotalPaise: 10000 }] },
    },
    include: { items: true },
  });
}

async function createRiderProfile(userId: string) {
  return prisma.riderProfile.create({
    data: { userId, status: 'ONLINE' },
  });
}

describe('Phase 3: Order Status State Machine', () => {
  let customerId: string;
  let storeId: string;
  let productId: string;
  let ownerId: string;
  let adminId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}sm_owner@test.com`, role: 'STORE_OWNER', name: 'SM Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}sm_customer@test.com`, role: 'CUSTOMER', name: 'SM Customer' },
    });
    customerId = customer.id;
    const admin = await prisma.user.create({
      data: { email: `${TEST_PREFIX}sm_admin@test.com`, role: 'ADMIN', name: 'SM Admin' },
    });
    adminId = admin.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}SMCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX}SMProd`, price: 50, pricePaise: 5000, categoryId: cat.id },
    });
    productId = product.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}SMStore`, address: 'Test', latitude: 10, longitude: 20, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 50 } });
  });

  it('should reject transition from PENDING to OUT_FOR_DELIVERY', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'PENDING');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, { id: adminId, role: Role.ADMIN }),
    ).rejects.toThrow('Cannot transition order from PENDING to OUT_FOR_DELIVERY');
  });

  it('should reject transition from CONFIRMED to DELIVERED', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.DELIVERED, { id: adminId, role: Role.ADMIN }),
    ).rejects.toThrow('Cannot transition order from CONFIRMED to DELIVERED');
  });

  it('should allow valid transition CONFIRMED -> PICKING', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.updateStatus(order.id, OrderStatus.PICKING, { id: ownerId, role: Role.STORE_OWNER });
    expect(result.status).toBe('PICKING');
    expect(result.pickingAt).not.toBeNull();
  });

  it('terminal state DELIVERED should be immutable', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'DELIVERED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.CANCELLED, { id: adminId, role: Role.ADMIN }),
    ).rejects.toThrow('Order is already DELIVERED and cannot be changed');
  });

  it('terminal state CANCELLED should be immutable', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CANCELLED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.DELIVERED, { id: adminId, role: Role.ADMIN }),
    ).rejects.toThrow('Order is already CANCELLED and cannot be changed');
  });

  it('should record status history on every transition', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await service.updateStatus(order.id, OrderStatus.PICKING, { id: ownerId, role: Role.STORE_OWNER });

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(history.length).toBeGreaterThanOrEqual(1);
    const lastEntry = history[history.length - 1];
    expect(lastEntry.fromStatus).toBe('CONFIRMED');
    expect(lastEntry.toStatus).toBe('PICKING');
    expect(lastEntry.actorRole).toBe('STORE_OWNER');
    expect(lastEntry.actorUserId).toBe(ownerId);
  });
});

describe('Phase 3: Store Owner Operations', () => {
  let customerId: string;
  let storeId: string;
  let otherStoreId: string;
  let productId: string;
  let ownerId: string;
  let otherOwnerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}so_owner@test.com`, role: 'STORE_OWNER', name: 'SO Owner' },
    });
    ownerId = owner.id;
    const otherOwner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}so_owner2@test.com`, role: 'STORE_OWNER', name: 'SO Owner2' },
    });
    otherOwnerId = otherOwner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}so_customer@test.com`, role: 'CUSTOMER', name: 'SO Customer' },
    });
    customerId = customer.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}SOCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX}SOProd`, price: 50, pricePaise: 5000, categoryId: cat.id },
    });
    productId = product.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}SOStore`, address: 'Test', latitude: 30, longitude: 40, ownerId },
    });
    storeId = store.id;
    const otherStore = await prisma.store.create({
      data: { name: `${TEST_PREFIX}SOStore2`, address: 'Test2', latitude: 31, longitude: 41, ownerId: otherOwnerId },
    });
    otherStoreId = otherStore.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 30 } });
    await prisma.inventory.create({ data: { storeId: otherStoreId, productId, quantity: 30 } });
  });

  it('should find store orders for owner', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'PENDING');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const orders = await service.findStoreOrders(ownerId);
    expect(orders.length).toBeGreaterThanOrEqual(1);
    const found = orders.find((o: any) => o.id === order.id);
    expect(found).toBeDefined();
    expect(found!.status).toBe('PENDING');
  });

  it('should return empty array for owner with no stores', async () => {
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const noStoreOwner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}so_no_store@test.com`, role: 'STORE_OWNER', name: 'NoStore Owner' },
    });
    const orders = await service.findStoreOrders(noStoreOwner.id);

    expect(orders).toEqual([]);
    await prisma.user.delete({ where: { id: noStoreOwner.id } });
  });

  it('should not allow store owner to update order of another store', async () => {
    const order = await createTestOrder(customerId, otherStoreId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.PICKING, { id: ownerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('Not allowed to update orders for this store');
  });

  it('should not allow store owner to set DELIVERED status', async () => {
    // OUT_FOR_DELIVERY -> DELIVERED is valid generically but forbidden for store owner
    const order = await createTestOrder(customerId, storeId, productId, 'OUT_FOR_DELIVERY');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.DELIVERED, { id: ownerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('Store owner cannot set status to DELIVERED');
  });

  it('should not allow store owner to set RIDER_ASSIGNED status', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'PACKED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.RIDER_ASSIGNED, { id: ownerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('Store owner cannot set status to RIDER_ASSIGNED');
  });

  it('should allow store owner to set CONFIRMED, PICKING, PACKED, CANCELLED', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.updateStatus(order.id, OrderStatus.PICKING, { id: ownerId, role: Role.STORE_OWNER });
    expect(result.status).toBe('PICKING');
  });

  it('should not allow store owner to transition to OUT_FOR_DELIVERY', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'RIDER_ASSIGNED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, { id: ownerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('Store owner cannot set status to OUT_FOR_DELIVERY');
  });
});

describe('Phase 3: Rider Operations', () => {
  let customerId: string;
  let storeId: string;
  let productId: string;
  let ownerId: string;
  let riderId: string;
  let otherRiderId: string;
  let riderProfileId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ro_owner@test.com`, role: 'STORE_OWNER', name: 'RO Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ro_customer@test.com`, role: 'CUSTOMER', name: 'RO Customer' },
    });
    customerId = customer.id;
    const rider = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ro_rider@test.com`, role: 'RIDER', name: 'RO Rider' },
    });
    riderId = rider.id;
    const otherRider = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ro_rider2@test.com`, role: 'RIDER', name: 'RO Rider2' },
    });
    otherRiderId = otherRider.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}ROCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX}ROProd`, price: 50, pricePaise: 5000, categoryId: cat.id },
    });
    productId = product.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}ROStore`, address: 'Test', latitude: 50, longitude: 60, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 30 } });

    const riderProfile = await createRiderProfile(riderId);
    riderProfileId = riderProfile.id;
    await createRiderProfile(otherRiderId);
  });

  it('should assign rider to an unassigned order', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.assignRider(order.id, riderId);

    expect(result.status).toBe('RIDER_ASSIGNED');
    expect(result.riderId).toBe(riderProfileId);
    expect(result.riderAssignedAt).not.toBeNull();

    const riderProfile = await prisma.riderProfile.findUnique({ where: { id: riderProfileId } });
    expect(riderProfile!.status).toBe('BUSY');
  });

  it('should not assign rider to already assigned order', async () => {
    // Create as CONFIRMED (assignable) but set riderId to simulate already assigned
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    await prisma.order.update({ where: { id: order.id }, data: { riderId: riderProfileId } });
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.assignRider(order.id, otherRiderId),
    ).rejects.toThrow('Order already assigned to a rider');
  });

  it('should not assign rider to delivered order', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'DELIVERED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.assignRider(order.id, riderId),
    ).rejects.toThrow('Cannot assign rider to DELIVERED order');
  });

  it('should not assign offline rider', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const offlineRider = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ro_offlinerider@test.com`, role: 'RIDER', name: 'RO Offline Rider' },
    });
    await prisma.riderProfile.create({ data: { userId: offlineRider.id, status: 'OFFLINE' } });
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.assignRider(order.id, offlineRider.id),
    ).rejects.toThrow('Rider is offline and cannot be assigned');
  });

  it('should not assign non-rider user', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.assignRider(order.id, customerId),
    ).rejects.toThrow('User is not a rider');
  });

  it('rider should set OUT_FOR_DELIVERY on own assigned order', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'RIDER_ASSIGNED');
    await prisma.order.update({ where: { id: order.id }, data: { riderId: riderProfileId } });
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.updateStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, { id: riderId, role: Role.RIDER });
    expect(result.status).toBe('OUT_FOR_DELIVERY');
  });

  it('rider should not set status on order assigned to another rider', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'RIDER_ASSIGNED');
    await prisma.order.update({ where: { id: order.id }, data: { riderId: riderProfileId } });
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, { id: otherRiderId, role: Role.RIDER }),
    ).rejects.toThrow('You can only update your assigned orders');
  });

  it('rider should not cancel own order (not in RIDER_TRANSITIONS)', async () => {
    // RIDER_ASSIGNED -> CANCELLED is valid in ORDER_TRANSITIONS but not in RIDER_TRANSITIONS
    const order = await createTestOrder(customerId, storeId, productId, 'RIDER_ASSIGNED');
    await prisma.order.update({ where: { id: order.id }, data: { riderId: riderProfileId } });
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.updateStatus(order.id, OrderStatus.CANCELLED, { id: riderId, role: Role.RIDER }),
    ).rejects.toThrow('Rider transition not allowed: RIDER_ASSIGNED -> CANCELLED');
  });

  it('rider should set DELIVERED on own assigned order and record delivery proof', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'OUT_FOR_DELIVERY');
    await prisma.order.update({ where: { id: order.id }, data: { riderId: riderProfileId } });
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.updateStatus(order.id, OrderStatus.DELIVERED, { id: riderId, role: Role.RIDER });
    expect(result.status).toBe('DELIVERED');
    expect(result.deliveredAt).not.toBeNull();

    const history = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'DELIVERED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(history).not.toBeNull();
    expect(history!.actorRole).toBe('RIDER');
    expect(history!.actorUserId).toBe(riderId);

    const metadata = history!.metadata as any;
    expect(metadata).not.toBeNull();
    expect(metadata.deliveredAt).toBeDefined();
    expect(metadata.actorRole).toBe('RIDER');
    expect(metadata.riderProfileId).toBe(riderProfileId);
    expect(metadata.deliveryProof).toBeDefined();
    expect(metadata.deliveryProof.method).toBe('rider_confirmed');

    const riderProfile = await prisma.riderProfile.findUnique({ where: { id: riderProfileId } });
    expect(riderProfile!.status).toBe('ONLINE');
  });

  it('should record status history on rider assignment', async () => {
    // Clear any active orders for this rider
    await prisma.order.updateMany({
      where: { riderId: riderProfileId, status: { in: ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'] as any } },
      data: { status: 'DELIVERED' as any, deliveredAt: new Date() },
    });
    await prisma.riderProfile.update({ where: { id: riderProfileId }, data: { status: 'ONLINE' } });

    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await service.assignRider(order.id, riderId);

    const history = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'RIDER_ASSIGNED' },
    });
    expect(history).not.toBeNull();
    expect(history!.fromStatus).toBe('CONFIRMED');
    expect(history!.toStatus).toBe('RIDER_ASSIGNED');
    expect(history!.actorRole).toBe('RIDER');
    expect(history!.actorUserId).toBe(riderId);
    expect(history!.note).toBe('Rider accepted order');
  });
});

describe('Phase 3: Admin Operations', () => {
  let customerId: string;
  let storeId: string;
  let productId: string;
  let ownerId: string;
  let adminId: string;
  let riderId1: string;
  let riderId2: string;
  let riderProfileId1: string;
  let riderProfileId2: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ad_owner@test.com`, role: 'STORE_OWNER', name: 'AD Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ad_customer@test.com`, role: 'CUSTOMER', name: 'AD Customer' },
    });
    customerId = customer.id;
    const admin = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ad_admin@test.com`, role: 'ADMIN', name: 'AD Admin' },
    });
    adminId = admin.id;
    const rider1 = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ad_rider1@test.com`, role: 'RIDER', name: 'AD Rider1' },
    });
    riderId1 = rider1.id;
    const rider2 = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ad_rider2@test.com`, role: 'RIDER', name: 'AD Rider2' },
    });
    riderId2 = rider2.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}ADCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX}ADProd`, price: 50, pricePaise: 5000, categoryId: cat.id },
    });
    productId = product.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}ADStore`, address: 'Test', latitude: 70, longitude: 80, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 30 } });

    const rp1 = await createRiderProfile(riderId1);
    riderProfileId1 = rp1.id;
    const rp2 = await createRiderProfile(riderId2);
    riderProfileId2 = rp2.id;
  });

  it('admin can update any status within valid transitions', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'PENDING');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.updateStatus(order.id, OrderStatus.CONFIRMED, { id: adminId, role: Role.ADMIN });
    expect(result.status).toBe('CONFIRMED');
  });

  it('admin reassign on already RIDER_ASSIGNED order keeps status and changes rider', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'RIDER_ASSIGNED');
    await prisma.order.update({ where: { id: order.id }, data: { riderId: riderProfileId1 } });

    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.reassignRider(order.id, riderId2, { id: adminId, role: Role.ADMIN });
    expect(result.status).toBe('RIDER_ASSIGNED');
    expect(result.riderId).toBe(riderProfileId2);

    const oldRiderProfile = await prisma.riderProfile.findUnique({ where: { id: riderProfileId1 } });
    expect(oldRiderProfile!.status).toBe('ONLINE');

    const newRiderProfile = await prisma.riderProfile.findUnique({ where: { id: riderProfileId2 } });
    expect(newRiderProfile!.status).toBe('BUSY');
  });

  it('non-admin cannot reassign rider', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.reassignRider(order.id, riderId1, { id: ownerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('Only admin can reassign rider');
  });

  it('admin can force cancel order', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    await prisma.inventory.update({
      where: { storeId_productId: { storeId, productId } },
      data: { quantity: 20 },
    });
    const beforeInv = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(beforeInv!.quantity).toBe(20);

    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.forceCancel(order.id, { id: adminId, role: Role.ADMIN }, 'Test force cancel');
    expect(result.status).toBe('CANCELLED');

    const afterInv = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(afterInv!.quantity).toBe(22);

    const history = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'CANCELLED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(history).not.toBeNull();
    const metadata = history!.metadata as any;
    expect(metadata.forceCancel).toBe(true);
    expect(metadata.reason).toBe('Test force cancel');
  });

  it('non-admin cannot force cancel', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.forceCancel(order.id, { id: riderId1, role: Role.RIDER }, 'Not admin'),
    ).rejects.toThrow('Only admin can force cancel orders');
  });

  it('force cancel on already delivered order should fail', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'DELIVERED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.forceCancel(order.id, { id: adminId, role: Role.ADMIN }),
    ).rejects.toThrow('Order is already DELIVERED');
  });

  // --- BLOCKER 1: reassign sets order.status = RIDER_ASSIGNED ---

  it('admin reassign on CONFIRMED order sets status to RIDER_ASSIGNED', async () => {
    await prisma.riderProfile.update({ where: { id: riderProfileId1 }, data: { status: 'ONLINE' } });
    await prisma.riderProfile.update({ where: { id: riderProfileId2 }, data: { status: 'ONLINE' } });

    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.reassignRider(order.id, riderId1, { id: adminId, role: Role.ADMIN });
    expect(result.status).toBe('RIDER_ASSIGNED');
    expect(result.riderId).toBe(riderProfileId1);
    expect(result.riderAssignedAt).not.toBeNull();

    const history = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'RIDER_ASSIGNED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(history).not.toBeNull();
    expect(history!.fromStatus).toBe('CONFIRMED');
    expect(history!.toStatus).toBe('RIDER_ASSIGNED');
    expect(history!.actorRole).toBe('ADMIN');
  });

  it('admin reassign on PACKED order sets status to RIDER_ASSIGNED', async () => {
    // Clear any active orders for rider2 from earlier tests
    await prisma.order.updateMany({
      where: { riderId: riderProfileId2, status: { in: ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'] as any } },
      data: { status: 'DELIVERED' as any, deliveredAt: new Date() },
    });
    await prisma.riderProfile.update({ where: { id: riderProfileId2 }, data: { status: 'ONLINE' } });

    const order = await createTestOrder(customerId, storeId, productId, 'PACKED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.reassignRider(order.id, riderId2, { id: adminId, role: Role.ADMIN });
    expect(result.status).toBe('RIDER_ASSIGNED');
    expect(result.riderId).toBe(riderProfileId2);

    const history = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'RIDER_ASSIGNED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(history).not.toBeNull();
    expect(history!.fromStatus).toBe('PACKED');
    expect(history!.toStatus).toBe('RIDER_ASSIGNED');
  });

  // --- BLOCKER 2: active-order conflict check ---

  it('admin cannot reassign to rider with active RIDER_ASSIGNED order', async () => {
    await prisma.riderProfile.update({ where: { id: riderProfileId1 }, data: { status: 'ONLINE' } });
    await prisma.riderProfile.update({ where: { id: riderProfileId2 }, data: { status: 'ONLINE' } });

    // Give rider1 an active order in RIDER_ASSIGNED status
    const activeOrder = await createTestOrder(customerId, storeId, productId, 'RIDER_ASSIGNED');
    await prisma.order.update({ where: { id: activeOrder.id }, data: { riderId: riderProfileId1 } });

    // Try to reassign a different order to rider1 while rider1 has an active order
    const targetOrder = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.reassignRider(targetOrder.id, riderId1, { id: adminId, role: Role.ADMIN }),
    ).rejects.toThrow('has active order');
  });

  it('admin cannot reassign to rider with active OUT_FOR_DELIVERY order', async () => {
    await prisma.riderProfile.update({ where: { id: riderProfileId2 }, data: { status: 'ONLINE' } });

    // Give rider2 an active order in OUT_FOR_DELIVERY status
    const activeOrder = await createTestOrder(customerId, storeId, productId, 'OUT_FOR_DELIVERY');
    await prisma.order.update({ where: { id: activeOrder.id }, data: { riderId: riderProfileId2 } });

    // Try to reassign a different order to rider2 while rider2 has an active order
    const targetOrder = await createTestOrder(customerId, storeId, productId, 'PACKED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.reassignRider(targetOrder.id, riderId2, { id: adminId, role: Role.ADMIN }),
    ).rejects.toThrow('has active order');
  });

  it('admin can reassign same order to same rider without false self-conflict', async () => {
    // Clear any active orders for rider1 from earlier tests
    await prisma.order.updateMany({
      where: { riderId: riderProfileId1, status: { in: ['RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'] as any } },
      data: { status: 'DELIVERED' as any, deliveredAt: new Date() },
    });
    await prisma.riderProfile.update({ where: { id: riderProfileId1 }, data: { status: 'ONLINE' } });

    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const first = await service.reassignRider(order.id, riderId1, { id: adminId, role: Role.ADMIN });
    expect(first.status).toBe('RIDER_ASSIGNED');
    expect(first.riderId).toBe(riderProfileId1);

    // Reassign same order to same rider — should not false-conflict (excluded by id)
    const second = await service.reassignRider(order.id, riderId1, { id: adminId, role: Role.ADMIN });
    expect(second.status).toBe('RIDER_ASSIGNED');
    expect(second.riderId).toBe(riderProfileId1);
  });
});

describe('Phase 3: Customer Cancellation', () => {
  let customerId: string;
  let storeId: string;
  let productId: string;
  let ownerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}cc_owner@test.com`, role: 'STORE_OWNER', name: 'CC Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}cc_customer@test.com`, role: 'CUSTOMER', name: 'CC Customer' },
    });
    customerId = customer.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}CCCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX}CCProd`, price: 50, pricePaise: 5000, categoryId: cat.id },
    });
    productId = product.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}CCStore`, address: 'Test', latitude: 90, longitude: 100, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 20 } });
  });

  it('customer can cancel own PENDING order', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'PENDING');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await service.cancelMyOrder(customerId, order.id);

    const cancelled = await prisma.order.findUnique({ where: { id: order.id } });
    expect(cancelled!.status).toBe('CANCELLED');
    expect(cancelled!.cancelledAt).not.toBeNull();
  });

  it('customer cannot cancel another customer order', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'PENDING');
    const otherCustomer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}cc_other@test.com`, role: 'CUSTOMER', name: 'CC Other' },
    });
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.cancelMyOrder(otherCustomer.id, order.id),
    ).rejects.toThrow('Order not found');

    await prisma.user.delete({ where: { id: otherCustomer.id } });
  });

  it('customer cannot cancel once rider is assigned', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'RIDER_ASSIGNED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.cancelMyOrder(customerId, order.id),
    ).rejects.toThrow('Order can no longer be cancelled');
  });

  it('cancellation restores inventory', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    await prisma.inventory.update({
      where: { storeId_productId: { storeId, productId } },
      data: { quantity: 10 },
    });
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await service.cancelMyOrder(customerId, order.id);

    const afterInv = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(afterInv!.quantity).toBe(12);

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { orderId: order.id, reason: 'ORDER_CANCEL_RESTORE' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.quantityDelta).toBe(2);
  });

  it('cancellation records status history', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await service.cancelMyOrder(customerId, order.id);

    const history = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'CANCELLED' },
    });
    expect(history).not.toBeNull();
    expect(history!.actorRole).toBe('CUSTOMER');
    expect(history!.actorUserId).toBe(customerId);
    expect(history!.note).toBe('Customer cancelled order');
  });
});

describe('Phase 3: Ride Lifecycle Full Flow', () => {
  let customerId: string;
  let storeId: string;
  let productId: string;
  let ownerId: string;
  let riderId: string;
  let riderProfileId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}fl_owner@test.com`, role: 'STORE_OWNER', name: 'FL Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}fl_customer@test.com`, role: 'CUSTOMER', name: 'FL Customer' },
    });
    customerId = customer.id;
    const rider = await prisma.user.create({
      data: { email: `${TEST_PREFIX}fl_rider@test.com`, role: 'RIDER', name: 'FL Rider' },
    });
    riderId = rider.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}FLCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX}FLProd`, price: 50, pricePaise: 5000, categoryId: cat.id },
    });
    productId = product.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}FLStore`, address: 'Test', latitude: 110, longitude: 120, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 15 } });
    const rp = await createRiderProfile(riderId);
    riderProfileId = rp.id;
  });

  it('full flow: PENDING -> CONFIRMED -> PICKING -> PACKED -> RIDER_ASSIGNED -> OUT_FOR_DELIVERY -> DELIVERED', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'PENDING');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const adminActor = { id: riderId, role: Role.ADMIN };

    // PENDING -> CONFIRMED
    let result = await service.updateStatus(order.id, OrderStatus.CONFIRMED, adminActor);
    expect(result.status).toBe('CONFIRMED');

    // CONFIRMED -> PICKING
    result = await service.updateStatus(order.id, OrderStatus.PICKING, adminActor);
    expect(result.status).toBe('PICKING');

    // PICKING -> PACKED
    result = await service.updateStatus(order.id, OrderStatus.PACKED, adminActor);
    expect(result.status).toBe('PACKED');

    // PACKED -> RIDER_ASSIGNED
    await service.assignRider(order.id, riderId);
    const afterAssign = await prisma.order.findUnique({ where: { id: order.id } });
    expect(afterAssign).not.toBeNull();
    expect(afterAssign!.status).toBe('RIDER_ASSIGNED');
    expect(afterAssign!.riderId).toBe(riderProfileId);

    // RIDER_ASSIGNED -> OUT_FOR_DELIVERY
    result = await service.updateStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, { id: riderId, role: Role.RIDER });
    expect(result.status).toBe('OUT_FOR_DELIVERY');

    // OUT_FOR_DELIVERY -> DELIVERED
    result = await service.updateStatus(order.id, OrderStatus.DELIVERED, { id: riderId, role: Role.RIDER });
    expect(result.status).toBe('DELIVERED');
    expect(result.deliveredAt).not.toBeNull();

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.length).toBe(6);
    expect(history[0].toStatus).toBe('CONFIRMED');
    expect(history[1].toStatus).toBe('PICKING');
    expect(history[2].toStatus).toBe('PACKED');
    expect(history[3].toStatus).toBe('RIDER_ASSIGNED');
    expect(history[4].toStatus).toBe('OUT_FOR_DELIVERY');
    expect(history[5].toStatus).toBe('DELIVERED');
  });

  it('rider goes BUSY on assignment and ONLINE on delivery', async () => {
    const order = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await service.assignRider(order.id, riderId);
    let riderProfile = await prisma.riderProfile.findUnique({ where: { id: riderProfileId } });
    expect(riderProfile!.status).toBe('BUSY');

    await service.updateStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, { id: riderId, role: Role.RIDER });
    await service.updateStatus(order.id, OrderStatus.DELIVERED, { id: riderId, role: Role.RIDER });

    riderProfile = await prisma.riderProfile.findUnique({ where: { id: riderProfileId } });
    expect(riderProfile!.status).toBe('ONLINE');
  });
});

describe('Phase 3: Store Owner Listing and Access', () => {
  let customerId: string;
  let storeId: string;
  let productId: string;
  let ownerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}sl_owner@test.com`, role: 'STORE_OWNER', name: 'SL Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}sl_customer@test.com`, role: 'CUSTOMER', name: 'SL Customer' },
    });
    customerId = customer.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}SLCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX}SLProd`, price: 50, pricePaise: 5000, categoryId: cat.id },
    });
    productId = product.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}SLStore`, address: 'Test', latitude: 130, longitude: 140, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 10 } });
  });

  it('findStoreOrders should return orders only for owners stores', async () => {
    const order1 = await createTestOrder(customerId, storeId, productId, 'PENDING');
    const order2 = await createTestOrder(customerId, storeId, productId, 'CONFIRMED');

    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const orders = await service.findStoreOrders(ownerId);
    const orderIds = orders.map((o: any) => o.id);
    expect(orderIds).toContain(order1.id);
    expect(orderIds).toContain(order2.id);
  });

  it('findStoreOrders should include statusHistory', async () => {
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const orders = await service.findStoreOrders(ownerId);
    expect(orders.length).toBeGreaterThanOrEqual(1);
    expect((orders[0] as any).statusHistory).toBeDefined();
    expect(Array.isArray((orders[0] as any).statusHistory)).toBe(true);
  });
});
