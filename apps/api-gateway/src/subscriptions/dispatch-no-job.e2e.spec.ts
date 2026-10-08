import { prisma, Role } from '@aagam/database';
import { StoreMilkGridService } from './store-milk-grid.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/**
 * Regression: dispatching a subscription delivery that has no DeliveryJob yet
 * (a fresh manual subscription whose day is still SCHEDULED) must mint the
 * order/job and attach the run stop. It used to 500 inside the transaction.
 */
const PREFIX = '_test_dispatch_no_job_';

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const subs = await prisma.customerSubscription.findMany({ where: { customerId: { in: userIds } }, select: { id: true } });
  const subIds = subs.map((s) => s.id);
  const deliveries = await prisma.subscriptionDelivery.findMany({ where: { subscriptionId: { in: subIds } }, select: { id: true, deliveryJobId: true } });
  const jobIds = deliveries.map((d) => d.deliveryJobId).filter((x): x is string => Boolean(x));
  const runs = await prisma.deliveryRun.findMany({ where: { storeId: { in: (await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } })).map((s) => s.id) } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: (await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } })).map((s) => s.id) } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  await prisma.deliveryRunStop.deleteMany({ where: { deliveryRunId: { in: runs.map((r) => r.id) } } });
  await prisma.deliveryRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
  await prisma.codLedger.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.subscriptionDelivery.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.customerSubscription.deleteMany({ where: { id: { in: subIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.subscriptionPlanVersion.deleteMany({ where: { plan: { code: { contains: PREFIX } } } });
  await prisma.subscriptionPlan.deleteMany({ where: { code: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.store.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe('dispatchToRider — no-job delivery regression', () => {
  const service = new StoreMilkGridService({} as any, new SubscriptionLifecycleService(), {} as any);

  beforeAll(cleanup);
  afterAll(cleanup);

  test('mints an order + job for a delivery that has neither', async () => {
    const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER } });
    const customer = await prisma.user.create({ data: { email: `${PREFIX}customer@test.com`, role: Role.CUSTOMER, name: 'QA' } });
    const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider@test.com`, role: Role.RIDER, name: 'QA Rider' } });
    const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, approvalStatus: 'APPROVED', status: 'ONLINE' } });
    const store = await prisma.store.create({ data: { name: `${PREFIX}store`, address: 'x', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
    const address = await prisma.customerAddress.create({
      data: { userId: customer.id, recipientName: 'QA', phoneE164: '9000000000', line1: '1', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
    });
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: `${PREFIX}plan`, internalName: 'QA plan', name: 'QA plan', status: 'ACTIVE',
        fundingCycle: 'FULL_PLAN', durationDays: 7, totalDeliveries: 7, deliveryFrequency: 'DAILY',
        pricePaise: 10500, mrpPaise: 10500, defaultWindowStartMinute: 360, defaultWindowEndMinute: 540,
        proofPolicy: {}, createdById: owner.id, updatedById: owner.id,
      },
    });
    const version = await prisma.subscriptionPlanVersion.create({
      data: {
        planId: plan.id, version: 1, pricePaise: 10500, mrpPaise: 10500, totalDeliveries: 7, durationDays: 7,
        fundingCycle: 'FULL_PLAN', deliveryFrequency: 'DAILY', itemsSnapshot: [], deliveryRulesSnapshot: {},
        proofPolicySnapshot: {}, applicabilitySnapshot: {}, fullSnapshot: {}, createdById: owner.id,
      },
    });
    const sub = await prisma.customerSubscription.create({
      data: {
        customerId: customer.id, planId: plan.id, planVersionId: version.id, addressId: address.id, homeStoreId: store.id,
        status: 'PENDING_CASH_COLLECTION', startDate: new Date('2026-10-08'), endDate: new Date('2026-10-15'),
        deliveryWindowStartMinute: 360, deliveryWindowEndMinute: 540, deliveryMethod: 'PERSONAL_HANDOVER',
        priceSnapshot: {}, itemsSnapshot: [], addressSnapshot: {}, policySnapshot: {}, amountDuePaise: 10500, fundingCycle: 'FULL_PLAN',
      },
    });
    const delivery = await prisma.subscriptionDelivery.create({
      data: {
        subscriptionId: sub.id, serviceDate: new Date('2026-10-08'), sequenceNumber: 1, deliverySlot: 'AM',
        status: 'SCHEDULED', generationKey: `${PREFIX}gen-1`, proofMode: 'PERSONAL_OTP_GPS', cashDuePaise: 0,
      },
    });

    const result = await service.dispatchToRider({ id: owner.id, role: Role.STORE_OWNER }, {
      deliveryIds: [delivery.id], riderProfileId: rider.id, slot: 'AM',
    });

    expect(result.success).toBe(true);
    const updated = await prisma.subscriptionDelivery.findUnique({ where: { id: delivery.id } });
    expect(updated?.status).toBe('ASSIGNED');
    expect(updated?.deliveryJobId).toBeTruthy();
    const stop = await prisma.deliveryRunStop.findUnique({ where: { subscriptionDeliveryId: delivery.id } });
    expect(stop).toBeTruthy();
  });
});
