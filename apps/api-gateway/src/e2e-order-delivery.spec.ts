import { OrderStatus, PaymentMethod, PaymentStatus, Role, prisma } from '@aagam/database';
import { CheckoutService } from './checkout/checkout.service';
import { OrderService } from './orders/order.service';
import { TrackingService } from './tracking/tracking.service';
import { RefundsService } from './payments/refunds.service';

const PREFIX = '_test_phase5e2e_';

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map(u => u.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map(s => s.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ storeId: { in: storeIds } }, { customerId: { in: userIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map(o => o.id);

  await prisma.riderLocationPing.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ storeId: { in: storeIds } }, { orderId: { in: orderIds } }] } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.store.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: PREFIX } } });
}

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

function createNotificationServiceMock() {
  return { sendNewOrderAlert: jest.fn() };
}

describe('Phase 5 E2E: Complete Order-to-Delivery Workflow', () => {
  let customer: any;
  let customerAddress: any;
  let storeOwner: any;
  let store: any;
  let category: any;
  let product: any;
  let admin: any;
  let riderUser: any;
  let riderProfile: any;

  beforeAll(async () => {
    await cleanup();

    customer = await prisma.user.create({
      data: { email: `${PREFIX}customer@test.com`, name: 'E2E Customer', role: Role.CUSTOMER, phone: '+919000000001' },
    });
    customerAddress = await prisma.customerAddress.create({
      data: {
        userId: customer.id, recipientName: 'E2E Customer', phoneE164: '+919000000001',
        line1: '123 Test Lane', city: 'Bangalore', state: 'Karnataka', pincode: '560001',
        latitude: 12.9716, longitude: 77.5946,
      },
    });
    storeOwner = await prisma.user.create({
      data: { email: `${PREFIX}owner@test.com`, name: 'E2E Store Owner', role: Role.STORE_OWNER },
    });
    store = await prisma.store.create({
      data: { name: `${PREFIX}store`, address: '456 Store Road', latitude: 12.9352, longitude: 77.6245, ownerId: storeOwner.id },
    });
    category = await prisma.category.create({ data: { name: `${PREFIX}category` } });
    product = await prisma.product.create({
      data: { name: `${PREFIX}product`, description: 'E2E test product', price: 250, pricePaise: 25000, categoryId: category.id },
    });
    await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 50 } });
    admin = await prisma.user.create({
      data: { email: `${PREFIX}admin@test.com`, name: 'E2E Admin', role: Role.ADMIN },
    });
    riderUser = await prisma.user.create({
      data: { email: `${PREFIX}rider@test.com`, name: 'E2E Rider', role: Role.RIDER, phone: '+919000000002' },
    });
    riderProfile = await prisma.riderProfile.create({ data: { userId: riderUser.id } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('complete workflow: customer order → store prepare → assign rider → rider deliver', async () => {
    const mockGateway = createTrackingGatewayMock();
    const mockNotification = createNotificationServiceMock();
    const refundService = new RefundsService();
    const checkoutService = new CheckoutService(mockGateway as any, mockNotification as any);
    const orderService = new OrderService(mockGateway as any, refundService);
    const trackingService = new TrackingService(mockGateway as any, orderService);

    // ── STEP 1: Customer quotes order ──
    const quote = await checkoutService.quote(customer.id, {
      items: [{ productId: product.id, quantity: 2 }],
      addressId: customerAddress.id,
    });
    expect(quote.serviceable).toBe(true);
    expect(quote.store?.id).toBe(store.id);
    expect(quote.invoice.subtotal).toBe(500);
    expect(quote.invoice.items[0].quantity).toBe(2);

    // ── STEP 2: Customer places order (COD) ──
    const order = await checkoutService.placeOrder(customer.id, {
      items: [{ productId: product.id, quantity: 2 }],
      addressId: customerAddress.id,
      paymentMethod: PaymentMethod.COD,
    }, `e2e-${Date.now()}`);
    expect(order).toBeDefined();
    expect(order.id).toBeDefined();
    expect(order.status).toBe('CONFIRMED');
    expect(order.grandTotal).toBeGreaterThan(0);

    // ── STEP 3: Verify order snapshot ──
    const fullOrder = await prisma.order.findUnique({ where: { id: order.id }, include: { payment: true, items: true } });
    expect(fullOrder).not.toBeNull();
    expect(fullOrder!.customerSnapshot).toBeDefined();
    expect(fullOrder!.addressSnapshot).toBeDefined();
    expect(fullOrder!.pricingSnapshot).toBeDefined();
    expect(fullOrder!.itemsSnapshot).toBeDefined();
    expect(fullOrder!.payment).not.toBeNull();
    expect(fullOrder!.payment!.method).toBe('COD');
    expect(fullOrder!.payment!.status).toBe('PENDING_COD');
    expect(fullOrder!.items.length).toBe(1);
    expect(fullOrder!.items[0].quantity).toBe(2);

    // ── STEP 4: Verify inventory decremented ──
    const inv = await prisma.inventory.findUnique({ where: { storeId_productId: { storeId: store.id, productId: product.id } } });
    expect(inv!.quantity).toBe(48);

    // ── STEP 5: Verify status history ──
    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].toStatus).toBe('CONFIRMED');

    // ── STEP 6: Store owner confirms (already confirmed by COD) ──
    const confirmed = await orderService.updateStatus(order.id, OrderStatus.CONFIRMED, { id: storeOwner.id, role: Role.STORE_OWNER });
    expect(confirmed.status).toBe('CONFIRMED');

    // ── STEP 7: Store owner marks PICKING ──
    const picking = await orderService.updateStatus(order.id, OrderStatus.PICKING, { id: storeOwner.id, role: Role.STORE_OWNER });
    expect(picking.status).toBe('PICKING');
    expect(picking.pickingAt).not.toBeNull();

    // ── STEP 8: Store owner marks PACKED ──
    const packed = await orderService.updateStatus(order.id, OrderStatus.PACKED, { id: storeOwner.id, role: Role.STORE_OWNER });
    expect(packed.status).toBe('PACKED');
    expect(packed.packedAt).not.toBeNull();

    // ── STEP 9: Admin assigns rider ──
    const assigned = await orderService.updateStatus(order.id, OrderStatus.RIDER_ASSIGNED, { id: admin.id, role: Role.ADMIN }, riderProfile.id);
    expect(assigned.status).toBe('RIDER_ASSIGNED');
    expect(assigned.riderId).toBe(riderProfile.id);
    expect(assigned.riderAssignedAt).not.toBeNull();

    // ── STEP 10: Verify tracking state ASSIGNED_NO_LOCATION ──
    const tracking1 = await trackingService.getOrderTracking(order.id);
    expect(tracking1.tracking.trackingState).toBe('ASSIGNED_NO_LOCATION');
    expect(tracking1.tracking.isStale).toBe(true);

    // ── STEP 11: Customer can access own tracking ──
    const custTracking = await trackingService.getMyOrderTracking(order.id, customer.id);
    expect(custTracking.order.id).toBe(order.id);

    // ── STEP 12: Another customer cannot access ──
    const otherCustomer = await prisma.user.create({
      data: { email: `${PREFIX}other@test.com`, name: 'Other', role: Role.CUSTOMER },
    });
    await expect(trackingService.getMyOrderTracking(order.id, otherCustomer.id)).rejects.toThrow('Not allowed');

    // ── STEP 13: Commercial state moves separately, then tracking session starts ──
    const deliveryStarted = await orderService.updateStatus(
      order.id,
      OrderStatus.OUT_FOR_DELIVERY,
      { id: riderUser.id, role: Role.RIDER },
    );
    expect(deliveryStarted.status).toBe('OUT_FOR_DELIVERY');
    expect(deliveryStarted.outForDeliveryAt).not.toBeNull();

    const trackingSession = await trackingService.startTracking(
      order.id,
      { id: riderUser.id, role: Role.RIDER },
    );
    expect(trackingSession.active).toBe(true);
    expect(trackingSession.status).toBe('OUT_FOR_DELIVERY');
    expect(trackingSession.outForDeliveryAt).not.toBeNull();

    // ── STEP 14: Rider sends location ping 1 (backdate 5s to avoid jump detection) ──
    const ping1Raw = await prisma.riderLocationPing.create({
      data: {
        riderProfileId: riderProfile.id,
        orderId: order.id,
        latitude: 12.9400,
        longitude: 77.6200,
        accuracy: 10,
        speed: 5,
        heading: 45,
        source: 'MOBILE',
        createdAt: new Date(Date.now() - 5000),
      },
    });
    expect(ping1Raw.latitude).toBe(12.9400);

    // ── STEP 15: Rider sends location ping 2 (close to ping 1, valid jump) ──
    const ping2 = await trackingService.ingestRiderLocation(riderUser.id, {
      orderId: order.id,
      latitude: 12.9410,
      longitude: 77.6190,
      accuracy: 8,
      speed: 7,
      heading: 90,
    });
    expect(ping2.latitude).toBe(12.9410);
    expect(mockGateway.emitRiderLocationUpdated).toHaveBeenCalled();

    // ── STEP 16: Verify tracking state LIVE with ETA ──
    const tracking2 = await trackingService.getOrderTracking(order.id);
    expect(tracking2.tracking.trackingState).toBe('LIVE');
    expect(tracking2.tracking.isStale).toBe(false);
    expect(tracking2.tracking.etaMinutes).toBeGreaterThan(0);
    expect(tracking2.tracking.distanceKm).toBeGreaterThanOrEqual(0);
    expect(tracking2.tracking.latestLocation).not.toBeNull();
    expect(tracking2.tracking.lastPingAt).not.toBeNull();
    expect(tracking2.tracking.staleAfterSeconds).toBe(360);

    // ── STEP 17: Another rider cannot ping ──
    const otherRider = await prisma.user.create({
      data: { email: `${PREFIX}other-rider@test.com`, name: 'Other Rider', role: Role.RIDER },
    });
    await prisma.riderProfile.create({ data: { userId: otherRider.id } });
    await expect(trackingService.ingestRiderLocation(otherRider.id, {
      orderId: order.id, latitude: 12.96, longitude: 77.60,
    })).rejects.toThrow('You can only update location for assigned orders');

    // ── STEP 18: Commercial delivery completes, then tracking session stops ──
    const deliveredOrder = await orderService.updateStatus(
      order.id,
      OrderStatus.DELIVERED,
      { id: riderUser.id, role: Role.RIDER },
    );
    expect(deliveredOrder.status).toBe('DELIVERED');
    expect(deliveredOrder.deliveredAt).not.toBeNull();

    const stoppedSession = await trackingService.stopTracking(
      order.id,
      { id: riderUser.id, role: Role.RIDER },
      'DELIVERY_COMPLETED',
    );
    expect(stoppedSession.active).toBe(false);
    expect(stoppedSession.status).toBe('DELIVERED');
    expect(mockGateway.emitTrackingStopped).toHaveBeenCalled();

    // ── STEP 19: Verify delivered state ──
    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder!.status).toBe('DELIVERED');
    expect(finalOrder!.deliveredAt).not.toBeNull();

    // ── STEP 20: Tracking state is DELIVERED ──
    const tracking3 = await trackingService.getOrderTracking(order.id);
    expect(tracking3.tracking.trackingState).toBe('DELIVERED');

    // ── STEP 21: No further location pings accepted ──
    await expect(trackingService.ingestRiderLocation(riderUser.id, {
      orderId: order.id, latitude: 12.97, longitude: 77.59,
    })).rejects.toThrow('Order is not currently live-trackable');

    // ── STEP 22: Cannot transition from DELIVERED ──
    await expect(orderService.updateStatus(order.id, OrderStatus.OUT_FOR_DELIVERY, { id: riderUser.id, role: Role.RIDER }))
      .rejects.toThrow('already DELIVERED');
  }, 30000);
});
