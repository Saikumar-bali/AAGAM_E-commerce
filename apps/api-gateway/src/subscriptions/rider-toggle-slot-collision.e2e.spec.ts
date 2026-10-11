import { BadRequestException } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { DeliveryEventService } from '../orders/delivery-event.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';

/**
 * `SubscriptionDelivery` is unique on (subscriptionId, serviceDate,
 * deliverySlot). A customer can hold a delivery in both slots on one day, so
 * moving a stop into a slot that already holds a delivery must be rejected with
 * a clear 400 — not an opaque Prisma unique-constraint 500.
 */
const PREFIX = '_test_toggle_slot_collision_';

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

async function seed() {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer@test.com`, role: Role.CUSTOMER, name: 'QA Slot' } });
  const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider@test.com`, role: Role.RIDER, name: 'QA Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, approvalStatus: 'APPROVED', status: 'BUSY' } });
  const store = await prisma.store.create({ data: { name: `${PREFIX}store`, address: 'x', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  const address = await prisma.customerAddress.create({
    data: { userId: customer.id, recipientName: 'QA Slot', phoneE164: '9000000002', line1: '1', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
  });
  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: `${PREFIX}plan`, internalName: 'Slot Plan', name: 'Slot Plan', status: 'ACTIVE',
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
  const serviceDate = new Date('2026-10-08');
  const sub = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id, planId: plan.id, planVersionId: version.id, addressId: address.id, homeStoreId: store.id,
      status: 'ACTIVE', startDate: serviceDate, endDate: new Date('2026-10-15'),
      deliveryWindowStartMinute: 360, deliveryWindowEndMinute: 540,
      deliveryMethod: 'PERSONAL_HANDOVER', priceSnapshot: {}, itemsSnapshot: [], addressSnapshot: {}, policySnapshot: {},
      amountDuePaise: 0, amountCollectedPaise: 0, fundingCycle: 'FULL_PLAN', remainingFundedDeliveries: 7,
    },
  });
  const run = await prisma.deliveryRun.create({
    data: {
      routeCode: `${PREFIX}run`, storeId: store.id, riderId: rider.id, serviceDate,
      slotStart: new Date('2026-10-08T05:00:00Z'), slotEnd: new Date('2026-10-08T09:00:00Z'), deliveryCluster: 'QA', status: 'IN_PROGRESS',
      expectedBagCount: 1, packedBagCount: 1, totalStopCount: 1,
    },
  });
  const order = await prisma.order.create({
    data: { storeId: store.id, customerId: customer.id, status: 'OUT_FOR_DELIVERY', totalAmount: 105, orderSource: 'SUBSCRIPTION' },
  });
  const job = await prisma.deliveryJob.create({ data: { orderId: order.id, status: 'OUT_FOR_DELIVERY', currentRiderId: rider.id } });
  const amDelivery = await prisma.subscriptionDelivery.create({
    data: {
      subscriptionId: sub.id, serviceDate, sequenceNumber: 1, deliverySlot: 'AM',
      status: 'OUT_FOR_DELIVERY', generationKey: `${PREFIX}gen-am`, proofMode: 'RIDER_PHOTO_GPS',
      cashDuePaise: 10500, deliveryJobId: job.id, storeId: store.id,
    },
  });
  // A second delivery on the same subscription/date/slot day — this is the row
  // that makes a naive AM -> PM move collide on the unique index.
  await prisma.subscriptionDelivery.create({
    data: {
      subscriptionId: sub.id, serviceDate, sequenceNumber: 2, deliverySlot: 'PM',
      status: 'SCHEDULED', generationKey: `${PREFIX}gen-pm`, proofMode: 'RIDER_PHOTO_GPS',
      cashDuePaise: 10500, storeId: store.id,
    },
  });
  const stop = await prisma.deliveryRunStop.create({
    data: { deliveryRunId: run.id, subscriptionDeliveryId: amDelivery.id, deliveryJobId: job.id, sequenceNumber: 1, status: 'READY', proofMode: 'RIDER_PHOTO_GPS', expectedItemCount: 1 },
  });
  return { riderUser, run, stop };
}

describe('rider toggle-slot — target slot already occupied', () => {
  const service = new DeliveryRunOperationsService(
    new DeliveryWorkflowService(new DeliveryEventService()),
    {} as any,
    new SubscriptionCashFundingService(new SubscriptionCalendarService()),
    {} as any,
  );

  beforeAll(cleanup);
  // Each test re-seeds users with the same unique emails, so clean up between
  // tests as well; otherwise the second seed trips the User.email constraint.
  afterEach(cleanup);
  afterAll(cleanup);

  test('rejects a move into an occupied slot with a 400, not a Prisma 500', async () => {
    const { riderUser, run, stop } = await seed();
    const actor = { id: riderUser.id, role: Role.RIDER };

    await expect(service.toggleSlot(run.id, stop.id, { targetSlot: 'PM' }, actor))
      .rejects.toBeInstanceOf(BadRequestException);

    // The stop stays put, and no phantom delivery was created.
    const after = await prisma.subscriptionDelivery.findUnique({ where: { id: stop.subscriptionDeliveryId } });
    expect(after?.deliverySlot).toBe('AM');
  });

  test('is a no-op when the target slot equals the current slot', async () => {
    const { riderUser, run, stop } = await seed();
    const actor = { id: riderUser.id, role: Role.RIDER };

    const result = await service.toggleSlot(run.id, stop.id, { targetSlot: 'AM' }, actor);
    expect(result).toEqual({ success: true, newSlot: 'AM' });
  });
});
