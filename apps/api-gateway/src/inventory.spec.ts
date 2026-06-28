import { prisma, Role } from '@aagam/database';

const TEST_USER_PREFIX = '_test_phase1_';

async function cleanup() {
  const testStores = await prisma.store.findMany({ where: { name: { contains: TEST_USER_PREFIX } }, select: { id: true } });
  const testStoreIds = testStores.map(s => s.id);
  const testOrders = await prisma.order.findMany({ where: { storeId: { in: testStoreIds } }, select: { id: true } });
  const testOrderIds = testOrders.map(o => o.id);

  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ storeId: { in: testStoreIds } }, { orderId: { in: testOrderIds } }] } });
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: testOrderIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: testStoreIds } } });
  await prisma.store.deleteMany({ where: { name: { contains: TEST_USER_PREFIX } } });
  await prisma.product.deleteMany({ where: { name: { contains: TEST_USER_PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: TEST_USER_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { contains: TEST_USER_PREFIX } } });
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Phase 1: RBAC Guards', () => {
  it('GET /auth/users should require authentication (no token = rejected)', async () => {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch('http://localhost:3005/auth/users');
    expect(res.status).toBe(401);
  });

  it('GET /riders/:id should require admin role (customer token = rejected)', async () => {
    const { default: fetch } = await import('node-fetch');
    const loginRes = await fetch('http://localhost:3005/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'customer@aagam.com', password: 'customer123' }),
    });
    const { access_token } = await loginRes.json() as any;

    const res = await fetch('http://localhost:3005/riders/some-rider-id', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(res.status).toBe(403);
  });

  it('GET /upload/image should require authentication', async () => {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch('http://localhost:3005/upload/image', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});

describe('Phase 1: Soft Delete', () => {
  let categoryId: string;
  let productId: string;
  let storeId: string;
  let ownerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}owner@test.com`, role: 'STORE_OWNER', name: 'Test Owner' },
    });
    ownerId = owner.id;

    const cat = await prisma.category.create({ data: { name: `${TEST_USER_PREFIX}Category` } });
    categoryId = cat.id;

    const product = await prisma.product.create({
      data: { name: `${TEST_USER_PREFIX}Product`, price: 99, categoryId },
    });
    productId = product.id;

    const store = await prisma.store.create({
      data: { name: `${TEST_USER_PREFIX}Store`, address: 'Test', latitude: 0, longitude: 0, ownerId },
    });
    storeId = store.id;
  });

  it('Soft-deleted product should not appear in findAll', async () => {
    const { ProductService } = await import('./products/product.service');
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new ProductService(cacheManager as any);

    let result = await service.findAll({});
    const found = (result as any[]).find((p: any) => p.id === productId);
    expect(found).toBeDefined();

    await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date(), isActive: false } });

    result = await service.findAll({});
    const foundAfter = (result as any[]).find((p: any) => p.id === productId);
    expect(foundAfter).toBeUndefined();

    await prisma.product.update({ where: { id: productId }, data: { deletedAt: null, isActive: true } });
  });

  it('Soft-deleted store should not appear in store findAll', async () => {
    const { StoreService } = await import('./stores/store.service');
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new StoreService(cacheManager as any);

    let result = await service.findAll();
    const found = result.find((s: any) => s.id === storeId);
    expect(found).toBeDefined();

    await prisma.store.update({ where: { id: storeId }, data: { deletedAt: new Date(), isActive: false } });

    result = await service.findAll();
    const foundAfter = result.find((s: any) => s.id === storeId);
    expect(foundAfter).toBeUndefined();

    await prisma.store.update({ where: { id: storeId }, data: { deletedAt: null, isActive: true } });
  });
});

describe('Phase 1: Store Tenancy', () => {
  let storeId: string;
  let otherOwnerId: string;
  let productId: string;
  let categoryId: string;

  beforeAll(async () => {
    const owner1 = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}owner1@test.com`, role: 'STORE_OWNER', name: 'Owner1' },
    });
    const owner2 = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}owner2@test.com`, role: 'STORE_OWNER', name: 'Owner2' },
    });
    otherOwnerId = owner2.id;

    const cat = await prisma.category.create({ data: { name: `${TEST_USER_PREFIX}TenancyCat` } });
    categoryId = cat.id;

    const product = await prisma.product.create({
      data: { name: `${TEST_USER_PREFIX}TenancyProd`, price: 50, categoryId },
    });
    productId = product.id;

    const store = await prisma.store.create({
      data: { name: `${TEST_USER_PREFIX}TenancyStore`, address: 'Test', latitude: 0, longitude: 0, ownerId: owner1.id },
    });
    storeId = store.id;
  });

  it('Store-owner cannot update inventory of another owners store', async () => {
    const { StoreService } = await import('./stores/store.service');
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new StoreService(cacheManager as any);

    await expect(
      service.updateInventory(storeId, productId, 10, { id: otherOwnerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('You can only update inventory for your own stores');
  });

  it('Admin can update any store inventory', async () => {
    const { StoreService } = await import('./stores/store.service');
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new StoreService(cacheManager as any);

    const admin = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}admin@test.com`, role: 'ADMIN', name: 'Admin' },
    });

    const result = await service.updateInventory(storeId, productId, 25, { id: admin.id, role: Role.ADMIN });
    expect(result.quantity).toBe(25);

    await prisma.user.delete({ where: { id: admin.id } });
  });
});

