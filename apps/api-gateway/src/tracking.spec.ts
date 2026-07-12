import { OrderStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './orders/order.service';
import { TrackingService } from './tracking/tracking.service';
import { RefundsService } from './payments/refunds.service';

const TEST_PREFIX = '_test_phase5tracking_';

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
    server: { to: jest.fn().mockReturnThis(), emit: jest.fn(), volatile: { emit: jest.fn() } },
    emitOrderStatusUpdated: jest.fn(),
    emitOrderTimelineUpdated: jest.fn(),
    emitRiderAssigned: jest.fn(),
    emitRiderLocationUpdated: jest.fn(),
    emitTrackingStopped: jest.fn(),
  };
}

async function createTestUser(emailSuffix: string, role: Role) {
  return prisma.user.create({
    data: {
      email: `${TEST_PREFIX}${emailSuffix}@test.com`,
      name: `Test ${emailSuffix}`,
      role,
      phone: `+91${Math.floor(1000000000 + Math.random() * 9000000000)}`,
    },
  });
}

async function createTestCategory() {
  return prisma.category.create({ data: { name: `${TEST_PREFIX}category` } });
}

async function createTestProduct(categoryId: string) {
  return prisma.product.create({
    data: {
      name: `${TEST_PREFIX}product`,
      description: 'Test product',
      price: 100,
      pricePaise: 10000,
      categoryId,
    },
  });
}

async function createTestStore(ownerId: string) {
  return prisma.store.create({
    data: {
      name: `${TEST_PREFIX}store`,
      address: '123 Test Street',
      latitude: 28.6139,
      longitude: 77.2090,
      ownerId,
    },
  });
}

async function createTestRiderProfile(userId: string) {
  return prisma.riderProfile.create({
    data: { userId },
  });
}

async function createTestOrder(customerId: string, storeId: string, productId: string, status: string = 'PENDING', riderId?: string) {
  return prisma.order.create({
    data: {
      customerId,
      storeId,
      status: status as any,
      totalAmount: 100,
      grandTotal: 100,
      riderId: riderId || null,
      deliveryLat: 28.6200,
      deliveryLng: 77.2100,
      items: {
        create: [{ productId, quantity: 1, price: 100, unitPricePaise: 10000, lineTotalPaise: 10000 }],
      },
    },
    include: { items: true },
  });
}

async function insertLocationPing(riderProfileId: string, orderId: string, lat: number, lng: number, minutesAgo: number = 0) {
  const createdAt = new Date(Date.now() - minutesAgo * 60 * 1000);
  return prisma.riderLocationPing.create({
    data: {
      riderProfileId,
      orderId,
      latitude: lat,
      longitude: lng,
      source: 'MOBILE',
      createdAt,
    },
  });
}

describe('Phase 5: Tracking - Access Control', () => {
  let customerA: any;
  let customerB: any;
  let storeOwner: any;
  let admin: any;
  let riderUser: any;
  let riderUserB: any;
  let store: any;
  let product: any;
  let category: any;
  let riderProfileA: any;
  let riderProfileB: any;
  let orderForCustomerA: any;

  beforeAll(async () => {
    customerA = await createTestUser('custA', Role.CUSTOMER);
    customerB = await createTestUser('custB', Role.CUSTOMER);
    storeOwner = await createTestUser('storeOwner', Role.STORE_OWNER);
    admin = await createTestUser('admin', Role.ADMIN);
    riderUser = await createTestUser('riderA', Role.RIDER);
    riderUserB = await createTestUser('riderB', Role.RIDER);
    category = await createTestCategory();
    product = await createTestProduct(category.id);
    store = await createTestStore(storeOwner.id);
    riderProfileA = await createTestRiderProfile(riderUser.id);
    riderProfileB = await createTestRiderProfile(riderUserB.id);
    orderForCustomerA = await createTestOrder(customerA.id, store.id, product.id, 'RIDER_ASSIGNED', riderProfileA.id);
  });

  afterAll(async () => {
    await cleanup();
  });

  test('customer cannot access another customer tracking', async () => {
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.getTracking(orderForCustomerA.id, { id: customerB.id, role: Role.CUSTOMER })
    ).rejects.toThrow('Not allowed');
  }, 10000);

  test('customer can access own order tracking', async () => {
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(orderForCustomerA.id, { id: customerA.id, role: Role.CUSTOMER });
    expect(result.order.id).toBe(orderForCustomerA.id);
    expect(result.tracking).toBeDefined();
  }, 10000);

  test('admin can access any order tracking', async () => {
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(orderForCustomerA.id, { id: admin.id, role: Role.ADMIN });
    expect(result.order.id).toBe(orderForCustomerA.id);
  }, 10000);

  test('rider cannot access order not assigned to them', async () => {
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.getTracking(orderForCustomerA.id, { id: riderUserB.id, role: Role.RIDER })
    ).rejects.toThrow('Not allowed');
  }, 10000);

  test('store owner cannot access order from different store', async () => {
    const otherOwner = await createTestUser('otherOwner', Role.STORE_OWNER);
    const otherStore = await createTestStore(otherOwner.id);
    const otherOrder = await createTestOrder(customerA.id, otherStore.id, product.id, 'PENDING');

    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    await expect(
      service.getTracking(otherOrder.id, { id: storeOwner.id, role: Role.STORE_OWNER })
    ).rejects.toThrow('Not allowed');
  }, 10000);
});

