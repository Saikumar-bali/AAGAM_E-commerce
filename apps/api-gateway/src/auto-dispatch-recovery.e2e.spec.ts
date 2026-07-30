import { OrderStatus, Prisma, Role, prisma } from '@aagam/database';
import { DeliveryJobStatus, DispatchAssignmentStatus } from '@aagam/types';
import { NotificationWorkerService } from './notifications/notification-worker.service';
import { AutoDispatchService } from './orders/auto-dispatch.service';
import { DeliveryEventService } from './orders/delivery-event.service';
import { RiderService } from './riders/rider.service';

const PREFIX = '_test_auto_dispatch_recovery_';
const dispatch = () => new AutoDispatchService(new DeliveryEventService());

async function ids() {
  const users = await prisma.user.findMany({ where: { email: { contains: PREFIX } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  const stores = await prisma.store.findMany({ where: { name: { contains: PREFIX } }, select: { id: true } });
  const storeIds = stores.map(({ id }) => id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }] },
    select: { id: true },
  });
  const orderIds = orders.map(({ id }) => id);
  const jobs = await prisma.deliveryJob.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  return { userIds, storeIds, orderIds, jobIds: jobs.map(({ id }) => id) };
}

async function cleanup() {
  const x = await ids();
  await prisma.notificationDeliveryAttempt.deleteMany({ where: { recipient: { userId: { in: x.userIds } } } });
  await prisma.notificationRecipient.deleteMany({ where: { userId: { in: x.userIds } } });
  await prisma.notification.deleteMany({ where: { OR: [{ orderId: { in: x.orderIds } }, { deliveryJobId: { in: x.jobIds } }] } });
  await prisma.outboxEvent.deleteMany({ where: { OR: [{ aggregateId: { in: x.orderIds } }, { aggregateId: { in: x.jobIds } }] } });
  await prisma.deliveryEvent.deleteMany({ where: { deliveryJobId: { in: x.jobIds } } });
  await prisma.dispatchAssignment.deleteMany({ where: { deliveryJobId: { in: x.jobIds } } });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: x.jobIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: x.orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: x.orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: x.orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: x.orderIds } } });
  await prisma.riderProfile.deleteMany({ where: { userId: { in: x.userIds } } });
  await prisma.store.deleteMany({ where: { id: { in: x.storeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: x.userIds } } });
}

async function waiting(suffix: string) {
  const owner = await prisma.user.create({ data: { email: `${PREFIX}owner_${suffix}@test.com`, role: Role.STORE_OWNER } });
  const customer = await prisma.user.create({ data: { email: `${PREFIX}customer_${suffix}@test.com`, role: Role.CUSTOMER } });
  const store = await prisma.store.create({
    data: { name: `${PREFIX}store_${suffix}`, address: 'Dispatch test', latitude: 17.7, longitude: 83.3, ownerId: owner.id },
  });
  const order = await prisma.order.create({
    data: { customerId: customer.id, storeId: store.id, status: OrderStatus.PACKED, totalAmount: 100, packedAt: new Date() },
  });
  const job = await prisma.deliveryJob.create({ data: { orderId: order.id, status: DeliveryJobStatus.WAITING_FOR_DISPATCH } });
  return { owner, customer, store, order, job };
}