describe('Phase 1: Inventory Ledger', () => {
  let storeId: string;
  let productId: string;
  let categoryId: string;
  let ownerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}ledger_owner@test.com`, role: 'STORE_OWNER', name: 'LedgerOwner' },
    });
    ownerId = owner.id;

    const cat = await prisma.category.create({ data: { name: `${TEST_USER_PREFIX}LedgerCat` } });
    categoryId = cat.id;

    const product = await prisma.product.create({
      data: { name: `${TEST_USER_PREFIX}LedgerProd`, price: 100, categoryId },
    });
    productId = product.id;

    const store = await prisma.store.create({
      data: { name: `${TEST_USER_PREFIX}LedgerStore`, address: 'Test', latitude: 0, longitude: 0, ownerId },
    });
    storeId = store.id;
  });

  it('Manual inventory update should create ledger entry', async () => {
    const { StoreService } = await import('./stores/store.service');
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new StoreService(cacheManager as any);

    await service.updateInventory(storeId, productId, 50, { id: ownerId, role: Role.STORE_OWNER });

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { storeId, productId, reason: 'MANUAL_ADJUSTMENT' },
      orderBy: { createdAt: 'desc' },
    });

    expect(ledger).not.toBeNull();
    expect(ledger!.newQuantity).toBe(50);
    expect(ledger!.actorUserId).toBe(ownerId);
  });

  it('Second manual update should log correct delta', async () => {
    const { StoreService } = await import('./stores/store.service');
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new StoreService(cacheManager as any);

    await service.updateInventory(storeId, productId, 30, { id: ownerId, role: Role.STORE_OWNER });

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { storeId, productId, reason: 'MANUAL_ADJUSTMENT' },
      orderBy: { createdAt: 'desc' },
    });

    expect(ledger).not.toBeNull();
    expect(ledger!.previousQuantity).toBe(50);
    expect(ledger!.newQuantity).toBe(30);
    expect(ledger!.quantityDelta).toBe(-20);
  });
});

describe('Phase 1: Store Soft Delete Preserves Orders', () => {
  it('Soft-deleted store should still have historical orders', async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}sd_owner@test.com`, role: 'STORE_OWNER', name: 'SD Owner' },
    });
    const customer = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}sd_customer@test.com`, role: 'CUSTOMER', name: 'SD Customer' },
    });
    const cat = await prisma.category.create({ data: { name: `${TEST_USER_PREFIX}SDCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_USER_PREFIX}SDProd`, price: 100, categoryId: cat.id },
    });
    const store = await prisma.store.create({
      data: { name: `${TEST_USER_PREFIX}SDStore`, address: 'Test', latitude: 0, longitude: 0, ownerId: owner.id },
    });
    await prisma.inventory.create({
      data: { storeId: store.id, productId: product.id, quantity: 10 },
    });

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        storeId: store.id,
        status: 'DELIVERED',
        totalAmount: 100,
        grandTotal: 100,
        items: { create: [{ productId: product.id, quantity: 2, price: 100 }] },
      },
      include: { items: true },
    });

    expect(order).toBeDefined();
    expect(order.storeId).toBe(store.id);

    const { StoreService } = await import('./stores/store.service');
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new StoreService(cacheManager as any);
    await service.delete(store.id);

    const orderAfterDelete = await prisma.order.findUnique({ where: { id: order.id } });
    expect(orderAfterDelete).not.toBeNull();
    expect(orderAfterDelete!.storeId).toBe(store.id);
    expect(orderAfterDelete!.status).toBe('DELIVERED');

    const storeAfterDelete = await prisma.store.findUnique({ where: { id: store.id } });
    expect(storeAfterDelete!.deletedAt).not.toBeNull();
    expect(storeAfterDelete!.isActive).toBe(false);
  });
});

describe('Phase 1: Checkout Inventory and Ledger', () => {
  it('Checkout should decrement inventory and create ledger entry', async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}co_owner@test.com`, role: 'STORE_OWNER', name: 'CO Owner' },
    });
    const cat = await prisma.category.create({ data: { name: `${TEST_USER_PREFIX}COCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_USER_PREFIX}COProd`, price: 50, categoryId: cat.id },
    });
    const store = await prisma.store.create({
      data: { name: `${TEST_USER_PREFIX}COStore`, address: 'Test', latitude: 0, longitude: 0, ownerId: owner.id },
    });
    await prisma.inventory.create({
      data: { storeId: store.id, productId: product.id, quantity: 20 },
    });

    const { StoreService } = await import('./stores/store.service');
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const storeService = new StoreService(cacheManager as any);

    await storeService.updateInventory(store.id, product.id, 20, { id: owner.id, role: Role.STORE_OWNER });

    const inventoryBefore = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    expect(inventoryBefore!.quantity).toBe(20);

    await prisma.inventory.update({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
      data: { quantity: { decrement: 5 } },
    });

    await prisma.inventoryLedger.create({
      data: {
        storeId: store.id,
        productId: product.id,
        reason: 'CHECKOUT_RESERVATION',
        quantityDelta: -5,
        previousQuantity: 20,
        newQuantity: 15,
        note: 'Test checkout reservation',
      },
    });

    const inventoryAfter = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    expect(inventoryAfter!.quantity).toBe(15);

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { storeId: store.id, productId: product.id, reason: 'CHECKOUT_RESERVATION' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.quantityDelta).toBe(-5);
    expect(ledger!.previousQuantity).toBe(20);
    expect(ledger!.newQuantity).toBe(15);
  });
});

