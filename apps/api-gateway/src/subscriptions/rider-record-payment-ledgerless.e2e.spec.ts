import { prisma, Role } from '@aagam/database';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';

/**
 * Regression: recording COD cash from the rider app must never 500.
 *
 *  - When the whole plan is already collected, the subscription-level due is 0
 *    and an incrementing `amountDuePaise: { decrement }` tripped the
 *    CustomerSubscription_money_check constraint.
 *  - When the job has no COD ledger (store-created / admin-reconciled runs),
 *    the code refused the rider's cash outright.
 */
const PREFIX = '_test_rider_cod_no_ledger_';

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
  await prisma.codLedgerEntry.deleteMany({ where: { codLedger: { deliveryJobId: { in: jobIds } } } });
  await prisma.codLedger.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
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
async function seed(opts: { amountDuePaise: number; amountCollectedPaise: number }) {
  const tag = `${PREFIX}${++seedSeq}`;
  const owner = await prisma.user.create({ data: { email: `${tag}owner@test.com`, role: Role.STORE_OWNER } });
  const customer = await prisma.user.create({ data: { email: `${tag}customer@test.com`, role: Role.CUSTOMER, name: 'QA' } });
  const riderUser = await prisma.user.create({ data: { email: `${tag}rider@test.com`, role: Role.RIDER, name: 'QA Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, approvalStatus: 'APPROVED', status: 'ONLINE' } });
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
      amountDuePaise: opts.amountDuePaise, amountCollectedPaise: opts.amountCollectedPaise, fundingCycle: 'FULL_PLAN',
    },
  });
  const order = await prisma.order.create({
    data: { storeId: store.id, customerId: customer.id, status: 'RIDER_ASSIGNED', totalAmount: 105, orderSource: 'SUBSCRIPTION' },
  });
  const job = await prisma.deliveryJob.create({
    data: { orderId: order.id, status: 'OUT_FOR_DELIVERY', currentRiderId: rider.id },
  });
  const delivery = await prisma.subscriptionDelivery.create({
    data: {
      subscriptionId: sub.id, serviceDate: new Date('2026-10-08'), sequenceNumber: 1, deliverySlot: 'AM',
      status: 'OUT_FOR_DELIVERY', generationKey: `${tag}gen`, proofMode: 'RIDER_PHOTO_GPS',
      cashDuePaise: 10500, deliveryJobId: job.id, storeId: store.id,
    },
  });
  const run = await prisma.deliveryRun.create({
    data: {
      routeCode: `${tag}run`, storeId: store.id, riderId: rider.id, serviceDate: new Date('2026-10-08'),
      slotStart: new Date('2026-10-08T05:00:00Z'), slotEnd: new Date('2026-10-08T09:00:00Z'), deliveryCluster: 'QA', status: 'IN_PROGRESS',
      expectedBagCount: 1, packedBagCount: 1,
    },
  });
  const stop = await prisma.deliveryRunStop.create({
    data: { deliveryRunId: run.id, subscriptionDeliveryId: delivery.id, deliveryJobId: job.id, sequenceNumber: 1, status: 'ARRIVED', proofMode: 'RIDER_PHOTO_GPS', expectedItemCount: 1 },
  });
  return { riderUser, sub, job, delivery, run, stop };
}

describe('recordPayment — ledgerless COD stop regression', () => {
  const service = new DeliveryRunOperationsService({} as any, {} as any, {} as any, {} as any);

  beforeAll(cleanup);
  afterAll(cleanup);

  test('opens a COD ledger on first collection instead of refusing cash', async () => {
    const { riderUser, job, delivery, run, stop } = await seed({ amountDuePaise: 10500, amountCollectedPaise: 0 });

    const result = await service.recordPayment(run.id, stop.id, { amountPaise: 10500, paymentMode: 'CASH' }, { id: riderUser.id, role: Role.RIDER });

    expect(result.success).toBe(true);
    const ledger = await prisma.codLedger.findUnique({ where: { deliveryJobId: job.id } });
    expect(ledger).toBeTruthy();
    expect(ledger?.collectedAmountPaise).toBe(10500);
    const updated = await prisma.subscriptionDelivery.findUnique({ where: { id: delivery.id } });
    expect(updated?.cashCollectedPaise).toBe(10500);
  });

  test('rejects over-collection with a clear 400 instead of a constraint 500', async () => {
    const { riderUser, sub, run, stop } = await seed({ amountDuePaise: 0, amountCollectedPaise: 10500 });

    await expect(
      service.recordPayment(run.id, stop.id, { amountPaise: 10500, paymentMode: 'CASH' }, { id: riderUser.id, role: Role.RIDER }),
    ).rejects.toThrow('no outstanding due balance');

    const after = await prisma.customerSubscription.findUnique({ where: { id: sub.id } });
    expect(after?.amountDuePaise).toBe(0);
    expect(after?.amountCollectedPaise).toBe(10500);
  });
});
