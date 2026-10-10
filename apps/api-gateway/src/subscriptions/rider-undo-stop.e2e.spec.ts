import { prisma, Role } from '@aagam/database';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { DeliveryEventService } from '../orders/delivery-event.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';

/**
 * The rider can reopen a stop they closed by mistake. The undo must reverse the
 * funding entitlement, the delivery/order status and any cash the rider
 * recorded, or a single mis-tap would permanently inflate a day's counts.
 */
const PREFIX = '_test_rider_undo_';

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
  const runIds = runs.map((r) => r.id);
  await prisma.riderPhotoProof.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.codLedgerEntry.deleteMany({ where: { codLedger: { deliveryJobId: { in: jobIds } } } });
  await prisma.codLedger.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.deliveryEvent.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.subscriptionAuditEntry.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.deliveryRunStop.deleteMany({ where: { deliveryRunId: { in: runIds } } });
  await prisma.deliveryRun.deleteMany({ where: { id: { in: runIds } } });
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
async function seed(opts: { stopStatus: 'DELIVERED' | 'CANCELLED'; completedDeliveries: number; remainingFunded: number; collectedPaise: number }) {
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
      amountDuePaise: 0, amountCollectedPaise: opts.collectedPaise, fundingCycle: 'FULL_PLAN',
      completedDeliveries: opts.completedDeliveries, remainingFundedDeliveries: opts.remainingFunded,
      skippedDeliveries: opts.stopStatus === 'CANCELLED' ? 1 : 0,
    },
  });
  const delivered = opts.stopStatus === 'DELIVERED';
  const order = await prisma.order.create({
    data: { storeId: store.id, customerId: customer.id, status: delivered ? 'DELIVERED' : 'OUT_FOR_DELIVERY', totalAmount: 105, orderSource: 'SUBSCRIPTION' },
  });
  const job = await prisma.deliveryJob.create({
    data: { orderId: order.id, status: delivered ? 'DELIVERED' : 'RIDER_AT_CUSTOMER', currentRiderId: rider.id },
  });
  const delivery = await prisma.subscriptionDelivery.create({
    data: {
      subscriptionId: sub.id, serviceDate: new Date('2026-10-08'), sequenceNumber: 1, deliverySlot: 'AM',
      status: delivered ? 'DELIVERED' : 'SKIPPED', generationKey: `${tag}gen`, proofMode: 'RIDER_PHOTO_GPS',
      cashDuePaise: 10500, cashCollectedPaise: opts.collectedPaise, deliveryJobId: job.id, storeId: store.id,
    },
  });
  const run = await prisma.deliveryRun.create({
    data: {
      routeCode: `${tag}run`, storeId: store.id, riderId: rider.id, serviceDate: new Date('2026-10-08'),
      slotStart: new Date('2026-10-08T05:00:00Z'), slotEnd: new Date('2026-10-08T09:00:00Z'), deliveryCluster: 'QA', status: 'IN_PROGRESS',
      expectedBagCount: 1, packedBagCount: 1, totalStopCount: 1,
      completedStopCount: delivered ? 1 : 0, failedStopCount: delivered ? 0 : 1, collectedCashPaise: opts.collectedPaise,
    },
  });
  const stop = await prisma.deliveryRunStop.create({
    data: { deliveryRunId: run.id, subscriptionDeliveryId: delivery.id, deliveryJobId: job.id, sequenceNumber: 1, status: opts.stopStatus, proofMode: 'RIDER_PHOTO_GPS', expectedItemCount: 1, version: 3 },
  });
  if (opts.collectedPaise > 0) {
    await prisma.codLedger.create({
      data: {
        deliveryJobId: job.id, orderId: order.id, riderId: rider.id,
        expectedAmountPaise: opts.collectedPaise, collectedAmountPaise: opts.collectedPaise,
        riderHoldingBalancePaise: opts.collectedPaise, status: 'HELD_BY_RIDER',
      },
    });
  }
  return { riderUser, sub, order, job, delivery, run, stop };
}

describe('rider undoStop — reverse a mistaken close', () => {
  const service = new DeliveryRunOperationsService(
    new DeliveryWorkflowService(new DeliveryEventService()),
    {} as any,
    new SubscriptionCashFundingService(new SubscriptionCalendarService()),
    {} as any,
  );

  beforeAll(cleanup);
  afterAll(cleanup);

  test('reverses a delivered stop, its funding entitlement and recorded cash', async () => {
    const { riderUser, sub, order, job, delivery, stop } = await seed({ stopStatus: 'DELIVERED', completedDeliveries: 1, remainingFunded: 6, collectedPaise: 10500 });

    const result = await service.undoStop(stop.deliveryRunId, stop.id, { version: 3, reason: 'mis-tap' }, { id: riderUser.id, role: Role.RIDER });

    expect(result.success).toBe(true);
    expect(result.restoredStatus).toBe('ARRIVED');

    const reversedStop = await prisma.deliveryRunStop.findUnique({ where: { id: stop.id } });
    expect(reversedStop?.status).toBe('ARRIVED');
    expect(reversedStop?.version).toBe(4);

    const reversedDelivery = await prisma.subscriptionDelivery.findUnique({ where: { id: delivery.id } });
    expect(reversedDelivery?.status).toBe('OUT_FOR_DELIVERY');
    expect(reversedDelivery?.cashCollectedPaise).toBe(0);

    const reversedSub = await prisma.customerSubscription.findUnique({ where: { id: sub.id } });
    expect(reversedSub?.completedDeliveries).toBe(0);
    expect(reversedSub?.remainingFundedDeliveries).toBe(7);

    const ledger = await prisma.codLedger.findUnique({ where: { deliveryJobId: job.id } });
    expect(ledger?.collectedAmountPaise).toBe(0);
    expect(ledger?.riderHoldingBalancePaise).toBe(0);

    const reversedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(reversedOrder?.status).toBe('OUT_FOR_DELIVERY');

    const reversedJob = await prisma.deliveryJob.findUnique({ where: { id: job.id } });
    expect(reversedJob?.status).toBe('RIDER_AT_CUSTOMER');
  });

  test('reverses a skipped stop and its skip counter', async () => {
    const { riderUser, sub, stop } = await seed({ stopStatus: 'CANCELLED', completedDeliveries: 0, remainingFunded: 7, collectedPaise: 0 });

    const result = await service.undoStop(stop.deliveryRunId, stop.id, { version: 3, reason: 'customer changed mind' }, { id: riderUser.id, role: Role.RIDER });

    expect(result.restoredStatus).toBe('PLANNED');
    const reversedStop = await prisma.deliveryRunStop.findUnique({ where: { id: stop.id } });
    expect(reversedStop?.status).toBe('PLANNED');
    const reversedSub = await prisma.customerSubscription.findUnique({ where: { id: sub.id } });
    expect(reversedSub?.skippedDeliveries).toBe(0);
  });

  test('rejects a stale version', async () => {
    const { riderUser, stop } = await seed({ stopStatus: 'DELIVERED', completedDeliveries: 1, remainingFunded: 6, collectedPaise: 0 });
    await expect(
      service.undoStop(stop.deliveryRunId, stop.id, { version: 99 }, { id: riderUser.id, role: Role.RIDER }),
    ).rejects.toThrow('changed; refresh and try again');
  });
});