describe('Phase 1: Cancellation Inventory Restore and Ledger', () => {
  it('Cancellation should restore inventory and create ledger entry', async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}cn_owner@test.com`, role: 'STORE_OWNER', name: 'CN Owner' },
    });
    const customer = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}cn_customer@test.com`, role: 'CUSTOMER', name: 'CN Customer' },
    });
    const cat = await prisma.category.create({ data: { name: `${TEST_USER_PREFIX}CNCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_USER_PREFIX}CNProd`, price: 75, categoryId: cat.id },
    });
    const store = await prisma.store.create({
      data: { name: `${TEST_USER_PREFIX}CNStore`, address: 'Test', latitude: 0, longitude: 0, ownerId: owner.id },
    });
    await prisma.inventory.create({
      data: { storeId: store.id, productId: product.id, quantity: 10 },
    });

    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        storeId: store.id,
        status: 'CONFIRMED',
        totalAmount: 150,
        grandTotal: 150,
        items: { create: [{ productId: product.id, quantity: 2, price: 75 }] },
      },
      include: { items: true },
    });

    const inventoryBefore = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    expect(inventoryBefore!.quantity).toBe(10);

    const { OrderService } = await import('./orders/order.service');
    const trackingGateway = { emitOrderStatusUpdated: jest.fn(), emitOrderTimelineUpdated: jest.fn() };
    const orderService = new OrderService(trackingGateway as any);

    await orderService.cancelMyOrder(customer.id, order.id);

    const inventoryAfter = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    expect(inventoryAfter!.quantity).toBe(12);

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { storeId: store.id, productId: product.id, reason: 'ORDER_CANCEL_RESTORE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.quantityDelta).toBe(2);
    expect(ledger!.previousQuantity).toBe(10);
    expect(ledger!.newQuantity).toBe(12);
    expect(ledger!.orderId).toBe(order.id);
  });
});
