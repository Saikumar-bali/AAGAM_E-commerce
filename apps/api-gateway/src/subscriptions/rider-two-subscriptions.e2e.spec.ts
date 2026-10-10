import { prisma, Role } from '@aagam/database';
import { DeliveryRunOperationsService } from './delivery-run-operations.service';
import { DeliveryWorkflowService } from '../orders/delivery-workflow.service';
import { DeliveryEventService } from '../orders/delivery-event.service';
import { SubscriptionCashFundingService } from './subscription-cash-funding.service';
import { SubscriptionCalendarService } from './subscription-calendar.service';

/**
 * One customer can hold more than one subscription (a different plan, or the
 * same plan in a different slot). Each subscription is fulfilled by its own
 * delivery, so a single customer can legitimately appear as two stops on one
 * run. The rider board must carry per-stop plan info so those two stops are
 * distinguishable and each can be marked delivered on its own.
 */
const PREFIX = '_test_rider_two_subs_';

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

async function seedTwoSubscriptions() {
  const tag = `${PREFIX}1`;
  const owner = await prisma.user.create({ data: { email: `${tag}owner@test.com`, role: Role.STORE_OWNER } });
  const customer = await prisma.user.create({ data: { email: `${tag}customer@test.com`, role: Role.CUSTOMER, name: 'QA Twin' } });
  const riderUser = await prisma.user.create({ data: { email: `${tag}rider@test.com`, role: Role.RIDER, name: 'QA Rider' } });
  const rider = await prisma.riderProfile.create({ data: { userId: riderUser.id, approvalStatus: 'APPROVED', status: 'BUSY' } });
  const store = await prisma.store.create({ data: { name: `${tag}store`, address: 'x', latitude: 17.7, longitude: 83.3, ownerId: owner.id } });
  const address = await prisma.customerAddress.create({
    data: { userId: customer.id, recipientName: 'QA Twin', phoneE164: '9000000001', line1: '1', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
  });

  const mkSub = async (code: string, planName: string, slot: 'AM' | 'PM') => {
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: `${tag}${code}`, internalName: planName, name: planName, status: 'ACTIVE',
        fundingCycle: 'FULL_PLAN', durationDays: 7, totalDeliveries: 7, deliveryFrequency: 'DAILY',
        pricePaise: 10500, mrpPaise: 10500, defaultWindowStartMinute: slot === 'AM' ? 360 : 1050, defaultWindowEndMinute: slot === 'AM' ? 540 : 1230,
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
        deliveryWindowStartMinute: slot === 'AM' ? 360 : 1050, deliveryWindowEndMinute: slot === 'AM' ? 540 : 1230,
        deliveryMethod: 'PERSONAL_HANDOVER', priceSnapshot: {}, itemsSnapshot: [], addressSnapshot: {}, policySnapshot: {},
        amountDuePaise: 0, amountCollectedPaise: 0, fundingCycle: 'FULL_PLAN', remainingFundedDeliveries: 7,
      },
    });
    return { plan, sub };
  };

  const { sub: amSub } = await mkSub('am', 'Cow Milk 1/2L · Morning', 'AM');
  const { sub: pmSub } = await mkSub('pm', 'Buffalo Milk 1L · Evening', 'PM');

  const run = await prisma.deliveryRun.create({
    data: {
      routeCode: `${tag}run`, storeId: store.id, riderId: rider.id, serviceDate: new Date('2026-10-08'),
      slotStart: new Date('2026-10-08T05:00:00Z'), slotEnd: new Date('2026-10-08T19:00:00Z'), deliveryCluster: 'QA', status: 'IN_PROGRESS',
      expectedBagCount: 2, packedBagCount: 2, totalStopCount: 2,
    },
  });

  const mkStop = async (subId: string, sequence: number, slot: 'AM' | 'PM') => {
    const order = await prisma.order.create({
      data: { storeId: store.id, customerId: customer.id, status: 'OUT_FOR_DELIVERY', totalAmount: 105, orderSource: 'SUBSCRIPTION' },
    });
    const job = await prisma.deliveryJob.create({
      data: { orderId: order.id, status: 'OUT_FOR_DELIVERY', currentRiderId: rider.id },
    });
    const delivery = await prisma.subscriptionDelivery.create({
      data: {
        subscriptionId: subId, serviceDate: new Date('2026-10-08'), sequenceNumber: sequence, deliverySlot: slot,
        status: 'OUT_FOR_DELIVERY', generationKey: `${tag}gen${sequence}`, proofMode: 'RIDER_PHOTO_GPS',
        cashDuePaise: 10500, deliveryJobId: job.id, storeId: store.id,
      },
    });
    const stop = await prisma.deliveryRunStop.create({
      data: { deliveryRunId: run.id, subscriptionDeliveryId: delivery.id, deliveryJobId: job.id, sequenceNumber: sequence, status: 'READY', proofMode: 'RIDER_PHOTO_GPS', expectedItemCount: 1 },
    });
    return stop;
  };

  const amStop = await mkStop(amSub.id, 1, 'AM');
  const pmStop = await mkStop(pmSub.id, 2, 'PM');
  return { riderUser, run, amStop, pmStop, customer };
}

describe('rider run board — one customer with two subscriptions', () => {
  const service = new DeliveryRunOperationsService(
    new DeliveryWorkflowService(new DeliveryEventService()),
    {} as any,
    new SubscriptionCashFundingService(new SubscriptionCalendarService()),
    {} as any,
  );

  beforeAll(cleanup);
  afterAll(cleanup);

  test('exposes both stops with their own plan and slot so they are distinguishable', async () => {
    const { riderUser, run, amStop, pmStop, customer } = await seedTwoSubscriptions();

    const board = await service.details(run.id, { id: riderUser.id, role: Role.RIDER });

    expect(board.stops).toHaveLength(2);
    const stops = [...board.stops].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    // Same customer, two distinct subscriptions — one stop each.
    const subscriptionIds = stops.map((s: any) => s.subscriptionDelivery.subscription.id);
    expect(new Set(subscriptionIds).size).toBe(2);
    stops.forEach((s: any) => expect(s.subscriptionDelivery.subscription.customerId).toBe(customer.id));

    // Each stop carries its own plan name + slot, so the rider can tell them apart.
    expect(stops[0].subscriptionDelivery.subscription.plan.name).toBe('Cow Milk 1/2L · Morning');
    expect(stops[0].subscriptionDelivery.deliverySlot).toBe('AM');
    expect(stops[1].subscriptionDelivery.subscription.plan.name).toBe('Buffalo Milk 1L · Evening');
    expect(stops[1].subscriptionDelivery.deliverySlot).toBe('PM');

    // Distinct stops are independently addressable.
    expect(new Set([amStop.id, pmStop.id]).size).toBe(2);
  });
});