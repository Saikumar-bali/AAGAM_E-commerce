/**
 * TEMPORARY demo seeder for the rider full-screen map console preview.
 * Creates one store, five spread-out subscribers, and dispatches an AM run to
 * the demo rider, leaving every stop actionable (READY) so the console shows a
 * live route. Deleted after the preview is captured.
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

const STORE_NAME = 'AAGAAM Console Demo Hub';
const PREFIX = 'rcdemo_';
const STORE_LAT = 17.7333;
const STORE_LNG = 82.9849;
const START_DATE = new Date().toISOString().slice(0, 10);
const POINTS: Array<[number, number, string]> = [
  [17.7412, 82.9889, 'Ravi Kumar'],
  [17.7361, 82.9791, 'Nookalamma'],
  [17.7302, 82.9906, 'Suresh Babu'],
  [17.7268, 82.9772, 'Lakshmi Devi'],
  [17.7344, 82.9849, 'Anitha Rao'],
];

const calendar = new SubscriptionCalendarService();
const lifecycle = new SubscriptionLifecycleService();
const serviceability = new SubscriptionServiceabilityService(calendar);
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

async function cleanup() {
  const stores = await prisma.store.findMany({ where: { name: STORE_NAME }, select: { id: true } });
  const storeIds = stores.map((s) => s.id);
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const subs = await prisma.customerSubscription.findMany({
    where: { OR: [{ homeStoreId: { in: storeIds } }, { customerId: { in: userIds } }] },
    select: { id: true },
  });
  const subIds = subs.map((s) => s.id);
  const orders = await prisma.order.findMany({ where: { subscriptionId: { in: subIds } }, select: { id: true } });
  const orderIds = orders.map((o) => o.id);
  const runRows = await prisma.deliveryRun.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const runIds = runRows.map((r) => r.id);
  await prisma.deliveryRunStop.deleteMany({ where: { deliveryRunId: { in: runIds } } });
  await prisma.deliveryRun.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.subscriptionDelivery.deleteMany({ where: { subscriptionId: { in: subIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.customerSubscription.deleteMany({ where: { id: { in: subIds } } });
  await prisma.customerAddress.deleteMany({ where: { userId: { in: userIds } } });
  const plans = await prisma.subscriptionPlan.findMany({ where: { code: { startsWith: PREFIX } }, select: { id: true } });
  const planIds = plans.map((p) => p.id);
  await prisma.subscriptionPlanVersion.deleteMany({ where: { planId: { in: planIds } } });
  await prisma.subscriptionPlanItem.deleteMany({ where: { planId: { in: planIds } } });
  await prisma.subscriptionPlanStore.deleteMany({ where: { planId: { in: planIds } } });
  await prisma.subscriptionPlanZone.deleteMany({ where: { planId: { in: planIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.deliveryZone.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  await cleanup();

  const ownerUser = await prisma.user.findFirstOrThrow({ where: { role: Role.STORE_OWNER } });
  const ownerId = ownerUser.id;
  const owner = () => ({ id: ownerId, role: Role.STORE_OWNER });

  const store = await prisma.store.create({
    data: { name: STORE_NAME, address: 'Main Road, Anakapalle', latitude: STORE_LAT, longitude: STORE_LNG, ownerId, isActive: true },
  });
  const zone = await prisma.deliveryZone.create({
    data: { name: `${PREFIX}Anakapalle Zone`, code: `${PREFIX}zone`, centerLatitude: STORE_LAT, centerLongitude: STORE_LNG, fallbackRadiusKm: 25, isActive: true },
  });
  await prisma.deliveryZoneStore.create({ data: { zoneId: zone.id, storeId: store.id, priority: 1 } });
  const category = await prisma.category.create({ data: { name: `${PREFIX}Milk & Dairy` } });
  const product = await prisma.product.create({
    data: { name: `${PREFIX}Aagaam Buffalo Milk 1 L`, categoryId: category.id, price: 70, pricePaise: 7000, mrpPaise: 7000, weightGrams: 1000, isActive: true },
  });
  await prisma.inventory.create({ data: { storeId: store.id, productId: product.id, quantity: 500, isListed: true } });

  const riderUser = await prisma.user.findFirstOrThrow({ where: { role: Role.RIDER } });
  await prisma.riderProfile.update({ where: { userId: riderUser.id }, data: { approvalStatus: 'APPROVED', status: 'OFFLINE' } });
  const riderProfileId = (await prisma.riderProfile.findUniqueOrThrow({ where: { userId: riderUser.id } })).id;

  const plan = await prisma.subscriptionPlan.create({
    data: {
      code: `${PREFIX}plan`, internalName: 'rcdemo plan', name: 'Console Demo Milk Plan',
      status: 'ACTIVE', fundingCycle: 'FULL_PLAN', durationDays: 7, totalDeliveries: 7, deliveryFrequency: 'DAILY',
      pricePaise: 7000 * 7, mrpPaise: 7000 * 7, defaultWindowStartMinute: 360, defaultWindowEndMinute: 540,
      proofPolicy: {}, allowPersonalHandover: true, createdById: ownerId, updatedById: ownerId,
    },
  });
  await prisma.subscriptionPlanVersion.create({
    data: { planId: plan.id, version: 1, pricePaise: plan.pricePaise, mrpPaise: plan.mrpPaise, totalDeliveries: 7, durationDays: 7, fundingCycle: 'FULL_PLAN', deliveryFrequency: 'DAILY', itemsSnapshot: [], deliveryRulesSnapshot: {}, proofPolicySnapshot: {}, applicabilitySnapshot: {}, fullSnapshot: {}, createdById: ownerId },
  });
  await prisma.subscriptionPlanItem.create({ data: { planId: plan.id, productId: product.id, quantityPerDelivery: 1 } });
  await prisma.subscriptionPlanStore.create({ data: { planId: plan.id, storeId: store.id } });
  await prisma.subscriptionPlanZone.create({ data: { planId: plan.id, zoneId: zone.id } });

  const subIds: string[] = [];
  for (let n = 0; n < POINTS.length; n += 1) {
    const [latitude, longitude, name] = POINTS[n];
    const { customer } = await reporting.createOfflineCustomer(
      { name, phone: `955500000${n}`, line1: `${n + 1} Main Rd`, city: 'Anakapalle', state: 'AP', pincode: '531001', latitude, longitude, storeId: store.id },
      owner(),
    );
    const address = await prisma.customerAddress.findFirstOrThrow({ where: { userId: customer.id, isDefault: true } });
    const sub = await reporting.createManualSubscription(
      { storeId: store.id, planId: plan.id, customerId: customer.id, addressId: address.id, startDate: START_DATE, totalDeliveries: 7, deliverySlot: 'BOTH', initialCashCollectedPaise: 0, splitItems: { amProductName: 'Buffalo Milk', amQuantity: '1L', pmProductName: 'Buffalo Milk', pmQuantity: '1L' }, note: 'Console demo' },
      ownerId,
    );
    subIds.push((sub as any).id);
  }

  const firstDeliveries = await prisma.subscriptionDelivery.findMany({
    where: { subscriptionId: { in: subIds }, sequenceNumber: 1, deliverySlot: 'AM' },
    orderBy: { id: 'asc' },
  });
  const dispatched = await grid.dispatchToRider(owner(), { deliveryIds: firstDeliveries.map((d) => d.id), riderProfileId, slot: 'AM' });
  const stop0 = await prisma.deliveryRunStop.findFirstOrThrow({ where: { subscriptionDeliveryId: firstDeliveries[0].id } });
  const runId = stop0.deliveryRunId;
  const riderActor = { id: riderUser.id, role: Role.RIDER };

  let run = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId } });
  await planning.confirmPacking(runId, { version: run.version, expectedBagCount: run.expectedBagCount, packedBagCount: run.expectedBagCount }, owner());
  run = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId } });
  const picked = await runs.confirmPickupReceipt(runId, { version: run.version, expectedBagCount: run.expectedBagCount }, riderActor);
  await runs.start(runId, { version: (picked as any).version }, riderActor);

  const finalRun = await prisma.deliveryRun.findUniqueOrThrow({ where: { id: runId }, include: { stops: true } });
  console.log('DISPATCH', JSON.stringify(dispatched).slice(0, 100));
  console.log('RUN', finalRun.routeCode, finalRun.status, 'stops', finalRun.stops.length, 'stopStatuses', finalRun.stops.map((s) => s.status).join(','));
  console.log('DONE', runId);
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
