import { prisma, Role } from '@aagam/database';
import { CustomerSubscriptionService } from './customer-subscription.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { SubscriptionServiceabilityService } from './subscription-serviceability.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { StoreMilkGridService } from './store-milk-grid.service';

/**
 * Regression: cancelling a subscription must tear down the rider artifacts of
 * its non-terminal deliveries, not only flip the delivery rows. Cancel used to
 * update SubscriptionDelivery.status alone, so a delivery that had already been
 * dispatched kept a READY run stop and a live order/job after the customer
 * cancelled - the same grid-vs-rider split the skip and pause paths guard.
 */
const PREFIX = '_test_cancel_teardown_';

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const subs = await prisma.customerSubscription.findMany({ where: { customerId: { in: userIds } }, select: { id: true } });
  const subIds = subs.map((s) => s.id);
  const deliveries = await prisma.subscriptionDelivery.findMany({ where: { subscriptionId: { in: subIds } }, select: { id: true, deliveryJobId: true } });
  const jobIds = deliveries.map((d) => d.deliveryJobId).filter((x): x is string => Boolean(x));
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const runs = await prisma.deliveryRun.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  await prisma.codLedger.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.deliveryRunStop.deleteMany({ where: { deliveryRunId: { in: runs.map((r) => r.id) } } });
  await prisma.deliveryRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
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

async function seed(tag: string) {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}${tag}owner@test.com`, role: Role.STORE_OWNER } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}${tag}customer@test.com`, role: Role.CUSTOMER, name: 'QA' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}${tag}rider@test.com`, role: Role.RIDER, name: 'QA Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, approvalStatus: 'APPROVED', status: 'ONLINE' } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}${tag}store`, address: 'x', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  const address = await prisma.customerAddress.create({
    data: { userId: customer.id, recipientName: 'QA', phoneE164: '9000000002', line1: '1', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
  });
  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: `${PREFIX}${tag}plan`, internalName: 'QA plan', name: 'QA plan', status: 'ACTIVE',
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
      status: 'PENDING_CASH_COLLECTION', startDate: new Date('2026-10-08'), endDate: new Date('2026-10-14'),
      deliveryWindowStartMinute: 360, deliveryWindowEndMinute: 540, deliveryMethod: 'PERSONAL_HANDOVER',
      priceSnapshot: {}, itemsSnapshot: [], addressSnapshot: {}, policySnapshot: {}, amountDuePaise: 73500, fundingCycle: 'FULL_PLAN',
    },
  });
  const deliveries = [];
  for (let i = 0; i < 7; i++) {
    deliveries.push(await prisma.subscriptionDelivery.create({
      data: {
        subscriptionId: sub.id, serviceDate: new Date(Date.UTC(2026, 9, 8 + i)), sequenceNumber: i + 1, deliverySlot: 'AM',
        status: 'SCHEDULED', generationKey: `${PREFIX}${tag}gen-${i + 1}`, proofMode: 'PERSONAL_OTP_GPS', cashDuePaise: 10500,
      },
    }));
  }
  return { owner, customer, rider, sub, deliveries };
}

describe('customer cancel — rider artifact teardown', () => {
  const lifecycle = new SubscriptionLifecycleService();
  const service = new CustomerSubscriptionService(
    new SubscriptionCalendarService(),
    new SubscriptionServiceabilityService(new SubscriptionCalendarService()),
    lifecycle,
  );
  const grid = new StoreMilkGridService({} as any, lifecycle, {} as any);
  const reporting = new SubscriptionAdminReportingService(new SubscriptionCashFundingService(new SubscriptionCalendarService()));

  beforeAll(cleanup);
  afterAll(cleanup);

  test('cancelling a subscription cancels the dispatched run stop, job and order', async () => {
    const { owner, customer, rider, sub, deliveries } = await seed("c");

    const dispatched = await grid.dispatchToRider(
      { id: owner.id, role: Role.STORE_OWNER },
      { deliveryIds: [deliveries[0].id, deliveries[1].id], riderProfileId: rider.id, slot: 'AM' },
    );
    expect(dispatched.success).toBe(true);

    const stopBefore = await prisma.deliveryRunStop.findUnique({ where: { subscriptionDeliveryId: deliveries[0].id } });
    expect(stopBefore?.status).toBe('READY');

    await service.cancel(customer.id, sub.id, { reason: 'customer changed mind' });

    for (const d of deliveries) {
      const after = await prisma.subscriptionDelivery.findUnique({ where: { id: d.id } });
      expect(after?.status).toBe('CANCELLED');
    }

    const stopAfter = await prisma.deliveryRunStop.findUnique({ where: { subscriptionDeliveryId: deliveries[0].id } });
    expect(stopAfter?.status).toBe('CANCELLED');

    const dispatchedJobId = (await prisma.subscriptionDelivery.findUnique({ where: { id: deliveries[0].id } }))?.deliveryJobId;
    expect(dispatchedJobId).toBeTruthy();
    const job = await prisma.deliveryJob.findUnique({ where: { id: dispatchedJobId! } });
    expect(job?.status).toBe('CANCELLED');

    const order = await prisma.order.findFirst({ where: { subscriptionDeliveryId: deliveries[0].id } });
    expect(order?.status).toBe('CANCELLED');

    const run = await prisma.deliveryRun.findUnique({ where: { id: stopBefore!.deliveryRunId } });
    // Each service date gets its own run here, so the counter reflects the one
    // stop on this run (the row survives as CANCELLED history).
    expect(run?.totalStopCount).toBe(1);
  });

  test('store-owner cancel tears down the dispatched rider artifacts too', async () => {
    const { owner, rider, sub, deliveries } = await seed("s");

    const dispatched = await grid.dispatchToRider(
      { id: owner.id, role: Role.STORE_OWNER },
      { deliveryIds: [deliveries[0].id], riderProfileId: rider.id, slot: 'AM' },
    );
    expect(dispatched.success).toBe(true);

    const stopBefore = await prisma.deliveryRunStop.findUnique({ where: { subscriptionDeliveryId: deliveries[0].id } });
    expect(stopBefore?.status).toBe('READY');

    await reporting.cancelSubscription(sub.id, 'store cancelled', owner.id, Role.STORE_OWNER);

    const stopAfter = await prisma.deliveryRunStop.findUnique({ where: { subscriptionDeliveryId: deliveries[0].id } });
    expect(stopAfter?.status).toBe('CANCELLED');

    const dispatchedJobId = (await prisma.subscriptionDelivery.findUnique({ where: { id: deliveries[0].id } }))?.deliveryJobId;
    expect(dispatchedJobId).toBeTruthy();
    expect((await prisma.deliveryJob.findUnique({ where: { id: dispatchedJobId! } }))?.status).toBe('CANCELLED');
    expect((await prisma.order.findFirst({ where: { subscriptionDeliveryId: deliveries[0].id } }))?.status).toBe('CANCELLED');
  });
});
