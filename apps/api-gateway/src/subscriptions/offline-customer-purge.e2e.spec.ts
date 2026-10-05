import { prisma, Role } from '@aagam/database';
import { OfflineCustomerService } from './offline-customer.service';

/**
 * Regression: purging a second offline customer that has historical orders
 * used to 500. The anonymize branch writes a single fixed `purged@offline.local`
 * email, which the second purge collided with on the unique email constraint.
 * Purged emails must be unique while still matching the offline identity
 * predicate (startsWith 'offline.'), otherwise the row becomes invisible to the
 * store's offline-customer views.
 */
const PREFIX = '_test_purge_';

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
  await prisma.codLedgerEntry.deleteMany({ where: { codLedger: { deliveryJobId: { in: jobIds } } } });
  await prisma.codLedger.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
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

describe('OfflineCustomerService.permanentDeleteCustomer', () => {
  const service = new OfflineCustomerService();

  beforeAll(cleanup);
  afterAll(cleanup);

  test('purges multiple order-bearing offline customers without an email collision', async () => {
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

    const makeCustomer = async (n: number, withSubscription: boolean) => {
      const customer = await prisma.user.create({
        data: {
          email: `${PREFIX}c${n}@aagaam.local`,
          phone: `90000000${n}${n}`,
          name: `Purge QA ${n}`,
          role: Role.CUSTOMER,
          acquisitionSource: 'OFFLINE_STORE',
          offlineStoreId: store.id,
        },
      });
      const address = await prisma.customerAddress.create({
        data: { userId: customer.id, recipientName: 'QA', phoneE164: `90000000${n}${n}`, line1: '1', city: 'Anakapalle', state: 'AP', pincode: '531001', latitude: 17.7, longitude: 83.3 },
      });
      const order = await prisma.order.create({
        data: { storeId: store.id, customerId: customer.id, status: 'OUT_FOR_DELIVERY', totalAmount: 105, orderSource: 'SUBSCRIPTION' },
      });
      if (withSubscription) {
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
            status: 'OUT_FOR_DELIVERY', generationKey: `${PREFIX}gen-${n}`, proofMode: 'RIDER_PHOTO_GPS',
            cashDuePaise: 10500, deliveryJobId: job.id, storeId: store.id,
          },
        });
        const run = await prisma.deliveryRun.create({
          data: {
            routeCode: `${PREFIX}run-${n}`, storeId: store.id, riderId: rider.id, serviceDate: new Date('2026-10-08'),
            slotStart: new Date('2026-10-08T05:00:00Z'), slotEnd: new Date('2026-10-08T09:00:00Z'), deliveryCluster: `QA-${n}`, status: 'IN_PROGRESS',
          },
        });
        await prisma.deliveryRunStop.create({
          data: { deliveryRunId: run.id, subscriptionDeliveryId: delivery.id, deliveryJobId: job.id, sequenceNumber: 1, status: 'ARRIVED', proofMode: 'RIDER_PHOTO_GPS', expectedItemCount: 1 },
        });
        await prisma.codLedger.create({
          data: { deliveryJobId: job.id, orderId: order.id, riderId: rider.id, expectedAmountPaise: 10500 },
        });
      }
      return customer;
    };

    const first = await makeCustomer(1, true);
    const second = await makeCustomer(2, true);

    const r1 = await service.permanentDeleteCustomer(first.id, { id: owner.id, role: Role.STORE_OWNER });
    const r2 = await service.permanentDeleteCustomer(second.id, { id: owner.id, role: Role.STORE_OWNER });
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    const rows = await prisma.user.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(rows).toHaveLength(2);
    const emails = rows.map((r) => r.email);
    expect(new Set(emails).size).toBe(2);
    for (const row of rows) {
      expect(row.isActive).toBe(false);
      expect(row.phone).toBeNull();
      expect(row.email?.startsWith('offline.')).toBe(true);
    }
  });
});
