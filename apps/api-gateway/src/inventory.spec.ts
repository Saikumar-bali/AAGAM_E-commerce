import { prisma, Role } from '@aagam/database';
import { OrderService } from './orders/order.service';
import { RefundsService } from './payments/refunds.service';
import { ProductService } from './products/product.service';
import { StoreService } from './stores/store.service';
import { CheckoutService } from './checkout/checkout.service';

const TEST_USER_PREFIX = '_test_phase1_';

async function cleanup() {
  const testUsers = await prisma.user.findMany({ where: { email: { contains: TEST_USER_PREFIX } }, select: { id: true } });
  const testUserIds = testUsers.map(u => u.id);
  const testStores = await prisma.store.findMany({ where: { name: { contains: TEST_USER_PREFIX } }, select: { id: true } });
  const testStoreIds = testStores.map(s => s.id);
  const testOrders = await prisma.order.findMany({ where: { OR: [{ storeId: { in: testStoreIds } }, { customerId: { in: testUserIds } }] }, select: { id: true } });
  const testOrderIds = testOrders.map(o => o.id);

  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ storeId: { in: testStoreIds } }, { orderId: { in: testOrderIds } }] } });
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: testOrderIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: testUserIds } } });
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
    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new ProductService(cacheManager as any);

    const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
    expect(existingProduct).not.toBeNull();
    expect(existingProduct!.isActive).toBe(true);
    expect(existingProduct!.deletedAt).toBeNull();

    let result = await service.findAll({});
    expect(Array.isArray(result)).toBe(true);
    const found = (result as any[]).find((p: any) => p.id === productId);
    expect(found).toBeDefined();

    await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date(), isActive: false } });

    result = await service.findAll({});
    expect(Array.isArray(result)).toBe(true);
    const foundAfter = (result as any[]).find((p: any) => p.id === productId);
    expect(foundAfter).toBeUndefined();

    await prisma.product.update({ where: { id: productId }, data: { deletedAt: null, isActive: true } });
  });

  it('Soft-deleted store should not appear in store findAll', async () => {
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

    const cacheManager = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
    const service = new StoreService(cacheManager as any);

    await expect(
      service.updateInventory(storeId, productId, 10, { id: otherOwnerId, role: Role.STORE_OWNER }),
    ).rejects.toThrow('You can only update inventory for your own stores');
  });

  it('Admin can update any store inventory', async () => {

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
    const customer = await prisma.user.create({
      data: { email: `${TEST_USER_PREFIX}co_customer@test.com`, role: 'CUSTOMER', name: 'CO Customer' },
    });
    const cat = await prisma.category.create({ data: { name: `${TEST_USER_PREFIX}COCat` } });
    const product = await prisma.product.create({
      data: { name: `${TEST_USER_PREFIX}COProd`, price: 50, categoryId: cat.id },
    });
    const uniqueLat = 88.888;
    const uniqueLng = 88.888;
    const store = await prisma.store.create({
      data: { name: `${TEST_USER_PREFIX}COStore`, address: 'Test', latitude: uniqueLat, longitude: uniqueLng, ownerId: owner.id },
    });
    await prisma.inventory.create({
      data: { storeId: store.id, productId: product.id, quantity: 20 },
    });
    const address = await prisma.customerAddress.create({
      data: {
        userId: customer.id,
        recipientName: 'CO Customer',
        phoneE164: '+919999999999',
        line1: '123 Test St',
        city: 'Testville',
        state: 'TS',
        pincode: '123456',
        latitude: uniqueLat,
        longitude: uniqueLng,
      },
    });

    const inventoryBefore = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    expect(inventoryBefore!.quantity).toBe(20);


    const trackingGateway = {
      server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
      emitOrderStatusUpdated: jest.fn(),
      emitOrderTimelineUpdated: jest.fn(),
    };
    const notificationService = { sendNewOrderAlert: jest.fn() };
    const checkoutService = new CheckoutService(trackingGateway as any, notificationService as any);

    const order = await checkoutService.placeOrder(customer.id, {
      items: [{ productId: product.id, quantity: 3 }],
      addressId: address.id,
      paymentMethod: 'COD' as any,
    });

    expect(order).toBeDefined();
    expect(order.customerId).toBe(customer.id);
    expect(order.storeId).toBe(store.id);

    const inventoryAfter = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId: store.id, productId: product.id } },
    });
    expect(inventoryAfter!.quantity).toBe(17);

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { storeId: store.id, productId: product.id, reason: 'CHECKOUT_RESERVATION' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.orderId).toBe(order.id);
    expect(ledger!.quantityDelta).toBe(-3);
    expect(ledger!.previousQuantity).toBe(20);
    expect(ledger!.newQuantity).toBe(17);
    expect(ledger!.actorUserId).toBe(customer.id);
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

    const trackingGateway = { emitOrderStatusUpdated: jest.fn(), emitOrderTimelineUpdated: jest.fn() };
    const orderService = new OrderService(trackingGateway as any, new RefundsService());

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
