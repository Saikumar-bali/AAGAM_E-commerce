import { PaymentMethod, PaymentStatus, RefundStatus, Role, prisma } from '@aagam/database';
import { OrderService } from './orders/order.service';
import { RefundsService } from './payments/refunds.service';
import { PaymentsService } from './payments/payments.service';
import { CheckoutService } from './checkout/checkout.service';

const TEST_PREFIX = '_test_phase2_';

async function cleanup() {
  const testOrders = await prisma.order.findMany({
    where: { customer: { email: { contains: TEST_PREFIX } } },
    select: { id: true },
  });
  const testOrderIds = testOrders.map(o => o.id);

  await prisma.refund.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: testOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: testOrderIds } } });

  const testStores = await prisma.store.findMany({ where: { name: { contains: TEST_PREFIX } }, select: { id: true } });
  const testStoreIds = testStores.map(s => s.id);
  await prisma.inventoryLedger.deleteMany({ where: { storeId: { in: testStoreIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: testStoreIds } } });
  await prisma.store.deleteMany({ where: { name: { contains: TEST_PREFIX } } });

  await prisma.customerAddress.deleteMany({ where: { userId: { in: (await prisma.user.findMany({ where: { email: { contains: TEST_PREFIX } }, select: { id: true } })).map(u => u.id) } } });
  await prisma.product.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: TEST_PREFIX } } });
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

describe('Phase 2: Money - Paise conversion', () => {
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}MoneyCat` } });
    categoryId = cat.id;
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX}MoneyProd`, price: 99.99, pricePaise: 9999, categoryId },
    });
    productId = product.id;
  });

  it('should convert product Float price to paise correctly', async () => {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product).not.toBeNull();
    expect(product!.price).toBe(99.99);
    expect(product!.pricePaise).toBe(9999);
  });

  it('should not have floating point rounding bugs in paise', async () => {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const paiseFromFloat = Math.round(product!.price * 100);
    expect(product!.pricePaise).toBe(paiseFromFloat);
    expect(product!.pricePaise).toBe(9999);
  });

  it('should calculate grandTotalPaise correctly: subtotalPaise + deliveryFeePaise + taxPaise - discountPaise', () => {
    const subtotalPaise = 5000;
    const deliveryFeePaise = 2900;
    const taxPaise = 900;
    const discountPaise = 1000;
    const grandTotalPaise = subtotalPaise + deliveryFeePaise + taxPaise - discountPaise;
    expect(grandTotalPaise).toBe(7800);
  });
});

describe('Phase 2: Money - Quantity validation', () => {
  let categoryId: string;
  let productId: string;
  let storeId: string;
  let ownerId: string;
  let customerId: string;
  let addressId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}qv_owner@test.com`, role: 'STORE_OWNER', name: 'QV Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}qv_customer@test.com`, role: 'CUSTOMER', name: 'QV Customer' },
    });
    customerId = customer.id;

    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}QvCat` } });
    categoryId = cat.id;
    const prod = await prisma.product.create({
      data: { name: `${TEST_PREFIX}QvProd`, price: 100, pricePaise: 10000, categoryId },
    });
    productId = prod.id;

    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}QvStore`, address: 'Test', latitude: 11.111, longitude: 11.111, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 10 } });

    const address = await prisma.customerAddress.create({
      data: {
        userId: customerId,
        recipientName: 'QV Customer',
        phoneE164: '+919999999910',
        line1: '123 QV St',
        city: 'Testville',
        state: 'TS',
        pincode: '123456',
        latitude: 11.111,
        longitude: 11.111,
      },
    });
    addressId = address.id;
  });

  it('should reject zero quantity', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );
    await expect(
      checkoutService.placeOrder(customerId, {
        items: [{ productId, quantity: 0 }],
        addressId,
        paymentMethod: PaymentMethod.COD as any,
      }),
    ).rejects.toThrow('Invalid quantity');
  });

  it('should reject negative quantity', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );
    await expect(
      checkoutService.placeOrder(customerId, {
        items: [{ productId, quantity: -1 }],
        addressId,
        paymentMethod: PaymentMethod.COD as any,
      }),
    ).rejects.toThrow('Invalid quantity');
  });
});

