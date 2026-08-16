import { OrderStatus, Role, prisma } from '@aagam/database';
import { NotificationWorkerService } from '../notifications/notification-worker.service';
import {
  isOccupyingDeliveryJob,
  reconcileRiderOperationalStatus,
} from './rider-operational-status';

const DB_PREFIX = '_test_rider_ops_db_';

function decision(overrides: Partial<{ status: string; createdAt: Date; appliedAt: Date | null }> = {}) {
  return {
    status: 'DECIDED',
    createdAt: new Date(Date.now() - 30_000),
    appliedAt: null,
    ...overrides,
  };
}

function fakeTx() {
  return {
    deliveryJob: { findMany: jest.fn().mockResolvedValue([]) },
    deliveryRun: { count: jest.fn().mockResolvedValue(0) },
    riderProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe('rider operational status reconciliation', () => {
  const original = { ...process.env };
  beforeAll(() => Object.assign(process.env, { FAILURE_RIDER_RELEASE_AFTER_MS: '60000' }));
  afterAll(() => { process.env = original; });

  it('releases a Rider only for a DELIVERY_FAILED job with an unactioned stale decision', () => {
    expect(
      isOccupyingDeliveryJob({
        status: 'DELIVERY_FAILED',
        failureDecisions: [decision({ createdAt: new Date(Date.now() - 120_000) })],
      }),
    ).toBe(false);
    expect(
      isOccupyingDeliveryJob({
        status: 'DELIVERY_FAILED',
        failureDecisions: [decision({ createdAt: new Date(Date.now() - 30_000) })],
      }),
    ).toBe(true);
  });

  it('keeps the Rider BUSY while a decision is still being processed or already applied', () => {
    expect(
      isOccupyingDeliveryJob({
        status: 'DELIVERY_FAILED',
        failureDecisions: [decision({ status: 'IN_PROGRESS', createdAt: new Date(Date.now() - 120_000) })],
      }),
    ).toBe(true);
    expect(
      isOccupyingDeliveryJob({
        status: 'DELIVERY_FAILED',
        failureDecisions: [decision({ createdAt: new Date(Date.now() - 120_000), appliedAt: new Date() })],
      }),
    ).toBe(false);
  });

  it('always occupies a Rider while any other job status is active', () => {
    expect(isOccupyingDeliveryJob({ status: 'RIDER_EN_ROUTE_TO_STORE' })).toBe(true);
    expect(isOccupyingDeliveryJob({ status: 'OUT_FOR_DELIVERY' })).toBe(true);
  });

  it('reconciles to ONLINE when only a stale failure remains and stays BUSY for fresh work', async () => {
    const tx = fakeTx();
    tx.deliveryJob.findMany.mockResolvedValue([
      {
        id: 'stale-job',
        status: 'DELIVERY_FAILED',
        failureDecisions: [decision({ createdAt: new Date(Date.now() - 120_000) })],
      },
    ]);
    await expect(reconcileRiderOperationalStatus(tx, 'rider-1')).resolves.toBe('ONLINE');
    expect(tx.riderProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'rider-1', status: { not: 'OFFLINE' } },
      data: { status: 'ONLINE' },
    });

    tx.deliveryJob.findMany.mockResolvedValue([
      {
        id: 'fresh-job',
        status: 'DELIVERY_FAILED',
        failureDecisions: [decision({ createdAt: new Date(Date.now() - 30_000) })],
      },
    ]);
    await expect(reconcileRiderOperationalStatus(tx, 'rider-1')).resolves.toBe('BUSY');
  });

  it('keeps the Rider BUSY for active runs and never downgrades an OFFLINE Rider', async () => {
    const tx = fakeTx();
    tx.deliveryRun.count.mockResolvedValue(1);
    tx.deliveryJob.findMany.mockResolvedValue([]);
    await expect(reconcileRiderOperationalStatus(tx, 'rider-run')).resolves.toBe('BUSY');

    tx.riderProfile.updateMany.mockResolvedValue({ count: 0 });
    tx.deliveryRun.count.mockResolvedValue(0);
    await expect(reconcileRiderOperationalStatus(tx, 'rider-offline')).resolves.toBe('ONLINE');
    expect(tx.riderProfile.updateMany).toHaveBeenCalledWith({
      where: { id: 'rider-offline', status: { not: 'OFFLINE' } },
      data: { status: 'ONLINE' },
    });
  });
});

