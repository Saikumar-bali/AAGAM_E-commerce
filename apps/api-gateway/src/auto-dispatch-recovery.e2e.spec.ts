import { OrderStatus, Role, prisma } from '@aagam/database';
import { DeliveryJobStatus, DispatchAssignmentStatus } from '@aagam/types';
import { AutoDispatchService } from './orders/auto-dispatch.service';
import { DeliveryEventService } from './orders/delivery-event.service';
import { RiderService } from './riders/rider.service';
import { NotificationWorkerService } from './notifications/notification-worker.service';

const PREFIX = '_test_auto_dispatch_recovery_';

async function testIds() {
  const users = await prisma.user.findMany({
    where: { email: { contains: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const stores = await prisma.store.findMany({
    where: { name: { contains: PREFIX } },
    select: { id: true },
  });
  const storeIds = stores.map((store) => store.id);
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { customerId: { in: userIds } },
        { storeId: { in: storeIds } },
      ],
    },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  const jobs = await prisma.deliveryJob.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  return {
    userIds,
    storeIds,
    orderIds,
    jobIds: jobs.map((job) => job.id),
  };
}

async function cleanup() {
  const ids = await testIds();
  await prisma.notificationDeliveryAttempt.deleteMany({
    where: { recipient: { userId: { in: ids.userIds } } },
  });
  await prisma.notificationRecipient.deleteMany({
    where: { userId: { in: ids.userIds } },
  });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { orderId: { in: ids.orderIds } },
        { deliveryJobId: { in: ids.jobIds } },
      ],
    },
  });
  await prisma.outboxEvent.deleteMany({
    where: {
      OR: [
        { aggregateId: { in: ids.orderIds } },
        { aggregateId: { in: ids.jobIds } },
      ],
    },
  });
  await prisma.deliveryEvent.deleteMany({
    where: { deliveryJobId: { in: ids.jobIds } },
  });
  await prisma.dispatchAssignment.deleteMany({
    where: { deliveryJobId: { in: ids.jobIds } },
  });
  await prisma.deliveryJob.deleteMany({ where: { id: { in: ids.jobIds } } });
  await prisma.orderStatusHistory.deleteMany({
    where: { orderId: { in: ids.orderIds } },
  });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids.orderIds } } });
  await prisma.orderItem.deleteMany({
    where: { orderId: { in: ids.orderIds } },
  });
  await prisma.order.deleteMany({ where: { id: { in: ids.orderIds } } });
  await prisma.riderProfile.deleteMany({
    where: { userId: { in: ids.userIds } },
  });
  await prisma.store.deleteMany({ where: { id: { in: ids.storeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
}

async function seedWaitingJob(suffix: string, storeLat = 17.7, storeLng = 83.3) {
  const owner = await prisma.user.create({
    data: {
      email: `${PREFIX}owner_${suffix}@test.com`,
      name: 'Store Owner',
      role: Role.STORE_OWNER,
    },
  });
  const customer = await prisma.user.create({
    data: {
      email: `${PREFIX}customer_${suffix}@test.com`,
      name: 'Customer',
      role: Role.CUSTOMER,
    },
  });
  const store = await prisma.store.create({
    data: {
      name: `${PREFIX}store_${suffix}`,
      address: 'Auto dispatch test store',
      latitude: storeLat,
      longitude: storeLng,
      ownerId: owner.id,
    },
  });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      storeId: store.id,
      status: OrderStatus.PACKED,
      totalAmount: 100,
      subtotal: 100,
      grandTotal: 100,
      subtotalPaise: 10_000,
      grandTotalPaise: 10_000,
      packedAt: new Date(),
    },
  });
  const job = await prisma.deliveryJob.create({
    data: {
      orderId: order.id,
      status: DeliveryJobStatus.WAITING_FOR_DISPATCH,
    },
  });
  return { owner, customer, store, order, job };
}

