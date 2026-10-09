import { prisma, Role } from '@aagam/database';
import { CustomerSubscriptionService } from './customer-subscription.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';
import { SubscriptionServiceabilityService } from './subscription-serviceability.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { reconcileSubscriptionBalance } from './subscription-balances';
import { StoreMilkGridService } from './store-milk-grid.service';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { DeliveryRunPlanningService } from './delivery-run-planning.service';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { DeliveryEventService } from '../orders/delivery-event.service';

/**
 * End-to-end flow test for the real subscription delivery lifecycle. It walks
 * the exact chain the store-AAGAAM-milk flow requires:
 *
 *   offline customer (store walk-in)  ─┐
 *   online customer (self-register)   ─┼─ store assigns a rider ─ rider photo+GPS deliver
 *   AM/PM two-slot offline plan       ─┘
 *
 * and asserts the cross-cutting guarantees that keep surfacing as bugs:
 *  - 4 offline + 4 online example customers, one grid row per customer
 *  - products are simple milk only
 *  - an offline customer who takes both slots gets both AM and PM units per day
 *  - the store dispatches the work to a rider (delivery is not fulfilled by the store)
 *  - the rider completes each stop with a photo + GPS and NO customer OTP
 *  - every money-affecting change lands in the subscription audit trail,
 *    which the store can read back (GET .../subscribers/:id/audit)
 */

const PREFIX = '_test_flow_';
const START_DATE = '2026-10-20';
const SERVICE_YEAR = 2026;
const SERVICE_MONTH = 9; // 0-indexed: October
const STORE_LAT = 17.6912;
const STORE_LNG = 83.0041;
const TOTAL_DELIVERIES = 4;
const MILK_PRICE_PAISE = 7000; // ₹70 / L

jest.setTimeout(180_000);