describe('worker sweep releases a Rider stuck BUSY on a stale failed delivery', () => {
  const original = { ...process.env };
  beforeAll(() =>
    Object.assign(process.env, { NODE_ENV: 'test', FAILURE_RIDER_RELEASE_AFTER_MS: '60000' }),
  );
  afterAll(async () => {
    process.env = original;
    await prisma.$disconnect();
  });

  async function cleanup() {
    const users = await prisma.user.findMany({
      where: { email: { contains: DB_PREFIX } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    const stores = await prisma.store.findMany({
      where: { name: { contains: DB_PREFIX } },
      select: { id: true },
    });
    const storeIds = stores.map(({ id }) => id);
    const orders = await prisma.order.findMany({
      where: { OR: [{ customerId: { in: userIds } }, { storeId: { in: storeIds } }] },
      select: { id: true },
    });
    const orderIds = orders.map(({ id }) => id);
    const jobs = await prisma.deliveryJob.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    const jobIds = jobs.map(({ id }) => id);
    await prisma.deliveryFailureDecision.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
    await prisma.deliveryEvent.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
    await prisma.dispatchAssignment.deleteMany({ where: { deliveryJobId: { in: jobIds } } });
    await prisma.deliveryJob.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  beforeEach(cleanup);

  async function stuckRider(suffix: string, decisionAgeMs: number) {
    const owner = await prisma.user.create({
      data: { email: `${DB_PREFIX}${suffix}_owner@test.com`, role: Role.STORE_OWNER },
    });
    const customer = await prisma.user.create({
      data: { email: `${DB_PREFIX}${suffix}_customer@test.com`, role: Role.CUSTOMER },
    });
    const riderUser = await prisma.user.create({
      data: { email: `${DB_PREFIX}${suffix}_rider@test.com`, role: Role.RIDER },
    });
    const riderProfile = await prisma.riderProfile.create({
      data: { userId: riderUser.id, status: 'BUSY' },
    });
    const store = await prisma.store.create({
      data: {
        name: `${DB_PREFIX}${suffix}_store`,
        address: 'Sweep test',
        latitude: 17.7,
        longitude: 83.3,
        ownerId: owner.id,
      },
    });
    const order = await prisma.order.create({
      data: {
        customerId: customer.id,
        storeId: store.id,
        status: OrderStatus.PACKED,
        totalAmount: 100,
        riderId: riderProfile.id,
      },
    });
    const job = await prisma.deliveryJob.create({
      data: {
        orderId: order.id,
        status: 'DELIVERY_FAILED',
        currentRiderId: riderProfile.id,
      },
    });
    const operationId = `dop_test_${suffix}_${Date.now()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DeliveryOperation" ("id", "deliveryJobId", "orderId", "type", "status", "actorUserId", "actorRole", "idempotencyKey", "details", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'FAILURE_RESOLUTION_DECIDED', 'COMPLETED', NULL, NULL, $4, '{}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      operationId,
      job.id,
      order.id,
      `test-failure:${operationId}`,
    );
    await prisma.deliveryFailureDecision.create({
      data: {
        deliveryJobId: job.id,
        orderId: order.id,
        failureOperationId: operationId,
        reason: 'CUSTOMER_UNREACHABLE',
        recommendedAction: 'RETRY_DELIVERY',
        decidedAction: 'RETRY_DELIVERY',
        status: 'DECIDED',
        policyVersion: 'test-v1',
        rationale: 'system retry',
        createdAt: new Date(Date.now() - decisionAgeMs),
      },
    });
    return { riderProfile };
  }

  it('reconciles the stuck Rider back ONLINE through the periodic worker sweep', async () => {
    const { riderProfile } = await stuckRider('stale', 120_000);

    const worker = new NotificationWorkerService(
      { claimBatch: jest.fn().mockResolvedValue([]), markProcessed: jest.fn(), markFailed: jest.fn() } as any,
      { processOutboxEvent: jest.fn() } as any,
      { get: jest.fn().mockReturnValue({ dispatchWaitingJobs: jest.fn().mockResolvedValue({} as any) }) } as any,
    );
    worker.onModuleInit();
    const result = await worker.processBatch(20);
    expect(result.releasedBusyRiders).toBe(1);

    const after = await prisma.riderProfile.findUnique({ where: { id: riderProfile.id } });
    expect(after?.status).toBe('ONLINE');
  });

  it('leaves a BUSY Rider alone when the failed delivery decision is still fresh', async () => {
    const { riderProfile } = await stuckRider('fresh', 30_000);

    const worker = new NotificationWorkerService(
      { claimBatch: jest.fn().mockResolvedValue([]), markProcessed: jest.fn(), markFailed: jest.fn() } as any,
      { processOutboxEvent: jest.fn() } as any,
      { get: jest.fn().mockReturnValue({ dispatchWaitingJobs: jest.fn().mockResolvedValue({} as any) }) } as any,
    );
    worker.onModuleInit();
    const result = await worker.processBatch(20);
    expect(result.releasedBusyRiders).toBe(0);

    const after = await prisma.riderProfile.findUnique({ where: { id: riderProfile.id } });
    expect(after?.status).toBe('BUSY');
  });
});