async function seedRider(
  suffix: string,
  status: 'ONLINE' | 'OFFLINE' | 'BUSY',
  latitude: number | null,
  longitude: number | null,
) {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}rider_${suffix}@test.com`,
      name: `Rider ${suffix}`,
      role: Role.RIDER,
    },
  });
  const rider = await prisma.riderProfile.create({
    data: {
      userId: user.id,
      status,
      latitude,
      longitude,
    },
  });
  return { user, rider };
}

describe('auto-dispatch recovery and Rider availability E2E', () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.AUTO_DISPATCH_ENABLED,
    maxKm: process.env.AUTO_DISPATCH_MAX_PICKUP_KM,
    maxAge: process.env.AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS,
    cooldown: process.env.AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS,
  };

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.AUTO_DISPATCH_ENABLED = 'true';
    process.env.AUTO_DISPATCH_MAX_PICKUP_KM = '8';
    process.env.AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS = '180';
    process.env.AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS = '30';
  });

  beforeEach(async () => cleanup());

  afterAll(async () => {
    await cleanup();
    if (original.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original.nodeEnv;
    if (original.enabled === undefined) delete process.env.AUTO_DISPATCH_ENABLED;
    else process.env.AUTO_DISPATCH_ENABLED = original.enabled;
    if (original.maxKm === undefined) delete process.env.AUTO_DISPATCH_MAX_PICKUP_KM;
    else process.env.AUTO_DISPATCH_MAX_PICKUP_KM = original.maxKm;
    if (original.maxAge === undefined) delete process.env.AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS;
    else process.env.AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS = original.maxAge;
    if (original.cooldown === undefined) delete process.env.AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS;
    else process.env.AUTO_DISPATCH_RETRY_COOLDOWN_SECONDS = original.cooldown;
    await prisma.$disconnect();
  });

  it('offers the nearest fresh online Rider while excluding offline, busy, and outside-radius Riders', async () => {
    const events = new DeliveryEventService();
    const dispatch = new AutoDispatchService(events);
    const target = await seedWaitingJob(`target_${Date.now()}`);

    const nearest = await seedRider('nearest', 'ONLINE', 17.701, 83.301);
    await seedRider('offline', 'OFFLINE', 17.7001, 83.3001);
    await seedRider('outside', 'ONLINE', 18.2, 83.8);
    const busy = await seedRider('busy', 'ONLINE', 17.7002, 83.3002);

    const busyOrder = await prisma.order.create({
      data: {
        customerId: target.customer.id,
        storeId: target.store.id,
        status: OrderStatus.RIDER_ASSIGNED,
        totalAmount: 50,
        riderId: busy.rider.id,
      },
    });
    await prisma.deliveryJob.create({
      data: {
        orderId: busyOrder.id,
        status: DeliveryJobStatus.RIDER_ASSIGNED,
        currentRiderId: busy.rider.id,
      },
    });

    const result = await dispatch.dispatchNearestRider(target.job.id);
    expect(result).toMatchObject({
      offered: true,
      reason: 'OFFERED',
      riderProfileId: nearest.rider.id,
    });

    const assignments = await prisma.dispatchAssignment.findMany({
      where: { deliveryJobId: target.job.id },
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].status).toBe(DispatchAssignmentStatus.OFFERED);
    expect(assignments[0].createdByUserId).toBeNull();
  });

  it('immediately wakes a waiting job when an offline Rider goes online with GPS', async () => {
    const dispatch = new AutoDispatchService(new DeliveryEventService());
    const riders = new RiderService(dispatch);
    const target = await seedWaitingJob(`online_${Date.now()}`);
    const candidate = await seedRider('late_online', 'OFFLINE', null, null);

    await expect(
      riders.updateStatusForUser(candidate.user.id, {
        status: 'ONLINE',
        latitude: 17.7005,
        longitude: 83.3005,
      }),
    ).resolves.toMatchObject({ status: 'ONLINE' });

    const assignment = await prisma.dispatchAssignment.findFirst({
      where: {
        deliveryJobId: target.job.id,
        riderProfileId: candidate.rider.id,
        status: DispatchAssignmentStatus.OFFERED,
      },
    });
    expect(assignment).not.toBeNull();
  });

  it('refreshes stale online coordinates through the availability heartbeat before dispatch', async () => {
    const dispatch = new AutoDispatchService(new DeliveryEventService());
    const riders = new RiderService(dispatch);
    const target = await seedWaitingJob(`freshness_${Date.now()}`);
    const candidate = await seedRider(
      'stale',
      'ONLINE',
      17.7005,
      83.3005,
    );
    await prisma.riderProfile.update({
      where: { id: candidate.rider.id },
      data: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });

    const staleResult = await dispatch.dispatchNearestRider(target.job.id);
    expect(staleResult.offered).toBe(false);
    expect(staleResult.reason).toBe('NO_FRESH_AVAILABLE_RIDER');

    await riders.updateStatusForUser(candidate.user.id, {
      status: 'ONLINE',
      latitude: 17.7006,
      longitude: 83.3006,
    });
    const sweep = await dispatch.dispatchWaitingJobs();
    expect(sweep.offered).toBe(1);
  });

  it('recovers a waiting job through the notification worker sweep, including failure reassignments', async () => {
    const dispatch = new AutoDispatchService(new DeliveryEventService());
    const target = await seedWaitingJob(`worker_${Date.now()}`);
    const candidate = await seedRider('worker_candidate', 'ONLINE', 17.7004, 83.3004);
    const outbox = {
      claimBatch: jest.fn().mockResolvedValue([]),
      markProcessed: jest.fn(),
      markFailed: jest.fn(),
    };
    const notifications = { processOutboxEvent: jest.fn() };
    const moduleRef = { get: jest.fn().mockReturnValue(dispatch) };
    const worker = new NotificationWorkerService(
      outbox as any,
      notifications as any,
      moduleRef as any,
    );
    worker.onModuleInit();

    const result = await worker.processBatch();
    expect(result.failed).toBe(0);
    expect(
      await prisma.dispatchAssignment.findFirst({
        where: {
          deliveryJobId: target.job.id,
          riderProfileId: candidate.rider.id,
          status: DispatchAssignmentStatus.OFFERED,
        },
      }),
    ).not.toBeNull();
  });

  it('prevents a Rider with an active delivery from going offline', async () => {
    const dispatch = new AutoDispatchService(new DeliveryEventService());
    const riders = new RiderService(dispatch);
    const target = await seedWaitingJob(`offline_guard_${Date.now()}`);
    const candidate = await seedRider('active', 'BUSY', 17.7, 83.3);

    await prisma.deliveryJob.update({
      where: { id: target.job.id },
      data: {
        status: DeliveryJobStatus.RIDER_ASSIGNED,
        currentRiderId: candidate.rider.id,
      },
    });
    await prisma.order.update({
      where: { id: target.order.id },
      data: {
        status: OrderStatus.RIDER_ASSIGNED,
        riderId: candidate.rider.id,
      },
    });

    await expect(
      riders.updateStatusForUser(candidate.user.id, { status: 'OFFLINE' }),
    ).rejects.toThrow('before going offline');
  });

  it('never creates two simultaneous offers for the same Rider across concurrent jobs', async () => {
    const dispatch = new AutoDispatchService(new DeliveryEventService());
    const first = await seedWaitingJob(`concurrent_a_${Date.now()}`);
    const second = await seedWaitingJob(`concurrent_b_${Date.now()}`);
    const candidate = await seedRider(
      'one_offer_only',
      'ONLINE',
      17.7003,
      83.3003,
    );

    await Promise.all([
      dispatch.dispatchNearestRider(first.job.id),
      dispatch.dispatchNearestRider(second.job.id),
    ]);

    const openOffers = await prisma.dispatchAssignment.findMany({
      where: {
        riderProfileId: candidate.rider.id,
        status: DispatchAssignmentStatus.OFFERED,
      },
    });
    expect(openOffers).toHaveLength(1);
  });

  it('allows a previously expired Rider to be retried after the cooldown', async () => {
    const dispatch = new AutoDispatchService(new DeliveryEventService());
    const target = await seedWaitingJob(`cooldown_${Date.now()}`);
    const candidate = await seedRider('retry', 'ONLINE', 17.7005, 83.3005);

    await prisma.dispatchAssignment.create({
      data: {
        deliveryJobId: target.job.id,
        riderProfileId: candidate.rider.id,
        status: DispatchAssignmentStatus.EXPIRED,
        offeredAt: new Date(Date.now() - 5 * 60 * 1000),
        respondedAt: new Date(Date.now() - 4 * 60 * 1000),
        expiresAt: new Date(Date.now() - 4 * 60 * 1000),
        createdAt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });

    const result = await dispatch.dispatchNearestRider(target.job.id);
    expect(result).toMatchObject({
      offered: true,
      riderProfileId: candidate.rider.id,
    });
    expect(
      await prisma.dispatchAssignment.count({
        where: { deliveryJobId: target.job.id },
      }),
    ).toBe(2);
  });
});
