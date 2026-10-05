import { prisma, Role } from '@aagam/database';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/**
 * Regression: skipping the only delivery on a route must not leave the run
 * pinning the rider BUSY.
 *
 * The teardown cancelled the run stop and recomputed the counters, but left the
 * now-empty run at READY_FOR_PICKUP. Both the admin workload and the occupancy
 * reconcile count any non-terminal run with a positive totalStopCount, so the
 * rider stayed BUSY with nothing to deliver until a later heartbeat happened to
 * release them. The teardown now cancels the emptied run and reconciles the
 * rider in the same transaction.
 */
const PREFIX = '_test_skip_frees_rider_';

async function cleanup() {
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const jobs = await prisma.deliveryJob.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const subs = await prisma.customerSubscription.findMany({ where: { customerId: { in: userIds } }, select: { id: true } });
  const subIds = subs.map((s) => s.id);
  const runs = await prisma.deliveryRun.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  await prisma.deliveryRunStop.deleteMany({ where: { deliveryRunId: { in: runs.map((r) => r.id) } } });
  await prisma.deliveryRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
  await prisma.subscriptionDelivery.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customerSubscription.deleteMany({ where: { id: { in: subIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.subscriptionPlanVersion.deleteMany({ where: { plan: { code: { contains: PREFIX } } } });
  await prisma.subscriptionPlan.deleteMany({ where: { code: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.store.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

let seedSeq = 0;
async function seed() {
  const tag = `${PREFIX}${++seedSeq}`;
  const owner = await prisma.user.create({ data: { email: `${tag}owner@test.com`, role: Role.STORE_OWNER } });
  const customer = await prisma.user.create({ data: { email: `${tag}customer@test.com`, role: Role.CUSTOMER, name: 'QA' } });
  const riderUser = await prisma.user.create({ data: { email: `${tag}rider@test.com`, role: Role.RIDER, name: 'QA Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, approvalStatus: 'APPROVED', status: 'BUSY' } });
  const store = await prisma.store.create({ data: { name: `${tag}store`, address: 'x', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  const address = await prisma.customerAddress.create({
    data: { userId: customer.id, recipientName: 'QA', phoneE164: '9000000000', line1: '1', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
  });
  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: `${tag}plan`, internalName: 'QA plan', name: 'QA plan', status: 'ACTIVE',
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
      status: 'ACTIVE', startDate: new Date('2026-10-08'), endDate: new Date('2026-10-15'),
      deliveryWindowStartMinute: 360, deliveryWindowEndMinute: 540, deliveryMethod: 'PERSONAL_HANDOVER',
      priceSnapshot: {}, itemsSnapshot: [], addressSnapshot: {}, policySnapshot: {},
      amountDuePaise: 10500, amountCollectedPaise: 0, fundingCycle: 'FULL_PLAN',
    },
  });
  const order = await prisma.order.create({
    data: { storeId: store.id, customerId: customer.id, status: 'RIDER_ASSIGNED', totalAmount: 105, orderSource: 'SUBSCRIPTION' },
  });
  const job = await prisma.deliveryJob.create({
    data: { orderId: order.id, status: 'RIDER_AT_STORE', currentRiderId: rider.id },
  });
  const delivery = await prisma.subscriptionDelivery.create({
    data: {
      subscriptionId: sub.id, serviceDate: new Date('2026-10-08'), sequenceNumber: 1, deliverySlot: 'AM',
      status: 'ASSIGNED', generationKey: `${tag}gen`, proofMode: 'RIDER_PHOTO_GPS',
      cashDuePaise: 10500, deliveryJobId: job.id, storeId: store.id,
    },
  });
  const run = await prisma.deliveryRun.create({
    data: {
      routeCode: `${tag}run`, storeId: store.id, riderId: rider.id, serviceDate: new Date('2026-10-08'),
      slotStart: new Date('2026-10-08T05:00:00Z'), slotEnd: new Date('2026-10-08T09:00:00Z'), deliveryCluster: 'QA',
      status: 'READY_FOR_PICKUP', expectedBagCount: 1, packedBagCount: 1, totalStopCount: 1,
    },
  });
  await prisma.deliveryRunStop.create({
    data: { deliveryRunId: run.id, subscriptionDeliveryId: delivery.id, deliveryJobId: job.id, sequenceNumber: 1, status: 'READY', proofMode: 'RIDER_PHOTO_GPS', expectedItemCount: 1 },
  });
  return { rider, run, delivery };
}

describe('subscription skip — emptied run frees the rider', () => {
  const service = new SubscriptionLifecycleService();

  beforeAll(cleanup);
  afterAll(cleanup);

  test('cancels the emptied run and releases the BUSY rider', async () => {
    const { rider, run, delivery } = await seed();

    await prisma.$transaction((tx) =>
      service.cancelRiderArtifactsWithinTransaction(tx, delivery.id, 'skipped by store'),
    );

    const runAfter = await prisma.deliveryRun.findUnique({ where: { id: run.id } });
    expect(runAfter?.status).toBe('CANCELLED');

    const riderAfter = await prisma.riderProfile.findUnique({ where: { id: rider.id } });
    expect(riderAfter?.status).toBe('ONLINE');
  });
});