describe('Phase 2: Checkout - Pricing snapshot', () => {
  let categoryId: string;
  let productId: string;
  let storeId: string;
  let ownerId: string;
  let customerId: string;
  let addressId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ps_owner@test.com`, role: 'STORE_OWNER', name: 'PS Owner' },
    });
    ownerId = owner.id;

    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ps_customer@test.com`, role: 'CUSTOMER', name: 'PS Customer' },
    });
    customerId = customer.id;

    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}PSCat` } });
    categoryId = cat.id;

    const prod = await prisma.product.create({
      data: { name: `${TEST_PREFIX}PSProd`, price: 150, pricePaise: 15000, categoryId },
    });
    productId = prod.id;

    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}PSStore`, address: 'Test', latitude: 88.888, longitude: 88.888, ownerId },
    });
    storeId = store.id;

    await prisma.inventory.create({
      data: { storeId, productId, quantity: 50 },
    });

    const address = await prisma.customerAddress.create({
      data: {
        userId: customerId,
        recipientName: 'PS Customer',
        phoneE164: '+919999999991',
        line1: '123 PS St',
        city: 'Testville',
        state: 'TS',
        pincode: '123456',
        latitude: 88.888,
        longitude: 88.888,
      },
    });
    addressId = address.id;
  });

  it('should store immutable pricing snapshot on order creation', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId, quantity: 2 }],
      addressId,
      paymentMethod: PaymentMethod.COD as any,
    });

    expect(order).toBeDefined();
    expect(order.pricingSnapshot).not.toBeNull();

    const snapshot = order.pricingSnapshot as any;
    expect(snapshot.subtotalPaise).toBe(30000);
    expect(snapshot.grandTotalPaise).toBeGreaterThan(0);
    expect(snapshot.currency).toBe('INR');
    expect(snapshot.paymentMethod).toBe('COD');
    expect(snapshot.calculatedAt).toBeDefined();
    expect(snapshot.items).toBeDefined();
    expect(snapshot.items.length).toBe(1);
    expect(snapshot.items[0].productId).toBe(productId);
    expect(snapshot.items[0].productName).toBe(`${TEST_PREFIX}PSProd`);
    expect(snapshot.items[0].quantity).toBe(2);
    expect(snapshot.items[0].unitPricePaise).toBe(15000);
    expect(snapshot.items[0].lineTotalPaise).toBe(30000);
  });

  it('should keep order totals immutable after product price changes', async () => {
    const order = await prisma.order.findFirst({
      where: { customerId, storeId },
      orderBy: { createdAt: 'desc' },
    });
    expect(order).not.toBeNull();

    const originalGrandTotalPaise = order!.grandTotalPaise;
    const originalGrandTotal = order!.grandTotal;

    // Change product price
    await prisma.product.update({
      where: { id: productId },
      data: { price: 9999, pricePaise: 999900 },
    });

    const sameOrder = await prisma.order.findUnique({ where: { id: order!.id } });
    expect(sameOrder!.grandTotalPaise).toBe(originalGrandTotalPaise);
    expect(sameOrder!.grandTotal).toBe(originalGrandTotal);

    // Restore price
    await prisma.product.update({
      where: { id: productId },
      data: { price: 150, pricePaise: 15000 },
    });
  });

  it('should reject checkout when inventory insufficient', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    await expect(
      checkoutService.placeOrder(customerId, {
        items: [{ productId, quantity: 9999 }],
        addressId,
        paymentMethod: PaymentMethod.COD as any,
      }),
    ).rejects.toThrow(/Insufficient inventory|Out of stock/);
  });

  it('payment amountPaise should equal order grandTotalPaise on creation', async () => {
    // Get the last order
    const order = await prisma.order.findFirst({
      where: { customerId, storeId },
      orderBy: { createdAt: 'desc' },
      include: { payment: true },
    });
    expect(order).not.toBeNull();
    expect(order!.payment).not.toBeNull();
    expect(order!.payment!.amountPaise).toBe(order!.grandTotalPaise);
  });
});

