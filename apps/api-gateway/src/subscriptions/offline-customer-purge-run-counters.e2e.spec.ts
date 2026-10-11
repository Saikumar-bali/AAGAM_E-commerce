import { prisma, Role } from '@aagam/database';
import { OfflineCustomerService } from './offline-customer.service';

/**
 * Regression for BUG-030: purging an offline customer deletes their
 * `DeliveryRunStop` rows, which drops stops from the parent `DeliveryRun`.
 * The run's `totalStopCount`/`completedStopCount` are a snapshot written at
 * planning/dispatch and were never re-derived, so they drifted from the rows
 * the run actually had — the rider board read `4/4` while the console read
 * `3/4` for the same run. `permanentDeleteCustomer` must recompute every
 * affected run's counters after deleting the stops, on both its branches
 * (anonymize a customer with orders, and hard-delete one without).
 */
const PREFIX = '_test_purge_run_';

jest.setTimeout(180000);

async function cleanup() {
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ storeId: { in: storeIds } }, { customer: { email: { contains: PREFIX } } }] },
    select: { id: true, customerId: true },
  });
  const orderIds = orders.map((o) => o.id);
  const customersFromOrders = orders.map((o) => o.customerId);
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { contains: PREFIX } }, { id: { in: customersFromOrders } }] },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const runs = await prisma.deliveryRun.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const jobs = await prisma.deliveryJob.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);
  const subs = await prisma.customerSubscription.findMany({ where: { customerId: { in: userIds } }, select: { id: true } });
  await prisma.deliveryRunStop.deleteMany({ where: { OR: [{ deliveryRunId: { in: runs.map((r) => r.id) } }, { deliveryJobId: { in: jobIds } }] } });
  await prisma.deliveryRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } });
  await prisma.subscriptionDelivery.deleteMany({ where: { subscriptionId: { in: subs.map((s) => s.id) } } });
  await prisma.deliveryJob.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customerSubscription.deleteMany({ where: { id: { in: subs.map((s) => s.id) } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.subscriptionPlanVersion.deleteMany({ where: { plan: { code: { contains: PREFIX } } } });
  await prisma.subscriptionPlan.deleteMany({ where: { code: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe('OfflineCustomerService.permanentDeleteCustomer — run stop counters (BUG-030)', () => {
  const service = new OfflineCustomerService();

  beforeAll(cleanup);
  afterAll(cleanup);

  /**
   * Seeds one offline customer with a subscription, an order, a delivery, a
   * job and one run stop. The purge deletes the run stop, so the run counters
   * must be re-derived. (A run stop can only exist alongside an order — a job
   * needs an order and a stop needs a job — so the order-bearing anonymize
   * branch is the only one that can carry stops.)
   */
  async function seed() {
    const owner = await prisma.user.create({ data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER } });
    const store = await prisma.store.create({ data: { name: `${PREFIX}store`, address: 'x', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
    const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider@test.com`, role: Role.RIDER, name: 'QA Rider' } });
    const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, approvalStatus: 'APPROVED', status: 'ONLINE' } });
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: `${PREFIX}plan`, internalName: 'QA', name: 'QA', status: 'ACTIVE', fundingCycle: 'FULL_PLAN',
        durationDays: 7, totalDeliveries: 7, deliveryFrequency: 'DAILY', pricePaise: 10500, mrpPaise: 10500,
        defaultWindowStartMinute: 360, defaultWindowEndMinute: 540, proofPolicy: {}, createdById: owner.id, updatedById: owner.id,
      },
    });
    const version = await prisma.subscriptionPlanVersion.create({
      data: {
        planId: plan.id, version: 1, pricePaise: 10500, mrpPaise: 10500, totalDeliveries: 7, durationDays: 7,
        fundingCycle: 'FULL_PLAN', deliveryFrequency: 'DAILY', itemsSnapshot: [], deliveryRulesSnapshot: {},
        proofPolicySnapshot: {}, applicabilitySnapshot: {}, fullSnapshot: {}, createdById: owner.id,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `${PREFIX}c@aagaam.local`, phone: `9000000001`, name: 'QA Purge',
        role: Role.CUSTOMER, acquisitionSource: 'OFFLINE_STORE', offlineStoreId: store.id,
      },
    });
    const address = await prisma.customerAddress.create({
      data: { userId: customer.id, recipientName: 'QA', phoneE164: `9000000001`, line1: '1', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
    });
    const order = await prisma.order.create({
      data: { storeId: store.id, customerId: customer.id, status: 'OUT_FOR_DELIVERY', totalAmount: 105, orderSource: 'SUBSCRIPTION' },
    });
    const sub = await prisma.customerSubscription.create({
      data: {
        customerId: customer.id, planId: plan.id, planVersionId: version.id, addressId: address.id, homeStoreId: store.id,
        status: 'ACTIVE', startDate: new Date('2026-10-08'), endDate: new Date('2026-10-15'),
        deliveryWindowStartMinute: 360, deliveryWindowEndMinute: 540, deliveryMethod: 'PERSONAL_HANDOVER',
        priceSnapshot: {}, itemsSnapshot: [], addressSnapshot: {}, policySnapshot: {}, amountDuePaise: 10500, fundingCycle: 'FULL_PLAN',
      },
    });
    const job = await prisma.deliveryJob.create({ data: { orderId: order.id, status: 'OUT_FOR_DELIVERY', currentRiderId: rider.id } });
    const delivery = await prisma.subscriptionDelivery.create({
      data: {
        subscriptionId: sub.id, serviceDate: new Date('2026-10-08'), sequenceNumber: 1, deliverySlot: 'AM',
        status: 'OUT_FOR_DELIVERY', generationKey: `${PREFIX}gen`, proofMode: 'RIDER_PHOTO_GPS',
        cashDuePaise: 10500, deliveryJobId: job.id, storeId: store.id,
      },
    });
    const run = await prisma.deliveryRun.create({
      data: {
        routeCode: `${PREFIX}run`, storeId: store.id, riderId: rider.id, serviceDate: new Date('2026-10-08'),
        slotStart: new Date('2026-10-08T05:00:00Z'), slotEnd: new Date('2026-10-08T09:00:00Z'), deliveryCluster: 'QA',
        status: 'IN_PROGRESS', totalStopCount: 1, originalStopCount: 1, completedStopCount: 0,
      },
    });
    await prisma.deliveryRunStop.create({
      data: { deliveryRunId: run.id, subscriptionDeliveryId: delivery.id, deliveryJobId: job.id, sequenceNumber: 1, status: 'ARRIVED', proofMode: 'RIDER_PHOTO_GPS', expectedItemCount: 1 },
    });
    return { customerId: customer.id, ownerId: owner.id, runId: run.id };
  }

  test('recomputes the run counters after deleting the purged customer stops', async () => {
    const { customerId, ownerId, runId } = await seed();

    const before = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId }, select: { totalStopCount: true } });
    expect(before.totalStopCount).toBe(1);

    const result = await service.permanentDeleteCustomer(customerId, { id: ownerId, role: Role.STORE_OWNER });
    expect(result.success).toBe(true);

    const rows = await prisma.deliveryRunStop.count({ where: { deliveryRunId: runId } });
    const run = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId }, select: { totalStopCount: true, completedStopCount: true } });
    expect(rows).toBe(0);
    // Without the recompute the snapshot stayed at 1 while the run had 0 rows,
    // which is what made /rider/runs read 4/4 against the console's 3/4.
    expect(run.totalStopCount).toBe(rows);
    expect(run.completedStopCount).toBe(0);
  });
});
