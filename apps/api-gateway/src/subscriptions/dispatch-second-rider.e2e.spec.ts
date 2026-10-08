import { prisma, Role } from '@aagam/database';
import { StoreMilkGridService } from './store-milk-grid.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

/**
 * Regression (BUG-013/014): a store must be able to put a second rider on a
 * store/date/slot and to reassign a stop from one rider to another. The
 * DeliveryRun unique key used to exclude the rider, so creating the second
 * rider's run collided with the first and the whole dispatch rolled back with an
 * opaque HTTP 500.
 */
const PREFIX = '_test_dispatch_second_rider_';

async function cleanup() {
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const runs = await prisma.deliveryRun.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const jobs = await prisma.deliveryJob.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const subs = await prisma.customerSubscription.findMany({ where: { customerId: { in: userIds } }, select: { id: true } });
  const subIds = subs.map((s) => s.id);
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

async function seed() {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer@test.com`, role: Role.CUSTOMER, name: 'QA' } });
  const customer2 = await prisma.user.create({ data: { email: `${PREFIX}customer2@test.com`, role: Role.CUSTOMER, name: 'QA2' } });
  const riderAUser = await prisma.user.create({ data: { email: `${PREFIX}riderA@test.com`, role: Role.RIDER, name: 'QA Rider A' } });
  const riderBUser = await prisma.user.create({ data: { email: `${PREFIX}riderB@test.com`, role: Role.RIDER, name: 'QA Rider B' } });
  const riderA = await prisma.riderProfile.create({ data: { userId: riderAUser.id, approvalStatus: 'APPROVED', status: 'ONLINE' } });
  const riderB = await prisma.riderProfile.create({ data: { userId: riderBUser.id, approvalStatus: 'APPROVED', status: 'ONLINE' } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store`, address: 'x', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  const address = await prisma.customerAddress.create({
    data: { userId: customer.id, recipientName: 'QA', phoneE164: '9000000000', line1: '1', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
  });
  const address2 = await prisma.customerAddress.create({
    data: { userId: customer2.id, recipientName: 'QA2', phoneE164: '9000000001', line1: '2', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
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
  const mkSub = (customerId: string, addressId: string) => prisma.customerSubscription.create({
    data: {
      customerId, planId: plan.id, planVersionId: version.id, addressId, homeStoreId: store.id,
      status: 'ACTIVE', startDate: new Date('2026-10-16'), endDate: new Date('2026-10-23'),
      deliveryWindowStartMinute: 360, deliveryWindowEndMinute: 540, deliveryMethod: 'PERSONAL_HANDOVER',
      priceSnapshot: {}, itemsSnapshot: [], addressSnapshot: {}, policySnapshot: {}, amountDuePaise: 0, fundingCycle: 'FULL_PLAN',
    },
  });
  const sub1 = await mkSub(customer.id, address.id);
  const sub2 = await mkSub(customer2.id, address2.id);
  const d1 = await prisma.subscriptionDelivery.create({
    data: { subscriptionId: sub1.id, serviceDate: new Date('2026-10-16'), sequenceNumber: 1, deliverySlot: 'AM', status: 'SCHEDULED', generationKey: `${PREFIX}gen-1`, proofMode: 'PERSONAL_OTP_GPS', cashDuePaise: 0 },
  });
  const d2 = await prisma.subscriptionDelivery.create({
    data: { subscriptionId: sub2.id, serviceDate: new Date('2026-10-16'), sequenceNumber: 1, deliverySlot: 'AM', status: 'SCHEDULED', generationKey: `${PREFIX}gen-2`, proofMode: 'PERSONAL_OTP_GPS', cashDuePaise: 0 },
  });
  return { owner, riderA, riderB, d1, d2 };
}

describe('dispatchToRider — second rider on the same store/date/slot', () => {
  const service = new StoreMilkGridService({} as any, new SubscriptionLifecycleService(), {} as any);

  beforeAll(cleanup);
  afterAll(cleanup);

  test('dispatches a second delivery to a different rider on the same slot, then reassigns', async () => {
    const { owner, riderA, riderB, d1, d2 } = await seed();
    const actor = { id: owner.id, role: Role.STORE_OWNER };

    await service.dispatchToRider(actor, { deliveryIds: [d1.id], riderProfileId: riderA.id, slot: 'AM' });
    // This is the call that used to 500: a second rider needs their own run for
    // the same store/date/slot.
    await service.dispatchToRider(actor, { deliveryIds: [d2.id], riderProfileId: riderB.id, slot: 'AM' });

    const stop1 = await prisma.deliveryRunStop.findUnique({ where: { subscriptionDeliveryId: d1.id }, include: { deliveryRun: true } });
    const stop2 = await prisma.deliveryRunStop.findUnique({ where: { subscriptionDeliveryId: d2.id }, include: { deliveryRun: true } });
    expect(stop1?.deliveryRun.riderId).toBe(riderA.id);
    expect(stop2?.deliveryRun.riderId).toBe(riderB.id);

    // Reassign d1 from rider A to rider B (BUG-014) — must not 500, must move.
    await service.dispatchToRider(actor, { deliveryIds: [d1.id], riderProfileId: riderB.id, slot: 'AM' });
    const moved = await prisma.deliveryRunStop.findUnique({ where: { subscriptionDeliveryId: d1.id }, include: { deliveryRun: true } });
    expect(moved?.deliveryRun.id).toBe(stop2?.deliveryRun.id);
    expect(moved?.deliveryRun.riderId).toBe(riderB.id);
  });
});
