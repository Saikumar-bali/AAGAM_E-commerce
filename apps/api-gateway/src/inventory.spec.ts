import { prisma, Role } from '@aagam/database';

const TEST_USER_PREFIX = '_test_phase1_';

async function cleanup() {
  await prisma.inventoryLedger.deleteMany({ where: { store: { name: { contains: TEST_USER_PREFIX } } } });
  await prisma.inventoryLedger.deleteMany({ where: { actorUserId: { contains: TEST_USER_PREFIX } } });
  await prisma.orderItem.deleteMany({ where: { order: { customerId: { contains: TEST_USER_PREFIX } } } });
  await prisma.orderStatusHistory.deleteMany({ where: { order: { customerId: { contains: TEST_USER_PREFIX } } } });
  await prisma.payment.deleteMany({ where: { order: { customerId: { contains: TEST_USER_PREFIX } } } });
  await prisma.order.deleteMany({ where: { customerId: { contains: TEST_USER_PREFIX } } });
  await prisma.inventory.deleteMany({ where: { store: { name: { contains: TEST_USER_PREFIX } } } });
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
