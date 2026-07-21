import { prisma, Role } from '@aagam/database';
import { StoreService } from './stores/store.service';

const PREFIX = '_test_store_assortment_';

const cacheManager = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn(),
  del: jest.fn().mockResolvedValue(undefined),
};

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((store) => store.id);
  const products = await prisma.product.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const productIds = products.map((product) => product.id);

  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { productId: { in: productIds } }] } });
  await prisma.inventory.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { productId: { in: productIds } }] } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe('Store assortment ownership', () => {
  const service = new StoreService(cacheManager as any);
  let ownerId: string;
  let otherOwnerId: string;
  let storeId: string;
  let productId: string;

  beforeAll(async () => {
    await cleanup();
    const [owner, otherOwner] = await Promise.all([
      prisma.user.create({ data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER, name: 'Owner' } }),
      prisma.user.create({ data: { email: `${PREFIX}other@test.com`, role: Role.STORE_OWNER, name: 'Other owner' } }),
    ]);
    ownerId = owner.id;
    otherOwnerId = otherOwner.id;
    const category = await prisma.category.create({ data: { name: `${PREFIX}category` } });
    const product = await prisma.product.create({
      data: {
        name: `${PREFIX}product`,
        price: 40,
        pricePaise: 4000,
        mrpPaise: 4500,
        categoryId: category.id,
      },
    });
    productId = product.id;
    const store = await prisma.store.create({
      data: {
        name: `${PREFIX}store`,
        address: 'Assortment test address',
        latitude: 17.4,
        longitude: 78.4,
        ownerId,
      },
    });
    storeId = store.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('shows only products not already carried by the store', async () => {
    const first = await service.getAvailableCatalogue(
      storeId,
      { id: ownerId, role: Role.STORE_OWNER },
      { page: 1, pageSize: 24, search: PREFIX },
    );
    expect(first.items.map((item) => item.id)).toContain(productId);

    await service.addStoreProduct(
      storeId,
      {
        productId,
        openingQuantity: 25,
        sellingPrice: 39,
        isListed: true,
        autoHideWhenOutOfStock: true,
      },
      { id: ownerId, role: Role.STORE_OWNER },
    );

    const second = await service.getAvailableCatalogue(
      storeId,
      { id: ownerId, role: Role.STORE_OWNER },
      { page: 1, pageSize: 24, search: PREFIX },
    );
    expect(second.items.map((item) => item.id)).not.toContain(productId);
  });

  it('creates a store assortment row and opening-stock ledger entry', async () => {
    const inventory = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(inventory).not.toBeNull();
    expect(inventory?.quantity).toBe(25);
    expect(inventory?.sellingPricePaise).toBe(3900);

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { storeId, productId, reason: 'OPENING_STOCK' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger?.previousQuantity).toBe(0);
    expect(ledger?.newQuantity).toBe(25);
    expect(ledger?.quantityDelta).toBe(25);
    expect(ledger?.actorUserId).toBe(ownerId);
  });

  it('returns only products already added to My Products', async () => {
    const assortment = await service.getStoreAssortment(storeId, { id: ownerId, role: Role.STORE_OWNER });
    expect(assortment).toHaveLength(1);
    expect(assortment[0].productId).toBe(productId);
  });

  it('blocks another owner from browsing or changing the store assortment', async () => {
    await expect(
      service.getStoreAssortment(storeId, { id: otherOwnerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('You can only update inventory for your own stores');

    await expect(
      service.updateInventory(storeId, productId, 30, { id: otherOwnerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('You can only update inventory for your own stores');
  });

  it('rejects a store selling price above Admin MRP', async () => {
    const extra = await prisma.product.create({
      data: {
        name: `${PREFIX}price-product`,
        price: 40,
        pricePaise: 4000,
        mrpPaise: 4500,
        categoryId: (await prisma.category.findFirstOrThrow({ where: { name: `${PREFIX}category` } })).id,
      },
    });

    await expect(
      service.addStoreProduct(
        storeId,
        { productId: extra.id, openingQuantity: 5, sellingPrice: 46 },
        { id: ownerId, role: Role.STORE_OWNER },
      ),
    ).rejects.toThrow('Store selling price cannot exceed Admin MRP');
  });
});
