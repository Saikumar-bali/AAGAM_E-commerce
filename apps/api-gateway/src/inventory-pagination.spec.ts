import { prisma, Role } from '@aagam/database';
import { StoreService } from './stores/store.service';

const PREFIX = '_test_inv_pagination_';

const cacheManager = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn(),
  del: jest.fn(),
};

async function cleanup() {
  const stores = await prisma.store.findMany({
    where: { name: { contains: PREFIX } },
    select: { id: true },
  });
  const storeIds = stores.map((s) => s.id);
  const products = await prisma.product.findMany({
    where: { name: { contains: PREFIX } },
    select: { id: true },
  });
  const productIds = products.map((p) => p.id);

  await prisma.inventoryLedger.deleteMany({
    where: {
      OR: [
        { storeId: { in: storeIds } },
        { productId: { in: productIds } },
      ],
    },
  });
  await prisma.inventory.deleteMany({
    where: {
      OR: [
        { storeId: { in: storeIds } },
        { productId: { in: productIds } },
      ],
    },
  });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.user.deleteMany({
    where: { email: { contains: PREFIX } },
  });
}

describe('Real API: inventory pagination integration', () => {
  let owner: any;
  let otherOwner: any;
  let admin: any;
  let category: any;
  let product: any;
  let store: any;
  let service: StoreService;

  beforeAll(async () => {
    await cleanup();
    service = new StoreService(cacheManager as any);

    admin = await prisma.user.create({
      data: {
        email: `${PREFIX}admin@test.com`,
        role: Role.ADMIN,
        name: `${PREFIX}Admin`,
      },
    });
    owner = await prisma.user.create({
      data: {
        email: `${PREFIX}owner@test.com`,
        role: Role.STORE_OWNER,
        name: `${PREFIX}Owner`,
      },
    });
    otherOwner = await prisma.user.create({
      data: {
        email: `${PREFIX}other@test.com`,
        role: Role.STORE_OWNER,
        name: `${PREFIX}OtherOwner`,
      },
    });
    category = await prisma.category.create({
      data: { name: `${PREFIX}Category` },
    });
    product = await prisma.product.create({
      data: {
        name: `${PREFIX}Product`,
        price: 150,
        pricePaise: 15000,
        mrpPaise: 15000,
        categoryId: category.id,
      },
    });
    store = await prisma.store.create({
      data: {
        name: `${PREFIX}Store`,
        address: 'Test address',
        latitude: 12.9716,
        longitude: 77.5946,
        ownerId: owner.id,
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('PATCH inventory creates record and ledger entry', async () => {
    const result = await service.updateInventory(
      store.id,
      product.id,
      42,
      { id: owner.id, role: Role.STORE_OWNER },
      { isListed: true, autoHideWhenOutOfStock: true, sellingPrice: null },
    );

    expect(result.quantity).toBe(42);
    expect(result.isListed).toBe(true);
    expect(result.autoHideWhenOutOfStock).toBe(true);
    expect(result.id).toBeTruthy();

    const record = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    expect(record).not.toBeNull();
    expect(record!.quantity).toBe(42);
    expect(record!.isListed).toBe(true);
    expect(record!.autoHideWhenOutOfStock).toBe(true);

    const ledger = await prisma.inventoryLedger.findFirst({
      where: {
        storeId: store.id,
        productId: product.id,
        reason: 'MANUAL_ADJUSTMENT',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.newQuantity).toBe(42);
    expect(ledger!.quantityDelta).toBe(42);
    expect(ledger!.actorUserId).toBe(owner.id);
  });

  test('PATCH inventory with sellingPrice stores paise correctly', async () => {
    const result = await service.updateInventory(
      store.id,
      product.id,
      30,
      { id: owner.id, role: Role.STORE_OWNER },
      { sellingPrice: 120.5 },
    );

    expect(result.quantity).toBe(30);
    expect(result.sellingPricePaise).toBe(12050);

    const record = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    expect(record!.sellingPricePaise).toBe(12050);
  });

  test('PATCH inventory with sellingPrice > MRP is rejected', async () => {
    await expect(
      service.updateInventory(
        store.id,
        product.id,
        10,
        { id: owner.id, role: Role.STORE_OWNER },
        { sellingPrice: 999 },
      ),
    ).rejects.toThrow('Store selling price cannot exceed Admin MRP');
  });

  test('cross-owner store update is rejected with ForbiddenException', async () => {
    await expect(
      service.updateInventory(
        store.id,
        product.id,
        5,
        { id: otherOwner.id, role: Role.STORE_OWNER },
      ),
    ).rejects.toThrow('You can only update inventory for your own stores');
  });

  test('admin can update any store inventory', async () => {
    const result = await service.updateInventory(
      store.id,
      product.id,
      100,
      { id: admin.id, role: Role.ADMIN },
    );
    expect(result.quantity).toBe(100);
  });

  test('second update logs correct delta in ledger', async () => {
    const ledger = await prisma.inventoryLedger.findFirst({
      where: {
        storeId: store.id,
        productId: product.id,
        reason: 'MANUAL_ADJUSTMENT',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.quantityDelta).toBe(100 - 30);
    expect(ledger!.previousQuantity).toBe(30);
    expect(ledger!.newQuantity).toBe(100);
  });
});
