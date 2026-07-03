import { PaymentMethod, Role, prisma } from '@aagam/database';
import { CheckoutService } from './checkout/checkout.service';
import { ProductService } from './products/product.service';

const PREFIX = '_test_phase6catalog_';

function cacheMock() {
  return {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
}

function trackingGatewayMock() {
  return { server: { to: jest.fn().mockReturnThis(), emit: jest.fn() } };
}

function notificationMock() {
  return { sendNewOrderAlert: jest.fn().mockResolvedValue(undefined) };
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const products = await prisma.product.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const productIds = products.map((p) => p.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { productId: { in: productIds } }] } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.inventory.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { productId: { in: productIds } }] } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.store.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { contains: PREFIX } } });
}

describe('Phase 6 catalog, serviceability, substitutes', () => {
  let customer: any;
  let owner: any;
  let nearAddress: any;
  let farAddress: any;
  let store: any;
  let category: any;
  let otherCategory: any;
  let baseProduct: any;
  let substituteProduct: any;
  let outOfStockProduct: any;
  let inactiveProduct: any;
  let deletedProduct: any;
  let otherCategoryProduct: any;
  let checkoutService: CheckoutService;
  let productService: ProductService;

  beforeAll(async () => {
    await cleanup();

    owner = await prisma.user.create({
      data: { email: `${PREFIX}owner@test.com`, name: 'Phase 6 Owner', role: Role.STORE_OWNER },
    });
    customer = await prisma.user.create({
      data: { email: `${PREFIX}customer@test.com`, name: 'Phase 6 Customer', role: Role.CUSTOMER, phone: '+919100000601' },
    });
    store = await prisma.store.create({
      data: {
        name: `${PREFIX}store`,
        address: 'Phase 6 Store Road',
        latitude: 12.9716,
        longitude: 77.5946,
        ownerId: owner.id,
      },
    });
    nearAddress = await prisma.customerAddress.create({
      data: {
        userId: customer.id,
        recipientName: 'Phase 6 Customer',
        phoneE164: '+919100000601',
        line1: 'Near Store',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
        latitude: 12.972,
        longitude: 77.595,
      },
    });
    farAddress = await prisma.customerAddress.create({
      data: {
        userId: customer.id,
        recipientName: 'Phase 6 Customer',
        phoneE164: '+919100000601',
        line1: 'Far Away',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560099',
        latitude: 13.25,
        longitude: 77.95,
      },
    });
    category = await prisma.category.create({ data: { name: `${PREFIX}fruits` } });
    otherCategory = await prisma.category.create({ data: { name: `${PREFIX}snacks` } });

    baseProduct = await prisma.product.create({
      data: { name: `${PREFIX}Apple Base`, description: 'Base product', price: 100, pricePaise: 10000, categoryId: category.id },
    });
    substituteProduct = await prisma.product.create({
      data: { name: `${PREFIX}Apple Substitute`, description: 'Substitute product', price: 120, pricePaise: 12000, categoryId: category.id },
    });
    outOfStockProduct = await prisma.product.create({
      data: { name: `${PREFIX}Apple Out`, description: 'No stock product', price: 80, pricePaise: 8000, categoryId: category.id },
    });
    inactiveProduct = await prisma.product.create({
      data: { name: `${PREFIX}Apple Inactive`, description: 'Inactive', price: 70, pricePaise: 7000, categoryId: category.id, isActive: false },
    });
    deletedProduct = await prisma.product.create({
      data: { name: `${PREFIX}Apple Deleted`, description: 'Deleted', price: 70, pricePaise: 7000, categoryId: category.id, deletedAt: new Date(), isActive: false },
    });
    otherCategoryProduct = await prisma.product.create({
      data: { name: `${PREFIX}Chips Substitute`, description: 'Different category', price: 50, pricePaise: 5000, categoryId: otherCategory.id },
    });

    await prisma.inventory.create({ data: { storeId: store.id, productId: baseProduct.id, quantity: 0 } });
    await prisma.inventory.create({ data: { storeId: store.id, productId: substituteProduct.id, quantity: 8 } });
    await prisma.inventory.create({ data: { storeId: store.id, productId: outOfStockProduct.id, quantity: 0 } });
    await prisma.inventory.create({ data: { storeId: store.id, productId: inactiveProduct.id, quantity: 9 } });
    await prisma.inventory.create({ data: { storeId: store.id, productId: deletedProduct.id, quantity: 9 } });
    await prisma.inventory.create({ data: { storeId: store.id, productId: otherCategoryProduct.id, quantity: 9 } });

    checkoutService = new CheckoutService(trackingGatewayMock() as any, notificationMock() as any);
    productService = new ProductService(cacheMock() as any);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('serviceable address returns nearest active store, delivery fee, and ETA', async () => {
    const result = await checkoutService.serviceability(customer.id, nearAddress.id);
    expect(result.serviceable).toBe(true);
    expect(result.store.id).toBe(store.id);
    expect(result.deliveryFeePaise).toBeGreaterThan(0);
    expect(result.etaMinutes).toBeGreaterThanOrEqual(10);
  });

  test('non-serviceable address is reported before checkout', async () => {
    const result = await checkoutService.serviceability(customer.id, farAddress.id);
    expect(result.serviceable).toBe(false);
    expect(result.deliveryFee).toBe(0);
  });

  test('catalog search excludes inactive/deleted products and attaches stock state', async () => {
    const result = await productService.findAll({ search: PREFIX, storeId: store.id, includeAvailability: true });
    const products = Array.isArray(result) ? result : (result as any).items;
    const names = products.map((p: any) => p.name);

    expect(names).toContain(baseProduct.name);
    expect(names).toContain(substituteProduct.name);
    expect(names).not.toContain(inactiveProduct.name);
    expect(names).not.toContain(deletedProduct.name);

    const base = products.find((p: any) => p.id === baseProduct.id);
    const substitute = products.find((p: any) => p.id === substituteProduct.id);
    expect(base.availability.inStock).toBe(false);
    expect(base.availability.availableQty).toBe(0);
    expect(substitute.availability.inStock).toBe(true);
  });

  test('substitutes are same-category, active, not deleted, and in-stock only', async () => {
    const substitutes = await productService.getSubstitutes(baseProduct.id, { storeId: store.id });
    const ids = substitutes.map((p: any) => p.id);

    expect(ids).toContain(substituteProduct.id);
    expect(ids).not.toContain(baseProduct.id);
    expect(ids).not.toContain(outOfStockProduct.id);
    expect(ids).not.toContain(inactiveProduct.id);
    expect(ids).not.toContain(deletedProduct.id);
    expect(ids).not.toContain(otherCategoryProduct.id);
    expect(substitutes[0].availability.inStock).toBe(true);
  });

  test('quote exposes unavailable item and placeOrder blocks it', async () => {
    const quote = await checkoutService.quote(customer.id, {
      addressId: nearAddress.id,
      items: [{ productId: baseProduct.id, quantity: 1 }],
    });

    expect(quote.serviceable).toBe(true);
    expect(quote.invoice.items[0].inStock).toBe(false);
    expect(quote.invoice.items[0].availableQty).toBe(0);

    await expect(
      checkoutService.placeOrder(customer.id, {
        addressId: nearAddress.id,
        items: [{ productId: baseProduct.id, quantity: 1 }],
        paymentMethod: PaymentMethod.COD,
      }, `phase6-${Date.now()}`),
    ).rejects.toThrow('Out of stock');
  });
});
