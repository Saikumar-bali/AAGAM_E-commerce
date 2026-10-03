import { prisma } from '@aagam/database';
import { SubscriptionAdminReportingService } from './subscription-admin-reporting.service';

// Every named export of @aagam/database resolves through a fallback proxy so
// the transitive import graph (dto decorators, plan/funding services) loads
// without enumerating each enum. Enum members resolve to their own name.
jest.mock('@aagam/database', () => {
  const enumish = new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) });
  const prismaMock = {
    $transaction: jest.fn(),
    customerSubscription: { findUnique: jest.fn(), update: jest.fn() },
    subscriptionDelivery: { findMany: jest.fn(), updateMany: jest.fn() },
    store: { findUnique: jest.fn() },
    order: { update: jest.fn() },
    subscriptionAuditEntry: { create: jest.fn() },
  };
  return new Proxy({ prisma: prismaMock }, {
    get(target, prop) {
      if (prop in target) return (target as Record<string, unknown>)[prop as string];
      if (typeof prop !== 'string') return undefined;
      if (prop === 'TransactionIsolationLevel') return { Serializable: 'Serializable' };
      if (prop === 'sql' || prop === 'join' || prop === 'raw') return () => '';
      return enumish;
    },
  });
});

/** Temporary CI coverage for whole-plan slot changes (removed after verification). */
describe('updateManualSubscription — slot change applies to the whole remaining plan', () => {
  const service = new SubscriptionAdminReportingService({} as any);
  const subscription = { id: 'sub-1', homeStoreId: 'store-1', completedDeliveries: 3 };

  beforeEach(() => jest.clearAllMocks());

  const useHappyTransaction = () => {
    (prisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(prisma));
    (prisma.customerSubscription.findUnique as jest.Mock).mockResolvedValue(subscription);
    (prisma.customerSubscription.update as jest.Mock).mockImplementation(({ data }: any) => ({ ...subscription, ...data }));
  };

  it('moves window + remaining deliveries to PM and re-syncs generated orders', async () => {
    useHappyTransaction();

    const remaining = [
      { id: 'd1', serviceDate: new Date('2026-10-04T00:00:00.000Z') },
      { id: 'd2', serviceDate: new Date('2026-10-05T00:00:00.000Z') },
      { id: 'd3', serviceDate: new Date('2026-10-06T00:00:00.000Z') },
    ];
    // d3's date already holds a PM row (split plan) — unique guard excludes it.
    const targetDates = [{ serviceDate: new Date('2026-10-06T00:00:00.000Z') }];
    const flipped = [
      { serviceDate: new Date('2026-10-04T00:00:00.000Z'), order: { id: 'o1' } },
      { serviceDate: new Date('2026-10-05T00:00:00.000Z'), order: null },
    ];
    (prisma.subscriptionDelivery.findMany as jest.Mock)
      .mockResolvedValueOnce(remaining)
      .mockResolvedValueOnce(targetDates)
      .mockResolvedValueOnce(flipped);
    (prisma.subscriptionDelivery.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.store.findUnique as jest.Mock).mockResolvedValue({ timezone: 'Asia/Kolkata' });

    const result: any = await service.updateManualSubscription('sub-1', { deliverySlot: 'EVENING' }, 'actor-1');

    // Subscription window moves to 17:00–20:00.
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({ deliveryWindowStartMinute: 1020, deliveryWindowEndMinute: 1200 }),
    });

    // Only not-yet-executed deliveries are candidates; history is untouched.
    const remainingQuery = (prisma.subscriptionDelivery.findMany as jest.Mock).mock.calls[0][0];
    expect(remainingQuery.where.deliverySlot).toEqual({ not: 'PM' });
    expect(remainingQuery.where.status.in).toEqual(
      expect.arrayContaining(['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED', 'RESCHEDULED']),
    );
    expect(remainingQuery.where.status.in).not.toEqual(
      expect.arrayContaining(['DELIVERED', 'SKIPPED', 'FAILED', 'CANCELLED']),
    );

    // Split-guard excluded d3; d1 + d2 flipped to PM.
    expect(prisma.subscriptionDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['d1', 'd2'] } },
      data: { deliverySlot: 'PM' },
    });

    // The already-generated order for 4 Oct now carries the PM window
    // (17:00–20:00 IST == 11:30–14:30 UTC).
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: {
        deliveryWindowStart: new Date('2026-10-04T11:30:00.000Z'),
        deliveryWindowEnd: new Date('2026-10-04T14:30:00.000Z'),
      },
    });

    // Counts reach the UI and the audit trail.
    expect(result.slotChange).toEqual({ deliveries: 2, orders: 1 });
    expect(prisma.subscriptionAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ slotChange: { deliveries: 2, orders: 1 } }),
        }),
      }),
    );
  });

  it('leaves deliveries alone when the slot is not a single-slot change (BOTH)', async () => {
    useHappyTransaction();

    const result: any = await service.updateManualSubscription('sub-1', { deliverySlot: 'BOTH' }, 'actor-1');

    expect(prisma.subscriptionDelivery.findMany).not.toHaveBeenCalled();
    expect(prisma.subscriptionDelivery.updateMany).not.toHaveBeenCalled();
    expect(result.slotChange).toBeUndefined();
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: expect.objectContaining({ deliveryWindowStartMinute: 360, deliveryWindowEndMinute: 540 }),
    });
  });

  it('keeps balance-only edits free of delivery changes', async () => {
    useHappyTransaction();

    await service.updateManualSubscription('sub-1', { amountDuePaise: 100, amountCollectedPaise: 50 }, 'actor-1');

    expect(prisma.subscriptionDelivery.findMany).not.toHaveBeenCalled();
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: { amountDuePaise: 100, amountCollectedPaise: 50 },
    });
    expect(prisma.subscriptionAuditEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: { changes: { amountDuePaise: 100, amountCollectedPaise: 50 } } }),
      }),
    );
  });
});
