/**
 * Persistent local-demo seeder: replicates the subscription end-to-end flow
 * (subscription-flow.e2e.spec.ts) against the preview DB, but WITHOUT cleanup,
 * so the store and rider web apps show real data. Safe to re-run: it first
 * removes its own previous demo rows.
 *
 * Run from apps/api-gateway:
 *   DATABASE_URL=... ts-node --project tsconfig.json demo-seed.flow.ts
 */
import { prisma, Role } from '@aagam/database';
import { CustomerSubscriptionService } from './src/subscriptions/customer-subscription.service';
import { SubscriptionCalendarService } from './src/subscriptions/subscription-calendar.service';
import { SubscriptionServiceabilityService } from './src/subscriptions/subscription-serviceability.service';
import { SubscriptionLifecycleService } from './src/subscriptions/subscription-lifecycle.service';
import { SubscriptionAdminReportingService } from './src/subscriptions/subscription-admin-reporting.service';
import { SubscriptionCashFundingService } from './src/subscriptions/subscription-cash-funding.service';
import { StoreMilkGridService } from './src/subscriptions/store-milk-grid.service';
import { DeliveryRunOperationsService } from './src/subscriptions/delivery-run-operations.service';
import { DeliveryRunPlanningService } from './src/subscriptions/delivery-run-planning.service';
import { DeliveryWorkflowService } from './src/orders/delivery-workflow.service';
import { DeliveryEventService } from './src/orders/delivery-event.service';

const DEMO_STORE_NAME = 'AAGAAM Anakapalle Hub';
const PLAN_PREFIX = 'demo_';
const STORE_LAT = 17.6912;
const STORE_LNG = 83.0041;
const TOTAL_DELIVERIES = 4;
const MILK_PRICE_PAISE = 7000;
const START_DATE = new Date().toISOString().slice(0, 10); // today (UTC)

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