describe('Phase 2: Payment lifecycle', () => {
  let categoryId: string;
  let productId: string;
  let storeId: string;
  let ownerId: string;
  let customerId: string;
  let addressId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}pl_owner@test.com`, role: 'STORE_OWNER', name: 'PL Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}pl_customer@test.com`, role: 'CUSTOMER', name: 'PL Customer' },
    });
    customerId = customer.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}PLCat` } });
    categoryId = cat.id;
    const prod = await prisma.product.create({
      data: { name: `${TEST_PREFIX}PLProd`, price: 200, pricePaise: 20000, categoryId },
    });
    productId = prod.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}PLStore`, address: 'Test', latitude: 44.444, longitude: 44.444, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 30 } });
    const addr = await prisma.customerAddress.create({
      data: {
        userId: customerId,
        recipientName: 'PL Customer', phoneE164: '+919999999992',
        line1: '123 PL St', city: 'Testville', state: 'TS', pincode: '123456',
        latitude: 44.444, longitude: 44.444,
      },
    });
    addressId = addr.id;
  });

  it('COD should create PENDING_COD payment', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.COD as any,
    });

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(payment).not.toBeNull();
    expect(payment!.method).toBe('COD');
    expect(payment!.status).toBe('PENDING_COD');
  });

  it('online payment capture should succeed', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.ONLINE as any,
    });

    const paymentsService = new PaymentsService();

    const result = await paymentsService.captureSimulatedPayment(customerId, order.id);
    expect(result.success).toBe(true);
    expect(result.status).toBe('CAPTURED');

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(payment!.status).toBe('CAPTURED');
    expect(payment!.verifiedAt).not.toBeNull();
  });

  it('failed payment should set order to PAYMENT_FAILED', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.ONLINE as any,
    });

    const paymentsService = new PaymentsService();

    await paymentsService.failSimulatedPayment(customerId, order.id, 'INSUFFICIENT_FUNDS');

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(payment!.status).toBe('FAILED');
    expect(payment!.failureReason).toBe('INSUFFICIENT_FUNDS');

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('PAYMENT_FAILED');
    expect(updatedOrder!.paymentFailedAt).not.toBeNull();
  });

  it('duplicate capture should be idempotent', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.ONLINE as any,
    });

    const paymentsService = new PaymentsService();

    const first = await paymentsService.captureSimulatedPayment(customerId, order.id);
    expect(first.status).toBe('CAPTURED');

    const second = await paymentsService.captureSimulatedPayment(customerId, order.id);
    expect(second.status).toBe('CAPTURED');
    expect(second.success).toBe(true);
  });
});

