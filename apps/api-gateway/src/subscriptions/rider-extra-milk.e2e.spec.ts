import { prisma, Role } from '@aagam/database';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { parseAddOns } from './delivery-add-on';

/**
 * Rider field add-on ("customer wants extra milk").
 *
 * The rider is the one at the door, so this is where the request is captured:
 *
 *  - a single extra for *today* must be written as `[EXTRA: <qty>|<paise>]`;
 *  - an extra scheduled for the *coming days* must be written as
 *    `[ADD-ON: <qty>|<paise>|<slot>]` so the store grid reads the same volume
 *    the rider promised (the `[EXTRA:]`-only path silently dropped the slot);
 *  - a replayed request (same idempotency key) must not double-charge.
 */
const PREFIX = '_test_rider_extra_milk_';

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
  await prisma.subscriptionAuditEntry.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.codLedgerEntry.deleteMany({ where: { codLedger: { deliveryJobId: { in: jobIds } } } });
  await prisma.codLedger.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
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
/** Seeds a run whose stop is day 1 of a 4-day plan (days 2-4 still SCHEDULED). */
async function seed() {
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
      fundingCycle: 'FULL_PLAN', durationDays: 4, totalDeliveries: 4, deliveryFrequency: 'DAILY',
      pricePaise: 10500, mrpPaise: 10500, defaultWindowStartMinute: 360, defaultWindowEndMinute: 540,
      proofPolicy: {}, createdById: owner.id, updatedById: owner.id,
    },
  });
  const version = await prisma.subscriptionPlanVersion.create({
    data: {
      planId: plan.id, version: 1, pricePaise: 10500, mrpPaise: 10500, totalDeliveries: 4, durationDays: 4,
      fundingCycle: 'FULL_PLAN', deliveryFrequency: 'DAILY', itemsSnapshot: [], deliveryRulesSnapshot: {},
      proofPolicySnapshot: {}, applicabilitySnapshot: {}, fullSnapshot: {}, createdById: owner.id,
    },
  });
  const sub = await prisma.customerSubscription.create({
    data: {
      customerId: customer.id, planId: plan.id, planVersionId: version.id, addressId: address.id, homeStoreId: store.id,
      status: 'ACTIVE', startDate: new Date('2026-10-08'), endDate: new Date('2026-10-11'),
      deliveryWindowStartMinute: 360, deliveryWindowEndMinute: 540, deliveryMethod: 'PERSONAL_HANDOVER',
      priceSnapshot: {}, itemsSnapshot: [], addressSnapshot: {}, policySnapshot: {},
      amountDuePaise: 0, amountCollectedPaise: 0, fundingCycle: 'FULL_PLAN',
    },
  });
  const order = await prisma.order.create({
    data: { storeId: store.id, customerId: customer.id, status: 'RIDER_ASSIGNED', totalAmount: 105, orderSource: 'SUBSCRIPTION' },
  });
  const job = await prisma.deliveryJob.create({
    data: { orderId: order.id, status: 'OUT_FOR_DELIVERY', currentRiderId: rider.id },
  });
  const run = await prisma.deliveryRun.create({
    data: {
      routeCode: `${tag}run`, storeId: store.id, riderId: rider.id, serviceDate: new Date('2026-10-08'),
      slotStart: new Date('2026-10-08T05:00:00Z'), slotEnd: new Date('2026-10-08T09:00:00Z'), deliveryCluster: 'QA',
      status: 'IN_PROGRESS', expectedBagCount: 1, packedBagCount: 1, expectedCashPaise: 0,
    },
  });

  const days: Array<{ id: string; seq: number }> = [];
  for (let seq = 1; seq <= 4; seq += 1) {
    const delivery = await prisma.subscriptionDelivery.create({
      data: {
        subscriptionId: sub.id, serviceDate: new Date(`2026-10-0${7 + seq}`), sequenceNumber: seq, deliverySlot: 'AM',
        status: seq === 1 ? 'OUT_FOR_DELIVERY' : 'SCHEDULED', generationKey: `${tag}gen${seq}`, proofMode: 'RIDER_PHOTO_GPS',
        cashDuePaise: 0, deliveryJobId: seq === 1 ? job.id : null, storeId: store.id,
      },
    });
    days.push({ id: delivery.id, seq });
  }
  const stop = await prisma.deliveryRunStop.create({
    data: { deliveryRunId: run.id, subscriptionDeliveryId: days[0].id, deliveryJobId: job.id, sequenceNumber: 1, status: 'ARRIVED', proofMode: 'RIDER_PHOTO_GPS', expectedItemCount: 1, cashDuePaise: 0 },
  });
  return { riderUser, sub, job, run, stop, days };
}