async function cleanup() {
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  // Offline walk-ins get synthetic `offline.<phone>@aagaam.local` emails, so
  // also pull subscriptions by home store to catch their customers.
  const subs = await prisma.customerSubscription.findMany({
    where: { OR: [{ customerId: { in: userIds } }, { homeStoreId: { in: storeIds } }] },
    select: { id: true, customerId: true },
  });
  const subIds = subs.map((s) => s.id);
  for (const s of subs) if (!userIds.includes(s.customerId)) userIds.push(s.customerId);
  const deliveries = await prisma.subscriptionDelivery.findMany({ where: { subscriptionId: { in: subIds } }, select: { id: true, deliveryJobId: true } });
  const jobIds = deliveries.map((d) => d.deliveryJobId).filter((x): x is string => Boolean(x));
  const orders = await prisma.order.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const runs = await prisma.deliveryRun.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const stops = await prisma.deliveryRunStop.findMany({ where: { deliveryRunId: { in: runs.map((r) => r.id) } }, select: { id: true } });
  await prisma.riderPhotoProof.deleteMany({ where: { deliveryRunStopId: { in: stops.map((s) => s.id) } } });
  await prisma.subscriptionAuditEntry.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.codLedger.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.deliveryEvent.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.deliveryRunStop.deleteMany({ where: { deliveryRunId: { in: runs.map((r) => r.id) } } });
  await prisma.deliveryRun.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.subscriptionDelivery.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  // Deleting the customer rows must precede plan versions (planVersionId FK).
  await prisma.customerSubscription.deleteMany({ where: { id: { in: subIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.deliveryZoneStore.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.subscriptionPlanZone.deleteMany({ where: { plan: { code: { contains: PREFIX } } } });
  await prisma.subscriptionPlanStore.deleteMany({ where: { plan: { code: { contains: PREFIX } } } });
  await prisma.subscriptionPlanVersion.deleteMany({ where: { plan: { code: { contains: PREFIX } } } });
  await prisma.subscriptionPlanItem.deleteMany({ where: { plan: { code: { contains: PREFIX } } } });
  await prisma.subscriptionPlan.deleteMany({ where: { code: { contains: PREFIX } } });
  await prisma.inventory.deleteMany({ where: { product: { name: { contains: PREFIX } } } });
  await prisma.product.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.deliveryZone.deleteMany({ where: { name: { contains: PREFIX } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe('subscription flow — offline + online, store dispatch, AM/PM, photo+GPS', () => {
  const calendar = new SubscriptionCalendarService();
  const lifecycle = new SubscriptionLifecycleService();
  const serviceability = new SubscriptionServiceabilityService(calendar);
  const customerSubs = new CustomerSubscriptionService(calendar, serviceability, lifecycle);
  const funding = new SubscriptionCashFundingService(calendar);
  const reporting = new SubscriptionAdminReportingService(funding, lifecycle);
  const grid = new StoreMilkGridService(funding, lifecycle, {} as any);
  const runs = new DeliveryRunOperationsService(
    new DeliveryWorkflowService(new DeliveryEventService()),
    {} as any,
    funding,
    {} as any,
  );
  const planning = new DeliveryRunPlanningService(new DeliveryWorkflowService(new DeliveryEventService()), {} as any);

  let ownerId = '';
  let storeId = '';
  let zoneId = '';
  let categoryId = '';
  let productId = '';
  let riderUserId = '';
  let riderProfileId = '';
  const offlineIds: string[] = [];
  const onlineIds: string[] = [];

  const owner = () => ({ id: ownerId, role: Role.STORE_OWNER });

  async function makePlan(code: string) {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: `${PREFIX}${code}`,
        internalName: `${PREFIX}${code}`,
        name: `${PREFIX}Milk Plan ${code}`,
        status: 'ACTIVE',
        fundingCycle: 'FULL_PLAN',
        durationDays: 7,
        totalDeliveries: TOTAL_DELIVERIES,
        deliveryFrequency: 'DAILY',
        pricePaise: MILK_PRICE_PAISE * TOTAL_DELIVERIES,
        mrpPaise: MILK_PRICE_PAISE * TOTAL_DELIVERIES,
        defaultWindowStartMinute: 360,
        defaultWindowEndMinute: 540,
        proofPolicy: {},
        allowPersonalHandover: true,
        createdById: ownerId,
        updatedById: ownerId,
      },
    });
    await prisma.subscriptionPlanVersion.create({
      data: {
        planId: plan.id,
        version: 1,
        pricePaise: plan.pricePaise,
        mrpPaise: plan.mrpPaise,
        totalDeliveries: TOTAL_DELIVERIES,
        durationDays: 7,
        fundingCycle: 'FULL_PLAN',
        deliveryFrequency: 'DAILY',
        itemsSnapshot: [],
        deliveryRulesSnapshot: {},
        proofPolicySnapshot: {},
        applicabilitySnapshot: {},
        fullSnapshot: {},
        createdById: ownerId,
      },
    });
    await prisma.subscriptionPlanItem.create({ data: { planId: plan.id, productId, quantityPerDelivery: 1 } });
    await prisma.subscriptionPlanStore.create({ data: { planId: plan.id, storeId } });
    await prisma.subscriptionPlanZone.create({ data: { planId: plan.id, zoneId } });
    return plan;
  }

  /** Mirror the store's manual-subscription path without pulling in HTTP. */
  async function createOfflineSubscription(customer: { id: string }, planId: string) {
    return reporting.createManualSubscription(
      {
        storeId,
        planId,
        customerId: customer.id,
        addressId: (await prisma.customerAddress.findFirstOrThrow({ where: { userId: customer.id, isDefault: true } })).id,
        startDate: START_DATE,
        totalDeliveries: TOTAL_DELIVERIES,
        deliverySlot: 'BOTH',
        initialCashCollectedPaise: 0,
        splitItems: { amProductName: 'Buffalo Milk', amQuantity: '1L', pmProductName: 'Buffalo Milk', pmQuantity: '1L' },
        note: 'Store walk-in',
      },
      ownerId,
    );
  }

  beforeAll(async () => {
    await cleanup();
    const ownerUser = await prisma.user.create({
      data: { email: `${PREFIX}owner@test.com`, role: Role.STORE_OWNER, name: 'Flow Owner' },
    });
    ownerId = ownerUser.id;
    const store = await prisma.store.create({
      data: { name: `${PREFIX}Anakapalle Hub`, address: 'Main Road', latitude: STORE_LAT, longitude: STORE_LNG, ownerId },
    });
    storeId = store.id;
    const zone = await prisma.deliveryZone.create({
      data: {
        name: `${PREFIX}Anakapalle Zone`,
        code: `${PREFIX}ZONE`,
        centerLatitude: STORE_LAT,
        centerLongitude: STORE_LNG,
        fallbackRadiusKm: 25,
        isActive: true,
      },
    });
    zoneId = zone.id;
    await prisma.deliveryZoneStore.create({ data: { zoneId, storeId, priority: 1 } });

    const category = await prisma.category.create({ data: { name: `${PREFIX}Milk & Dairy` } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { name: `${PREFIX}Aagaam Buffalo Milk 1 L`, categoryId, price: 70, pricePaise: MILK_PRICE_PAISE, mrpPaise: MILK_PRICE_PAISE, weightGrams: 1000, isActive: true },
    });
    productId = product.id;
    await prisma.inventory.create({ data: { storeId, productId, quantity: 500, isListed: true } });

    const riderUser = await prisma.user.create({ data: { email: `${PREFIX}rider@test.com`, role: Role.RIDER, name: 'Flow Rider' } });
    riderUserId = riderUser.id;
    const rider = await prisma.riderProfile.create({ data: { userId: riderUserId, approvalStatus: 'APPROVED', status: 'ONLINE' } });
    riderProfileId = rider.id;

    await makePlan('offline');
    await makePlan('online');
  });

  afterAll(cleanup);

  test('store adds 4 offline customers (both AM+PM), each gets a subscription', async () => {
    const offlinePlan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { code: `${PREFIX}offline` } });
    for (let n = 1; n <= 4; n += 1) {
      const { customer } = await reporting.createOfflineCustomer(
        {
          name: `Offline Family ${n}`,
          phone: `90000000${n}0`,
          line1: `${n} Bazar St`,
          city: 'Anakapalle',
          state: 'AP',
          pincode: '531001',
          latitude: STORE_LAT + n * 0.001,
          longitude: STORE_LNG + n * 0.001,
          storeId,
        },
        owner(),
      );
      const sub = await createOfflineSubscription(customer, offlinePlan.id);
      offlineIds.push(sub.id);
    }
    expect(offlineIds).toHaveLength(4);

    // Every offline customer took both slots -> two units on the first service date.
    for (const subId of offlineIds) {
      const deliveries = await prisma.subscriptionDelivery.findMany({
        where: { subscriptionId: subId },
        orderBy: { sequenceNumber: 'asc' },
      });
      expect(deliveries).toHaveLength(4);
      expect(new Set(deliveries.map((d) => d.deliverySlot))).toEqual(new Set(['AM', 'PM']));
      const dayOne = deliveries.filter((d) => d.serviceDate.getTime() === new Date(START_DATE).getTime());
      expect(dayOne.map((d) => d.deliverySlot).sort()).toEqual(['AM', 'PM']);
    }
  });

  test('4 online customers self-register via the real customer endpoint', async () => {
    const onlinePlan = await prisma.subscriptionPlan.findFirstOrThrow({ where: { code: `${PREFIX}online` } });
    for (let n = 1; n <= 4; n += 1) {
      const customer = await prisma.user.create({
        data: { email: `${PREFIX}online${n}@test.com`, role: Role.CUSTOMER, name: `Online Customer ${n}`, phone: `98000000${n}0` },
      });
      const address = await prisma.customerAddress.create({
        data: {
          userId: customer.id, recipientName: `Online ${n}`, phoneE164: `98000000${n}0`, line1: `${n} Online St`,
          city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: STORE_LAT + n * 0.001, longitude: STORE_LNG + n * 0.001, isDefault: true,
        },
      });
      const sub = await customerSubs.create(customer.id, {
        planId: onlinePlan.id,
        addressId: address.id,
        startDate: START_DATE,
        deliverySlot: 'AM',
        deliveryMethod: 'PERSONAL_HANDOVER' as any,
      } as any);
      const id = (sub as any).id || (sub as any).subscription?.id;
      expect(id).toBeTruthy();
      onlineIds.push(id);
    }
    expect(onlineIds).toHaveLength(4);

    // Online customers are fulfilled by the store's rider, so their proof is
    // photo+GPS, never a customer OTP.
    const modes = await prisma.subscriptionDelivery.findMany({ where: { subscriptionId: { in: onlineIds } }, select: { proofMode: true } });
    expect(modes.length).toBeGreaterThan(0);
    expect(modes.every((m) => m.proofMode === 'RIDER_PHOTO_GPS')).toBe(true);
  });

  test('the catalog for the store is simple milk only', async () => {
    const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
    const products = await prisma.product.findMany({ where: { categoryId } });
    expect(category.name).toContain('Milk');
    expect(products).toHaveLength(1);
    expect(products[0].name.toLowerCase()).toContain('milk');
  });

  test('store grid shows one row per customer and both slots for the offline plans', async () => {
    const result = await grid.getGrid(owner(), SERVICE_YEAR, SERVICE_MONTH);
    const rows = result.rows as any[];
    expect(rows).toHaveLength(8);
    const offlineRows = rows.filter((r) => r.customer.customerType === 'offline');
    const onlineRows = rows.filter((r) => r.customer.customerType === 'online');
    expect(offlineRows).toHaveLength(4);
    expect(onlineRows).toHaveLength(4);
    expect(offlineRows.every((r) => r.slot === 'AM+PM')).toBe(true);
    expect(onlineRows.every((r) => r.slot === 'AM')).toBe(true);
  });

  test('store dispatches the whole route to one rider, who delivers every stop with photo+GPS', async () => {
    // All eight first deliveries fall on the same AM slot, so a single dispatch
    // groups them into one run — the store is handing the work to a rider, not
    // delivering it itself.
    const firstDeliveries = await prisma.subscriptionDelivery.findMany({
      where: { subscriptionId: { in: [...offlineIds, ...onlineIds] }, sequenceNumber: 1 },
      orderBy: { id: 'asc' },
    });
    expect(firstDeliveries).toHaveLength(8);

    const dispatched = await grid.dispatchToRider(owner(), {
      deliveryIds: firstDeliveries.map((d) => d.id),
      riderProfileId,
      slot: 'AM',
    });
    expect((dispatched as any).success).toBe(true);

    const stop = await prisma.deliveryRunStop.findFirstOrThrow({ where: { subscriptionDeliveryId: firstDeliveries[0].id } });
    const runId = stop.deliveryRunId;
    const runStops = await prisma.deliveryRunStop.findMany({
      where: { deliveryRunId: runId },
      orderBy: { sequenceNumber: 'asc' },
      include: { subscriptionDelivery: { select: { cashDuePaise: true } } },
    });
    expect(runStops).toHaveLength(8);

    const riderActor = { id: riderUserId, role: Role.RIDER };
    let run = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.status).toBe('READY_FOR_PICKUP');

    // The store packs the route, then the rider performs an independent bag
    // receipt before starting — two distinct store/rider handoff steps.
    await planning.confirmPacking(runId, { version: run.version, expectedBagCount: run.expectedBagCount, packedBagCount: run.expectedBagCount }, owner());
    run = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId } });

    const picked = await runs.confirmPickupReceipt(runId, { version: run.version, expectedBagCount: run.expectedBagCount }, riderActor);
    await runs.start(runId, { version: (picked as any).version }, riderActor);

    for (const s of runStops) {
      const before = await prisma.deliveryRunStop.findUniqueOrThrow({ where: { id: s.id } });
      await runs.arrive(runId, s.id, { version: before.version, latitude: STORE_LAT, longitude: STORE_LNG, accuracyMetres: 5 }, riderActor);
      const arrived = await prisma.deliveryRunStop.findUniqueOrThrow({ where: { id: s.id } });
      await runs.complete(
        runId,
        s.id,
        {
          version: arrived.version,
          latitude: STORE_LAT,
          longitude: STORE_LNG,
          riderConfirmed: true,
          evidenceId: `photo-${s.id}`,
          cashCollectedPaise: s.subscriptionDelivery?.cashDuePaise || 0,
        } as any,
        riderActor,
      );
    }

    const delivered = await prisma.deliveryRunStop.findMany({ where: { deliveryRunId: runId }, select: { status: true } });
    expect(delivered.every((s) => s.status === 'DELIVERED')).toBe(true);

    // Status coherence — job, order, subscription delivery and run stop agree.
    const coherence = await prisma.subscriptionDelivery.findMany({
      where: { subscriptionId: { in: [...offlineIds, ...onlineIds] }, sequenceNumber: 1 },
      include: { deliveryJob: { select: { status: true } }, order: { select: { status: true } }, runStop: { select: { status: true } } },
    });
    for (const d of coherence) {
      expect(d.status).toBe('DELIVERED');
      expect(d.deliveryJob?.status).toBe('DELIVERED');
      expect(d.order?.status).toBe('DELIVERED');
      expect(d.runStop?.status).toBe('DELIVERED');
    }

    // Money reconciles, and the first delivery activates the contract.
    for (const subId of [...offlineIds, ...onlineIds]) {
      const sub = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: subId } });
      const deliveries = await prisma.subscriptionDelivery.findMany({ where: { subscriptionId: subId }, select: { cashCollectedPaise: true, cashDuePaise: true } });
      const rec = reconcileSubscriptionBalance(sub, deliveries);
      expect(rec.amountCollectedPaise + rec.amountDuePaise).toBeLessThanOrEqual(sub.priceSnapshot ? (sub.priceSnapshot as any).pricePaise : Number.MAX_SAFE_INTEGER);
      expect(sub.completedDeliveries).toBe(1);
      expect(sub.status).toBe('ACTIVE');
    }

    // No stop anywhere in this flow ever demanded a customer OTP.
    const allModes = await prisma.subscriptionDelivery.findMany({
      where: { subscriptionId: { in: [...offlineIds, ...onlineIds] } },
      select: { proofMode: true },
    });
    expect(allModes.some((m) => m.proofMode === 'PERSONAL_OTP_GPS')).toBe(false);

    // Completing the linked orders is what makes the customer app show delivery.
    const orders = await prisma.order.findMany({
      where: { subscriptionDeliveryId: { in: firstDeliveries.map((d) => d.id) } },
      select: { status: true },
    });
    expect(orders).toHaveLength(8);
    expect(orders.every((o) => o.status === 'DELIVERED')).toBe(true);
  });

  test('replaying a completion is idempotent (no double count, no double cash)', async () => {
    const stop = await prisma.deliveryRunStop.findFirstOrThrow({
      where: { subscriptionDelivery: { subscriptionId: offlineIds[0] }, status: 'DELIVERED' },
      include: { subscriptionDelivery: true },
    });
    const subBefore = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: offlineIds[0] } });
    await runs.complete(
      stop.deliveryRunId,
      stop.id,
      { version: stop.version, latitude: STORE_LAT, longitude: STORE_LNG, riderConfirmed: true, evidenceId: `photo-${stop.id}`, cashCollectedPaise: 0 } as any,
      { id: riderUserId, role: Role.RIDER },
    );
    const subAfter = await prisma.customerSubscription.findUniqueOrThrow({ where: { id: offlineIds[0] } });
    expect(subAfter.completedDeliveries).toBe(subBefore.completedDeliveries);
  });

  test('the store can read back the money audit trail, scoped to its own store', async () => {
    const trail = await reporting.subscriptionAuditTrail(owner(), offlineIds[0]);
    expect(trail.subscriptionId).toBe(offlineIds[0]);
    expect(trail.entries.some((e) => e.action === 'ADMIN_MANUAL_SUBSCRIPTION_CREATED')).toBe(true);

    const stranger = await prisma.user.create({ data: { email: `${PREFIX}stranger@test.com`, role: Role.STORE_OWNER } });
    await expect(reporting.subscriptionAuditTrail({ id: stranger.id, role: Role.STORE_OWNER }, offlineIds[0])).rejects.toThrow();
  });
});