describe('Phase 2: Refund foundation', () => {
  let categoryId: string;
  let productId1: string;
  let productId2: string;
  let storeId: string;
  let ownerId: string;
  let customerId: string;
  let addressId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}rf_owner@test.com`, role: 'STORE_OWNER', name: 'RF Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}rf_customer@test.com`, role: 'CUSTOMER', name: 'RF Customer' },
    });
    customerId = customer.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}RFCat` } });
    categoryId = cat.id;
    const prod1 = await prisma.product.create({
      data: { name: `${TEST_PREFIX}RFProd1`, price: 300, pricePaise: 30000, categoryId },
    });
    productId1 = prod1.id;
    const prod2 = await prisma.product.create({
      data: { name: `${TEST_PREFIX}RFProd2`, price: 500, pricePaise: 50000, categoryId },
    });
    productId2 = prod2.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}RFStore`, address: 'Test', latitude: 77.777, longitude: 77.777, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId: productId1, quantity: 20 } });
    await prisma.inventory.create({ data: { storeId, productId: productId2, quantity: 20 } });
    const addr = await prisma.customerAddress.create({
      data: {
        userId: customerId,
        recipientName: 'RF Customer', phoneE164: '+919999999993',
        line1: '123 RF St', city: 'Testville', state: 'TS', pincode: '123456',
        latitude: 77.777, longitude: 77.777,
      },
    });
    addressId = addr.id;
  });

  it('captured payment cancellation should create refund record', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId: productId1, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.ONLINE as any,
    });

    const paymentsService = new PaymentsService();
    await paymentsService.captureSimulatedPayment(customerId, order.id);

    const orderService = new OrderService(createTrackingGatewayMock() as any, new RefundsService());
    await orderService.cancelMyOrder(customerId, order.id);

    const refund = await prisma.refund.findFirst({
      where: { orderId: order.id },
    });
    expect(refund).not.toBeNull();
    expect(refund!.amountPaise).toBe(order.grandTotalPaise);
    expect(refund!.status).toBe('PENDING');
    expect(refund!.reason).toContain('captured');

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(payment!.status).toBe('REFUND_PENDING');
  });

  it('COD cancellation should NOT create refund', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId: productId2, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.COD as any,
    });

    const orderService = new OrderService(createTrackingGatewayMock() as any, new RefundsService());
    await orderService.cancelMyOrder(customerId, order.id);

    const refund = await prisma.refund.findFirst({
      where: { orderId: order.id },
    });
    expect(refund).toBeNull();

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(payment!.status).toBe('PENDING_COD');
  });

  it('refund larger than captured amount is rejected', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );
    const paymentsService = new PaymentsService();
    const refundsService = new RefundsService();

    const prod = await prisma.product.create({
      data: { name: `${TEST_PREFIX}RLCProd`, price: 400, pricePaise: 40000, categoryId },
    });
    await prisma.inventory.create({ data: { storeId, productId: prod.id, quantity: 10 } });

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId: prod.id, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.ONLINE as any,
    });
    await paymentsService.captureSimulatedPayment(customerId, order.id);

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(payment).not.toBeNull();

    const capturedPaise = payment!.amountPaise;

    await expect(
      refundsService.createRefundForPayment({
        orderId: order.id,
        paymentId: payment!.id,
        amountPaise: capturedPaise + 1,
        reason: 'Test - should exceed',
        requestedByUserId: customerId,
      }),
    ).rejects.toThrow('exceed captured amount');
  });

  it('multiple refunds cannot exceed captured payment amount', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );
    const paymentsService = new PaymentsService();
    const refundsService = new RefundsService();

    // Create a fresh order for this test
    const prod = await prisma.product.create({
      data: { name: `${TEST_PREFIX}MRProd`, price: 1000, pricePaise: 100000, categoryId },
    });
    await prisma.inventory.create({ data: { storeId, productId: prod.id, quantity: 10 } });

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId: prod.id, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.ONLINE as any,
    });
    await paymentsService.captureSimulatedPayment(customerId, order.id);

    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(payment).not.toBeNull();

    const capturedPaise = payment!.amountPaise;
    const halfPaise = Math.floor(capturedPaise / 2);

    // First refund of half should succeed
    await refundsService.createRefundForPayment({
      orderId: order.id,
      paymentId: payment!.id,
      amountPaise: halfPaise,
      reason: 'Partial refund 1',
      requestedByUserId: customerId,
    });

    // Second refund of the remaining half should succeed
    await refundsService.createRefundForPayment({
      orderId: order.id,
      paymentId: payment!.id,
      amountPaise: capturedPaise - halfPaise,
      reason: 'Partial refund 2',
      requestedByUserId: customerId,
    });

    // Third refund should fail - no remaining captured amount
    await expect(
      refundsService.createRefundForPayment({
        orderId: order.id,
        paymentId: payment!.id,
        amountPaise: 1,
        reason: 'Should exceed',
        requestedByUserId: customerId,
      }),
    ).rejects.toThrow('exceed captured amount');
  });

  it('duplicate cancellation cannot create duplicate refund', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );
    const paymentsService = new PaymentsService();

    const prod = await prisma.product.create({
      data: { name: `${TEST_PREFIX}DRProd`, price: 200, pricePaise: 20000, categoryId },
    });
    await prisma.inventory.create({ data: { storeId, productId: prod.id, quantity: 10 } });

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId: prod.id, quantity: 1 }],
      addressId,
      paymentMethod: PaymentMethod.ONLINE as any,
    });
    await paymentsService.captureSimulatedPayment(customerId, order.id);

    const orderService = new OrderService(
      createTrackingGatewayMock() as any,
      new RefundsService(),
    );

    // First cancellation should succeed
    await orderService.cancelMyOrder(customerId, order.id);

    const refunds = await prisma.refund.findMany({ where: { orderId: order.id } });
    expect(refunds.length).toBe(1);

    // Second cancellation attempt should fail (order already CANCELLED)
    await expect(
      orderService.cancelMyOrder(customerId, order.id),
    ).rejects.toThrow('can no longer be cancelled');
  });
});

