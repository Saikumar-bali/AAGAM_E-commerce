import { PaymentMethod, PaymentStatus, Role, prisma } from '@aagam/database';

const PREFIX = '_test_phase1_payment_notification_';

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((store) => store.id);
  const orders = await prisma.order.findMany({ where: { OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }] }, select: { id: true } });
  const orderIds = orders.map((order) => order.id);

  await prisma.notificationDeliveryAttempt.deleteMany({ where: { recipient: { userId: { in: userIds } } } });
  await prisma.notificationRecipient.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function seedBase() {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer_${suffix}@test.com`, role: Role.CUSTOMER } });
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner_${suffix}@test.com`, role: Role.STORE_OWNER } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}category_${suffix}` } });
  const product = await prisma.product.create({ data: { name: `${PREFIX}product_${suffix}`, price: 100, pricePaise: 10000, categoryId: category.id } });
  const store = await prisma.store.create({
    data: { name: `${PREFIX}store_${suffix}`, address: 'Payment Notification Store', latitude: 17.7, longitude: 83.3, ownerId: owner.id },
  });
  return { customer, owner, product, store };
}

async function createOrder(
  base: Awaited<ReturnType<typeof seedBase>>,
  status: 'CONFIRMED' | 'PAYMENT_PENDING',
  method: PaymentMethod,
) {
  return prisma.order.create({
    data: {
      customerId: base.customer.id,
      storeId: base.store.id,
      status,
      totalAmount: 100,
      subtotal: 100,
      grandTotal: 100,
      subtotalPaise: 10000,
      grandTotalPaise: 10000,
      ...(status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}),
      items: { create: [{ productId: base.product.id, quantity: 1, price: 100, unitPricePaise: 10000, lineTotalPaise: 10000 }] },
      payment: {
        create: {
          method,
          status: method === PaymentMethod.COD ? PaymentStatus.PENDING_COD : PaymentStatus.CREATED,
          provider: method === PaymentMethod.COD ? 'COD' : 'SIMULATED',
          amount: 100,
          amountPaise: 10000,
        },
      },
    },
  });
}

describe('Phase 1 payment-safe order notifications', () => {
  beforeEach(async () => cleanup());
  afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

  it('enqueues COD order placement immediately', async () => {
    const base = await seedBase();
    const order = await createOrder(base, 'CONFIRMED', PaymentMethod.COD);
    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${order.id}:ORDER_PLACED` },
    });
    expect(event?.eventType).toBe('ORDER_PLACED');
    expect((event?.payload as any)?.toStatus).toBe('CONFIRMED');
  });

  it('does not notify store/admin while online payment is pending', async () => {
    const base = await seedBase();
    const order = await createOrder(base, 'PAYMENT_PENDING', PaymentMethod.ONLINE);
    expect(await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${order.id}:ORDER_PLACED` },
    })).toBeNull();
  });

  it('enqueues online order placement atomically when payment capture confirms it', async () => {
    const base = await seedBase();
    const order = await createOrder(base, 'PAYMENT_PENDING', PaymentMethod.ONLINE);

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { orderId: order.id },
        data: { status: PaymentStatus.CAPTURED, verifiedAt: new Date() },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CONFIRMED', confirmedAt: new Date() },
      });
    });

    const event = await prisma.outboxEvent.findUnique({
      where: { idempotencyKey: `order:${order.id}:ORDER_PLACED` },
    });
    expect(event?.eventType).toBe('ORDER_PLACED');
    expect((event?.payload as any)?.fromStatus).toBe('PAYMENT_PENDING');
    expect((event?.payload as any)?.toStatus).toBe('CONFIRMED');
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.id, eventType: 'ORDER_PLACED' } })).toBe(1);
  });
});