describe('rider extra milk — field add-on', () => {
  const service = new DeliveryRunOperationsService({} as any, {} as any, {} as any, {} as any);

  beforeAll(cleanup);
  afterAll(cleanup);

  test('today-only extra writes an [EXTRA:] marker and charges one day', async () => {
    const { riderUser, sub, run, stop, days } = await seed();

    const result = await service.extraMilk(
      run.id, stop.id,
      { extraQuantity: '+1.5L', extraPaise: 12000, consecutiveDays: 1 },
      { id: riderUser.id, role: Role.RIDER },
    );

    expect(result.success).toBe(true);
    expect(result.scheduledDays).toBe(1);
    expect(result.totalExtraPaise).toBe(12000);

    const today = await prisma.subscriptionDelivery.findUnique({ where: { id: days[0].id } });
    expect(today?.deferredReason).toContain('[EXTRA: +1.5L|12000]');
    expect(today?.deferredReason).not.toContain('[ADD-ON:');
    expect(today?.cashDuePaise).toBe(12000);

    const later = await prisma.subscriptionDelivery.findUnique({ where: { id: days[1].id } });
    expect(later?.deferredReason).toBeNull();
    expect(later?.cashDuePaise).toBe(0);

    const after = await prisma.customerSubscription.findUnique({ where: { id: sub.id } });
    expect(after?.amountDuePaise).toBe(12000);

    const updatedStop = await prisma.deliveryRunStop.findUnique({ where: { id: stop.id } });
    expect(updatedStop?.cashDuePaise).toBe(12000);
    const updatedRun = await prisma.deliveryRun.findUnique({ where: { id: run.id } });
    expect(updatedRun?.expectedCashPaise).toBe(12000);
  });

  test('coming-days extra writes an [ADD-ON: qty|paise|slot] marker and charges each scheduled day', async () => {
    const { riderUser, sub, run, stop, days } = await seed();

    const result = await service.extraMilk(
      run.id, stop.id,
      { extraQuantity: '+1L', extraPaise: 8000, consecutiveDays: 3, targetSlot: 'PM' },
      { id: riderUser.id, role: Role.RIDER },
    );

    expect(result.scheduledDays).toBe(3);
    expect(result.totalExtraPaise).toBe(24000);

    for (const day of days.slice(0, 3)) {
      const row = await prisma.subscriptionDelivery.findUnique({ where: { id: day.id } });
      expect(row?.deferredReason).toContain('[ADD-ON: +1L|8000|PM]');
      expect(row?.cashDuePaise).toBe(8000);
    }
    // Day 4 is outside the requested window and must be untouched.
    const day4 = await prisma.subscriptionDelivery.findUnique({ where: { id: days[3].id } });
    expect(day4?.deferredReason).toBeNull();
    expect(day4?.cashDuePaise).toBe(0);

    // The base delivery keeps its own AM slot; the add-on target lives in the marker.
    const today = await prisma.subscriptionDelivery.findUnique({ where: { id: days[0].id } });
    expect(today?.deliverySlot).toBe('AM');

    // The parser the grid/dispatch/statement all read must see the slot + volume.
    const parsed = parseAddOns(today?.deferredReason);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].liters).toBe(1);
    expect(parsed[0].slot).toBe('PM');

    const after = await prisma.customerSubscription.findUnique({ where: { id: sub.id } });
    expect(after?.amountDuePaise).toBe(24000);
  });

  test('a replayed request with the same idempotency key does not double-charge', async () => {
    const { riderUser, sub, run, stop, days } = await seed();
    const dto = { extraQuantity: '+1L', extraPaise: 8000, consecutiveDays: 2, targetSlot: 'AM' as const };
    const actor = { id: riderUser.id, role: Role.RIDER };

    const first = await service.extraMilk(run.id, stop.id, dto, actor, 'rider-addon-key-1');
    const second = await service.extraMilk(run.id, stop.id, dto, actor, 'rider-addon-key-1');

    expect(first.scheduledDays).toBe(2);
    expect(second.scheduledDays).toBe(2);

    const day1 = await prisma.subscriptionDelivery.findUnique({ where: { id: days[0].id } });
    const day2 = await prisma.subscriptionDelivery.findUnique({ where: { id: days[1].id } });
    expect(day1?.cashDuePaise).toBe(8000);
    expect(day2?.cashDuePaise).toBe(8000);

    const after = await prisma.customerSubscription.findUnique({ where: { id: sub.id } });
    expect(after?.amountDuePaise).toBe(16000);
  });

  test('rejects a non-rider actor', async () => {
    const { riderUser, run, stop } = await seed();
    await expect(
      service.extraMilk(run.id, stop.id, { extraQuantity: '+1L' }, { id: riderUser.id, role: Role.ADMIN }),
    ).rejects.toThrow('Rider role is required');
  });
});