describe('Phase 5: Tracking - Tracking State Model', () => {
  let customer: any;
  let storeOwner: any;
  let riderUser: any;
  let store: any;
  let product: any;
  let category: any;
  let riderProfile: any;

  beforeAll(async () => {
    customer = await createTestUser('stateCust', Role.CUSTOMER);
    storeOwner = await createTestUser('stateOwner', Role.STORE_OWNER);
    riderUser = await createTestUser('stateRider', Role.RIDER);
    category = await createTestCategory();
    product = await createTestProduct(category.id);
    store = await createTestStore(storeOwner.id);
    riderProfile = await createTestRiderProfile(riderUser.id);
  });

  afterAll(async () => {
    await cleanup();
  });

  test('NOT_ASSIGNED state for order without rider', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'CONFIRMED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(order.id);
    expect(result.tracking.trackingState).toBe('NOT_ASSIGNED');
  }, 10000);

  test('ASSIGNED_NO_LOCATION state when rider assigned but no pings', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'RIDER_ASSIGNED', riderProfile.id);
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(order.id);
    expect(result.tracking.trackingState).toBe('ASSIGNED_NO_LOCATION');
    expect(result.tracking.isStale).toBe(true);
  }, 10000);

  test('LIVE state when recent ping exists', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'OUT_FOR_DELIVERY', riderProfile.id);
    await insertLocationPing(riderProfile.id, order.id, 28.6150, 77.2080, 1);

    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(order.id);
    expect(result.tracking.trackingState).toBe('LIVE');
    expect(result.tracking.isStale).toBe(false);
    expect(result.tracking.etaMinutes).toBeGreaterThan(0);
    expect(result.tracking.distanceKm).toBeGreaterThanOrEqual(0);
  }, 10000);

  test('STALE state when last ping is old', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'OUT_FOR_DELIVERY', riderProfile.id);
    await insertLocationPing(riderProfile.id, order.id, 28.6150, 77.2080, 10);

    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(order.id);
    expect(result.tracking.trackingState).toBe('STALE');
    expect(result.tracking.isStale).toBe(true);
    expect(result.tracking.etaMinutes).toBeNull();
  }, 10000);

  test('DELIVERED state', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'DELIVERED', riderProfile.id);
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(order.id);
    expect(result.tracking.trackingState).toBe('DELIVERED');
  }, 10000);

  test('CANCELLED state', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'CANCELLED');
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(order.id);
    expect(result.tracking.trackingState).toBe('CANCELLED');
  }, 10000);

  test('staleAfterSeconds is included in response', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'RIDER_ASSIGNED', riderProfile.id);
    const service = new OrderService(createTrackingGatewayMock() as any, new RefundsService());

    const result = await service.getTracking(order.id);
    expect(result.tracking.staleAfterSeconds).toBe(360);
  }, 10000);
});