async function cleanupDemo() {
  const stores = await prisma.store.findMany({ where: { name: DEMO_STORE_NAME }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { startsWith: DEMO_STORE_NAME ? 'demo.' : 'demo.' } }, { email: { startsWith: 'offline.' } }] },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
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
  const rns = await prisma.deliveryRun.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const stops = await prisma.deliveryRunStop.findMany({ where: { deliveryRunId: { in: rns.map((r) => r.id) } }, select: { id: true } });
  await prisma.riderPhotoProof.deleteMany({ where: { deliveryRunStopId: { in: stops.map((s) => s.id) } } });
  await prisma.subscriptionAuditEntry.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.codLedger.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.deliveryEvent.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.deliveryRunStop.deleteMany({ where: { deliveryRunId: { in: rns.map((r) => r.id) } } });
  await prisma.deliveryRun.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.subscriptionDelivery.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customerSubscription.deleteMany({ where: { id: { in: subIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.deliveryZoneStore.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.subscriptionPlanZone.deleteMany({ where: { plan: { code: { startsWith: PLAN_PREFIX } } } });
  await prisma.subscriptionPlanStore.deleteMany({ where: { plan: { code: { startsWith: PLAN_PREFIX } } } });
  await prisma.subscriptionPlanVersion.deleteMany({ where: { plan: { code: { startsWith: PLAN_PREFIX } } } });
  await prisma.subscriptionPlanItem.deleteMany({ where: { plan: { code: { startsWith: PLAN_PREFIX } } } });
  await prisma.subscriptionPlan.deleteMany({ where: { code: { startsWith: PLAN_PREFIX } } });
  await prisma.inventory.deleteMany({ where: { product: { name: { startsWith: 'demo ' } } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: 'demo ' } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: 'demo ' } } });
  await prisma.deliveryZone.deleteMany({ where: { name: { startsWith: 'demo ' } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  console.log('🧹 clearing previous demo data…');
  await cleanupDemo();

  const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: 'store@aagam.com' } });
  const ownerId = ownerUser.id;
  const owner = () => ({ id: ownerId, role: Role.STORE_OWNER });

  const store = await prisma.store.create({
    data: { name: DEMO_STORE_NAME, address: 'Main Road, Anakapalle', latitude: STORE_LAT, longitude: STORE_LNG, ownerId, isActive: true },
  });
  const storeId = store.id;
  const zone = await prisma.deliveryZone.create({
    data: { name: 'demo Anakapalle Zone', code: `${PLAN_PREFIX}zone`, centerLatitude: STORE_LAT, centerLongitude: STORE_LNG, fallbackRadiusKm: 25, isActive: true },
  });
  await prisma.deliveryZoneStore.create({ data: { zoneId: zone.id, storeId, priority: 1 } });
  const category = await prisma.category.create({ data: { name: 'demo Milk & Dairy' } });
  const product = await prisma.product.create({
    data: { name: 'demo Aagaam Buffalo Milk 1 L', categoryId: category.id, price: 70, pricePaise: MILK_PRICE_PAISE, mrpPaise: MILK_PRICE_PAISE, weightGrams: 1000, isActive: true },
  });
  await prisma.inventory.create({ data: { storeId, productId: product.id, quantity: 500, isListed: true } });

  const riderUser = await prisma.user.findUniqueOrThrow({ where: { email: 'rider@aagam.com' } });
  await prisma.riderProfile.update({ where: { userId: riderUser.id }, data: { approvalStatus: 'APPROVED', status: 'OFFLINE' } });
  const riderProfileId = (await prisma.riderProfile.findUniqueOrThrow({ where: { userId: riderUser.id } })).id;
  // The gateway's eligibility gate refuses ONLINE/heartbeat until all four
  // required documents are APPROVED, so seed them for the demo rider.
  await prisma.riderDocument.deleteMany({ where: { riderProfileId } });
  await prisma.riderDocument.createMany({
    data: (['DRIVING_LICENSE', 'IDENTITY', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE'] as const).map((type) => ({
      riderProfileId, type, status: 'APPROVED' as const, documentNumberLast4: '0000',
      storageKey: `demo/rider/${type.toLowerCase()}.pdf`, expiresAt: new Date('2030-01-01'),
    })),
  });

  async function makePlan(code: string) {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: `${PLAN_PREFIX}${code}`, internalName: `demo ${code}`, name: `demo Milk Plan ${code}`,
        status: 'ACTIVE', fundingCycle: 'FULL_PLAN', durationDays: 7, totalDeliveries: TOTAL_DELIVERIES, deliveryFrequency: 'DAILY',
        pricePaise: MILK_PRICE_PAISE * TOTAL_DELIVERIES, mrpPaise: MILK_PRICE_PAISE * TOTAL_DELIVERIES,
        defaultWindowStartMinute: 360, defaultWindowEndMinute: 540, proofPolicy: {}, allowPersonalHandover: true,
        createdById: ownerId, updatedById: ownerId,
      },
    });
    await prisma.subscriptionPlanVersion.create({
      data: { planId: plan.id, version: 1, pricePaise: plan.pricePaise, mrpPaise: plan.mrpPaise, totalDeliveries: TOTAL_DELIVERIES, durationDays: 7, fundingCycle: 'FULL_PLAN', deliveryFrequency: 'DAILY', itemsSnapshot: [], deliveryRulesSnapshot: {}, proofPolicySnapshot: {}, applicabilitySnapshot: {}, fullSnapshot: {}, createdById: ownerId },
    });
    await prisma.subscriptionPlanItem.create({ data: { planId: plan.id, productId: product.id, quantityPerDelivery: 1 } });
    await prisma.subscriptionPlanStore.create({ data: { planId: plan.id, storeId } });
    await prisma.subscriptionPlanZone.create({ data: { planId: plan.id, zoneId: zone.id } });
    return plan;
  }
  const offlinePlan = await makePlan('offline');
  const onlinePlan = await makePlan('online');

  const offlineIds: string[] = [];
  for (let n = 1; n <= 4; n += 1) {
    const { customer } = await reporting.createOfflineCustomer(
      { name: `Offline Family ${n}`, phone: `910000000${n}`, line1: `${n} Bazar St`, city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: STORE_LAT + n * 0.001, longitude: STORE_LNG + n * 0.001, storeId },
      owner(),
    );
    const address = await prisma.customerAddress.findFirstOrThrow({ where: { userId: customer.id, isDefault: true } });
    const sub = await reporting.createManualSubscription(
      { storeId, planId: offlinePlan.id, customerId: customer.id, addressId: address.id, startDate: START_DATE, totalDeliveries: TOTAL_DELIVERIES, deliverySlot: 'BOTH', initialCashCollectedPaise: 0, splitItems: { amProductName: 'Buffalo Milk', amQuantity: '1L', pmProductName: 'Buffalo Milk', pmQuantity: '1L' }, note: 'Store walk-in' },
      ownerId,
    );
    offlineIds.push(sub.id);
  }
  console.log(`✅ ${offlineIds.length} offline customers + subscriptions`);

  const onlineIds: string[] = [];
  for (let n = 1; n <= 4; n += 1) {
    const customer = await prisma.user.create({ data: { email: `demo.online${n}@aagam.local`, role: Role.CUSTOMER, name: `Online Customer ${n}`, phone: `920000000${n}` } });
    const address = await prisma.customerAddress.create({
      data: { userId: customer.id, recipientName: `Online ${n}`, phoneE164: `920000000${n}`, line1: `${n} Online St`, city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: STORE_LAT + n * 0.001, longitude: STORE_LNG + n * 0.001, isDefault: true },
    });
    const sub = await customerSubs.create(customer.id, { planId: onlinePlan.id, addressId: address.id, startDate: START_DATE, deliverySlot: 'AM', deliveryMethod: 'PERSONAL_HANDOVER' } as any);
    onlineIds.push((sub as any).id || (sub as any).subscription?.id);
  }
  console.log(`✅ ${onlineIds.length} online customers + subscriptions`);

  const allIds = [...offlineIds, ...onlineIds];
  const firstDeliveries = await prisma.subscriptionDelivery.findMany({
    where: { subscriptionId: { in: allIds }, sequenceNumber: 1 }, orderBy: { id: 'asc' },
  });
  const dispatched = await grid.dispatchToRider(owner(), { deliveryIds: firstDeliveries.map((d) => d.id), riderProfileId, slot: 'AM' });
  console.log('dispatch:', JSON.stringify(dispatched).slice(0, 120));

  const stop0 = await prisma.deliveryRunStop.findFirstOrThrow({ where: { subscriptionDeliveryId: firstDeliveries[0].id } });
  const runId = stop0.deliveryRunId;
  const runStops = await prisma.deliveryRunStop.findMany({ where: { deliveryRunId: runId }, orderBy: { sequenceNumber: 'asc' }, include: { subscriptionDelivery: { select: { cashDuePaise: true } } } });
  const riderActor = { id: riderUser.id, role: Role.RIDER };

  let run = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId } });
  await planning.confirmPacking(runId, { version: run.version, expectedBagCount: run.expectedBagCount, packedBagCount: run.expectedBagCount }, owner());
  run = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId } });
  const picked = await runs.confirmPickupReceipt(runId, { version: run.version, expectedBagCount: run.expectedBagCount }, riderActor);
  await runs.start(runId, { version: (picked as any).version }, riderActor);

  for (const s of runStops) {
    const before = await prisma.deliveryRunStop.findUniqueOrThrow({ where: { id: s.id } });
    await runs.arrive(runId, s.id, { version: before.version, latitude: STORE_LAT, longitude: STORE_LNG, accuracyMetres: 5 }, riderActor);
    const arrived = await prisma.deliveryRunStop.findUniqueOrThrow({ where: { id: s.id } });
    await runs.complete(runId, s.id, { version: arrived.version, latitude: STORE_LAT, longitude: STORE_LNG, riderConfirmed: true, evidenceId: `photo-${s.id}`, cashCollectedPaise: s.subscriptionDelivery?.cashDuePaise || 0 } as any, riderActor);
  }

  const delivered = await prisma.deliveryRunStop.findMany({ where: { deliveryRunId: runId }, select: { status: true } });
  const allDelivered = delivered.every((s) => s.status === 'DELIVERED');

  const subs = await prisma.customerSubscription.findMany({ where: { id: { in: allIds } }, select: { id: true, status: true, completedDeliveries: true } });
  console.log('\n─── RESULT ───');
  console.log('run:', runId, '| stops:', delivered.length, '| all DELIVERED:', allDelivered);
  console.log('subscriptions:', subs.map((s, i) => `${i < 4 ? 'offline' : 'online'}:${s.status}/${s.completedDeliveries}`).join(' '));
  const orders = await prisma.order.findMany({ where: { subscriptionDeliveryId: { in: firstDeliveries.map((d) => d.id) } }, select: { status: true } });
  console.log('orders DELIVERED:', orders.filter((o) => o.status === 'DELIVERED').length, '/', orders.length);
  console.log('START_DATE:', START_DATE);
  console.log('DONE');
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error('SEED FAILED', e); await prisma.$disconnect(); process.exit(1); });