describe('Phase 2: Inventory regression', () => {
  let categoryId: string;
  let productId: string;
  let storeId: string;
  let ownerId: string;
  let customerId: string;
  let addressId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ir_owner@test.com`, role: 'STORE_OWNER', name: 'IR Owner' },
    });
    ownerId = owner.id;
    const customer = await prisma.user.create({
      data: { email: `${TEST_PREFIX}ir_customer@test.com`, role: 'CUSTOMER', name: 'IR Customer' },
    });
    customerId = customer.id;
    const cat = await prisma.category.create({ data: { name: `${TEST_PREFIX}IRCat` } });
    categoryId = cat.id;
    const prod = await prisma.product.create({
      data: { name: `${TEST_PREFIX}IRProd`, price: 100, pricePaise: 10000, categoryId },
    });
    productId = prod.id;
    const store = await prisma.store.create({
      data: { name: `${TEST_PREFIX}IRStore`, address: 'Test', latitude: 66.666, longitude: 66.666, ownerId },
    });
    storeId = store.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 15 } });
    const addr = await prisma.customerAddress.create({
      data: {
        userId: customerId,
        recipientName: 'IR Customer', phoneE164: '+919999999994',
        line1: '123 IR St', city: 'Testville', state: 'TS', pincode: '123456',
        latitude: 66.666, longitude: 66.666,
      },
    });
    addressId = addr.id;
  });

  it('checkout should create CHECKOUT_RESERVATION ledger', async () => {

    const checkoutService = new CheckoutService(
      createTrackingGatewayMock() as any,
      createNotificationServiceMock() as any,
    );

    const invBefore = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(invBefore!.quantity).toBe(15);

    const order = await checkoutService.placeOrder(customerId, {
      items: [{ productId, quantity: 3 }],
      addressId,
      paymentMethod: PaymentMethod.COD as any,
    });

    const invAfter = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(invAfter!.quantity).toBe(12);

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { storeId, productId, reason: 'CHECKOUT_RESERVATION' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.orderId).toBe(order.id);
    expect(ledger!.quantityDelta).toBe(-3);
  });

  it('cancellation should restore inventory and create ORDER_CANCEL_RESTORE ledger', async () => {
    const invBefore = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });

    const order = await prisma.order.findFirst({
      where: { customerId, storeId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
    expect(order).not.toBeNull();

    const orderService = new OrderService(createTrackingGatewayMock() as any, new RefundsService());
    await orderService.cancelMyOrder(customerId, order!.id);

    const invAfter = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
    });
    expect(invAfter!.quantity).toBe(invBefore!.quantity + (order!.items[0]?.quantity ?? 0));

    const ledger = await prisma.inventoryLedger.findFirst({
      where: { storeId, productId, reason: 'ORDER_CANCEL_RESTORE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger).not.toBeNull();
    expect(ledger!.orderId).toBe(order!.id);
    expect(ledger!.quantityDelta).toBe(order!.items[0]?.quantity);
  });
});