async function rider(suffix: string, status: 'ONLINE' | 'OFFLINE' | 'BUSY', lat: number | null, lng: number | null) {
  const user = await prisma.user.create({ data: { email: `${PREFIX}rider_${suffix}@test.com`, role: Role.RIDER } });
  const profile = await prisma.riderProfile.create({ data: { userId: user.id, status, latitude: lat, longitude: lng } });
  if (status === 'ONLINE' && lat != null && lng != null) {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "RiderAvailabilityLocation" ("riderProfileId", "latitude", "longitude", "capturedAt", "updatedAt")
      VALUES (${profile.id}, ${lat}, ${lng}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
  }
  return { user, profile };
}

async function openOffer(jobId: string, riderId: string) {
  return prisma.dispatchAssignment.create({
    data: {
      deliveryJobId: jobId,
      riderProfileId: riderId,
      status: DispatchAssignmentStatus.OFFERED,
      offeredAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

describe('automatic dispatch recovery E2E', () => {
  const original = { ...process.env };
  beforeAll(() => Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_DISPATCH_ENABLED: 'true', AUTO_DISPATCH_MAX_PICKUP_KM: '8',
    AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS: '180', AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS: '30',
  }));
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); process.env = original; await prisma.$disconnect(); });

  it('selects the nearest fresh online Rider and excludes busy/offline/outside Riders', async () => {
    const target = await waiting(`select_${Date.now()}`);
    const nearest = await rider('nearest', 'ONLINE', 17.701, 83.301);
    await rider('offline', 'OFFLINE', 17.7001, 83.3001);
    await rider('outside', 'ONLINE', 18.2, 83.8);
    const busy = await rider('busy', 'ONLINE', 17.7002, 83.3002);
    const busyOrder = await prisma.order.create({ data: { customerId: target.customer.id, storeId: target.store.id, status: OrderStatus.RIDER_ASSIGNED, totalAmount: 50, riderId: busy.profile.id } });
    await prisma.deliveryJob.create({ data: { orderId: busyOrder.id, status: DeliveryJobStatus.RIDER_ASSIGNED, currentRiderId: busy.profile.id } });
    await expect(dispatch().dispatchNearestRider(target.job.id)).resolves.toMatchObject({ offered: true, riderProfileId: nearest.profile.id });
  });

  it('wakes a waiting job when a Rider explicitly goes online with current GPS', async () => {
    const target = await waiting(`online_${Date.now()}`);
    const candidate = await rider('late', 'OFFLINE', null, null);
    await new RiderService(dispatch()).updateStatusForUser(candidate.user.id, { status: 'ONLINE', latitude: 17.7005, longitude: 83.3005 });
    expect(await prisma.dispatchAssignment.findFirst({ where: { deliveryJobId: target.job.id, riderProfileId: candidate.profile.id, status: DispatchAssignmentStatus.OFFERED } })).not.toBeNull();
  });

  it('uses the dedicated capture timestamp and rejects a stale heartbeat after OFFLINE', async () => {
    const target = await waiting(`fresh_${Date.now()}`);
    const candidate = await rider('fresh', 'ONLINE', 17.7005, 83.3005);
    await prisma.$executeRaw(Prisma.sql`UPDATE "RiderAvailabilityLocation" SET "capturedAt" = ${new Date(Date.now() - 600_000)} WHERE "riderProfileId" = ${candidate.profile.id}`);
    await expect(dispatch().dispatchNearestRider(target.job.id)).resolves.toMatchObject({ offered: false, reason: 'NO_FRESH_AVAILABLE_RIDER' });
    const service = new RiderService(dispatch());
    await service.updateStatusForUser(candidate.user.id, { status: 'OFFLINE' });
    await expect(service.updateStatusForUser(candidate.user.id, { status: 'ONLINE', heartbeat: true, latitude: 17.7006, longitude: 83.3006 })).rejects.toThrow('cannot reactivate');
  });

  it('worker sweep recovers a waiting/reassigned job', async () => {
    const target = await waiting(`worker_${Date.now()}`);
    const candidate = await rider('worker', 'ONLINE', 17.7004, 83.3004);
    const auto = dispatch();
    const worker = new NotificationWorkerService(
      { claimBatch: jest.fn().mockResolvedValue([]), markProcessed: jest.fn(), markFailed: jest.fn() } as any,
      { processOutboxEvent: jest.fn() } as any,
      { get: jest.fn().mockReturnValue(auto) } as any,
    );
    worker.onModuleInit();
    await worker.processBatch();
    expect(await prisma.dispatchAssignment.findFirst({ where: { deliveryJobId: target.job.id, riderProfileId: candidate.profile.id, status: DispatchAssignmentStatus.OFFERED } })).not.toBeNull();
  });

  it('does not let capped sweeps starve an unoffered job behind jobs with live offers', async () => {
    const blocked = await waiting(`blocked_${Date.now()}`);
    const target = await waiting(`target_${Date.now()}`);
    const first = await rider('first', 'ONLINE', 17.7002, 83.3002);
    const recovery = await rider('recovery', 'ONLINE', 17.7004, 83.3004);
    await openOffer(blocked.job.id, first.profile.id);
    const result = await dispatch().dispatchWaitingJobs(1);
    expect(result).toEqual({ scanned: 1, offered: 1 });
    expect(await prisma.dispatchAssignment.findFirst({ where: { deliveryJobId: target.job.id, riderProfileId: recovery.profile.id } })).not.toBeNull();
  });

  it('pages past ineligible waiting jobs instead of starving a later dispatchable job', async () => {
    const blocked = await waiting(`ineligible_${Date.now()}`);
    const target = await waiting(`eligible_${Date.now()}`);
    await prisma.store.update({
      where: { id: blocked.store.id },
      data: { latitude: 18.2, longitude: 83.8 },
    });
    const recovery = await rider('paged_recovery', 'ONLINE', 17.7004, 83.3004);

    const result = await dispatch().dispatchWaitingJobs(1);

    expect(result).toEqual({ scanned: 2, offered: 1 });
    expect(
      await prisma.dispatchAssignment.findFirst({
        where: {
          deliveryJobId: target.job.id,
          riderProfileId: recovery.profile.id,
          status: DispatchAssignmentStatus.OFFERED,
        },
      }),
    ).not.toBeNull();
  });

  it('starts Rider retry cooldown when an offer is answered', async () => {
    const target = await waiting(`cooldown_${Date.now()}`);
    const nearest = await rider('cooldown_nearest', 'ONLINE', 17.7001, 83.3001);
    const fallback = await rider('cooldown_fallback', 'ONLINE', 17.705, 83.305);
    const old = new Date(Date.now() - 120_000);
    const assignment = await prisma.dispatchAssignment.create({
      data: {
        deliveryJobId: target.job.id,
        riderProfileId: nearest.profile.id,
        status: DispatchAssignmentStatus.OFFERED,
        offeredAt: old,
        expiresAt: new Date(old.getTime() + 60_000),
        createdAt: old,
      },
    });
    await prisma.dispatchAssignment.update({
      where: { id: assignment.id },
      data: {
        status: DispatchAssignmentStatus.EXPIRED,
        respondedAt: new Date(),
      },
    });

    await expect(dispatch().dispatchNearestRider(target.job.id)).resolves.toMatchObject({
      offered: true,
      riderProfileId: fallback.profile.id,
    });
  });

  it('bounds each sweep and resumes from its persistent waiting-job cursor', async () => {
    const previous = process.env.AUTO_DISPATCH_RECONCILE_SCAN_LIMIT;
    process.env.AUTO_DISPATCH_RECONCILE_SCAN_LIMIT = '2';
    try {
      const firstBlocked = await waiting(`bounded_a_${Date.now()}`);
      const secondBlocked = await waiting(`bounded_b_${Date.now()}`);
      const target = await waiting(`bounded_target_${Date.now()}`);
      await prisma.store.updateMany({
        where: { id: { in: [firstBlocked.store.id, secondBlocked.store.id] } },
        data: { latitude: 18.2, longitude: 83.8 },
      });
      const recovery = await rider('bounded_recovery', 'ONLINE', 17.7004, 83.3004);
      const service = dispatch();

      await expect(service.dispatchWaitingJobs(1)).resolves.toEqual({ scanned: 2, offered: 0 });
      await expect(service.dispatchWaitingJobs(1)).resolves.toEqual({ scanned: 1, offered: 1 });
      expect(
        await prisma.dispatchAssignment.findFirst({
          where: {
            deliveryJobId: target.job.id,
            riderProfileId: recovery.profile.id,
            status: DispatchAssignmentStatus.OFFERED,
          },
        }),
      ).not.toBeNull();
    } finally {
      if (previous === undefined) delete process.env.AUTO_DISPATCH_RECONCILE_SCAN_LIMIT;
      else process.env.AUTO_DISPATCH_RECONCILE_SCAN_LIMIT = previous;
    }
  });

  it('prevents active Riders from going offline and concurrent jobs from double-offering one Rider', async () => {
    const first = await waiting(`concurrent_a_${Date.now()}`);
    const second = await waiting(`concurrent_b_${Date.now()}`);
    const candidate = await rider('single', 'ONLINE', 17.7003, 83.3003);
    await Promise.all([dispatch().dispatchNearestRider(first.job.id), dispatch().dispatchNearestRider(second.job.id)]);
    expect(await prisma.dispatchAssignment.count({ where: { riderProfileId: candidate.profile.id, status: DispatchAssignmentStatus.OFFERED } })).toBe(1);
    const assignedJob = await prisma.deliveryJob.findFirst({ where: { assignments: { some: { riderProfileId: candidate.profile.id, status: DispatchAssignmentStatus.OFFERED } } } });
    await prisma.deliveryJob.update({ where: { id: assignedJob!.id }, data: { status: DeliveryJobStatus.RIDER_ASSIGNED, currentRiderId: candidate.profile.id } });
    await expect(new RiderService(dispatch()).updateStatusForUser(candidate.user.id, { status: 'OFFLINE' })).rejects.toThrow('before going offline');
  });
});