describe('Phase 5: Tracking - Rider Location Ingestion', () => {
  let customer: any;
  let storeOwner: any;
  let riderUserA: any;
  let riderUserB: any;
  let store: any;
  let product: any;
  let category: any;
  let riderProfileA: any;
  let riderProfileB: any;

  beforeAll(async () => {
    customer = await createTestUser('ingestCust', Role.CUSTOMER);
    storeOwner = await createTestUser('ingestOwner', Role.STORE_OWNER);
    riderUserA = await createTestUser('ingestRiderA', Role.RIDER);
    riderUserB = await createTestUser('ingestRiderB', Role.RIDER);
    category = await createTestCategory();
    product = await createTestProduct(category.id);
    store = await createTestStore(storeOwner.id);
    riderProfileA = await createTestRiderProfile(riderUserA.id);
    riderProfileB = await createTestRiderProfile(riderUserB.id);
  });

  afterAll(async () => {
    await cleanup();
  });

  test('rider cannot send location for another riders order', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'RIDER_ASSIGNED', riderProfileA.id);
    const service = new TrackingService(createTrackingGatewayMock() as any, { getTracking: jest.fn() } as any);

    await expect(
      service.ingestRiderLocation(riderUserB.id, {
        orderId: order.id,
        latitude: 28.6200,
        longitude: 77.2100,
      })
    ).rejects.toThrow('You can only update location for assigned orders');
  }, 10000);

  test('location rejected for non-trackable status', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'PENDING', riderProfileA.id);
    const service = new TrackingService(createTrackingGatewayMock() as any, { getTracking: jest.fn() } as any);

    await expect(
      service.ingestRiderLocation(riderUserA.id, {
        orderId: order.id,
        latitude: 28.6200,
        longitude: 77.2100,
      })
    ).rejects.toThrow('Order is not currently live-trackable');
  }, 10000);

  test('impossible jump rejected', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'OUT_FOR_DELIVERY', riderProfileA.id);
    await insertLocationPing(riderProfileA.id, order.id, 28.6150, 77.2080, 0);

    const service = new TrackingService(createTrackingGatewayMock() as any, { getTracking: jest.fn() } as any);

    await expect(
      service.ingestRiderLocation(riderUserA.id, {
        orderId: order.id,
        latitude: 35.0000,
        longitude: 77.2100,
      })
    ).rejects.toThrow('Location jump is too large');
  }, 10000);

  test('valid location accepted for trackable order', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'OUT_FOR_DELIVERY', riderProfileA.id);
    const mockGateway = createTrackingGatewayMock();
    const service = new TrackingService(mockGateway as any, {
      getTracking: jest.fn().mockResolvedValue({
        tracking: { etaMinutes: 5, distanceKm: 1.2, trackingState: 'LIVE' },
      }),
    } as any);

    const result = await service.ingestRiderLocation(riderUserA.id, {
      orderId: order.id,
      latitude: 28.6200,
      longitude: 77.2100,
      accuracy: 10,
      speed: 5,
      heading: 90,
    });

    expect(result.latitude).toBe(28.6200);
    expect(result.longitude).toBe(77.2100);
    expect(result.trackingState).toBe('LIVE');
    expect(mockGateway.emitRiderLocationUpdated).toHaveBeenCalled();
  }, 10000);
});

describe('Phase 5: Tracking - Stop Tracking', () => {
  let customer: any;
  let storeOwner: any;
  let riderUser: any;
  let store: any;
  let product: any;
  let category: any;
  let riderProfile: any;

  beforeAll(async () => {
    customer = await createTestUser('stopCust', Role.CUSTOMER);
    storeOwner = await createTestUser('stopOwner', Role.STORE_OWNER);
    riderUser = await createTestUser('stopRider', Role.RIDER);
    category = await createTestCategory();
    product = await createTestProduct(category.id);
    store = await createTestStore(storeOwner.id);
    riderProfile = await createTestRiderProfile(riderUser.id);
  });

  afterAll(async () => {
    await cleanup();
  });

  test('stopping a tracking session does not change delivery state', async () => {
    const order = await createTestOrder(customer.id, store.id, product.id, 'OUT_FOR_DELIVERY', riderProfile.id);
    const mockGateway = createTrackingGatewayMock();
    const service = new TrackingService(mockGateway as any, { getTracking: jest.fn() } as any);

    const result = await service.stopTracking(
      order.id,
      { id: riderUser.id, role: Role.RIDER },
      'TEST_SESSION_STOP',
    );
    expect(result.active).toBe(false);
    expect(result.status).toBe('OUT_FOR_DELIVERY');
    expect(result.deliveryStatus).toBe('OUT_FOR_DELIVERY');
    expect(mockGateway.emitTrackingStopped).toHaveBeenCalledWith(order.id, expect.objectContaining({
      orderId: order.id,
      status: 'OUT_FOR_DELIVERY',
      reason: 'TEST_SESSION_STOP',
    }));

    const unchangedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchangedOrder?.status).toBe('OUT_FOR_DELIVERY');
  }, 10000);
});
