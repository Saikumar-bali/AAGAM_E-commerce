import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

jest.mock('@aagam/database', () => ({
  prisma: {},
  SubscriptionDeliveryStatus: {
    SCHEDULED: 'SCHEDULED',
    ORDER_GENERATED: 'ORDER_GENERATED',
    PREPARING: 'PREPARING',
    PACKED: 'PACKED',
    ASSIGNED: 'ASSIGNED',
    DELIVERED: 'DELIVERED',
    SKIPPED: 'SKIPPED',
    CANCELLED: 'CANCELLED',
  },
}));

describe('SubscriptionLifecycleService', () => {
  const service = new SubscriptionLifecycleService();

  const tx = () => ({
    deliveryRunStop: {
      findUnique: jest.fn().mockResolvedValue({ id: 'stop-1', deliveryRunId: 'run-1', deliveryJobId: 'job-1' }),
      update: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 2 }, _sum: { cashDuePaise: 1500, expectedItemCount: 2, expectedParcelCount: 2 } }),
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn(),
    },
    deliveryRun: { update: jest.fn().mockResolvedValue({}) },
    deliveryJob: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionDelivery: {
      findUnique: jest.fn().mockResolvedValue({ deliveryJobId: 'job-1', order: { id: 'order-1' } }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  });

  it('cancels the run stop, delivery job and order for a skipped delivery', async () => {
    const t = tx();
    const result = await service.cancelRiderArtifactsWithinTransaction(t as any, 'del-1', 'skipped');

    expect(result).toEqual({ cancelledStop: true, cancelledJob: true, cancelledOrder: true });
    expect(t.deliveryRunStop.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(t.deliveryJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(t.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
    expect(t.deliveryRun.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalStopCount: 2, completedStopCount: 1 }) }),
    );
  });

  it('does not fail when a delivery never generated a rider stop', async () => {
    const t = tx();
    t.deliveryRunStop.findUnique.mockResolvedValue(null);
    t.subscriptionDelivery.findUnique.mockResolvedValue({ deliveryJobId: null, order: null });

    const result = await service.cancelRiderArtifactsWithinTransaction(t as any, 'del-2', 'skipped');

    expect(result).toEqual({ cancelledStop: false, cancelledJob: false, cancelledOrder: false });
    expect(t.deliveryRun.update).not.toHaveBeenCalled();
  });

  it('cancels artifacts only for non-terminal deliveries in a pause window', async () => {
    const t = tx();
    t.subscriptionDelivery.findMany.mockResolvedValue([{ id: 'del-1' }, { id: 'del-2' }]);
    t.deliveryRunStop.findUnique
      .mockResolvedValueOnce({ id: 'stop-1', deliveryRunId: 'run-1', deliveryJobId: 'job-1' })
      .mockResolvedValueOnce(null);

    const count = await service.cancelPausedRiderArtifactsWithinTransaction(t as any, 'sub-1', new Date('2026-10-05'), 'paused');

    expect(count).toBe(2);
    expect(t.subscriptionDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subscriptionId: 'sub-1',
          status: { notIn: ['DELIVERED', 'CANCELLED', 'SKIPPED'] },
        }),
      }),
    );
  });

  it('marks paused-window occurrences as not taken and keeps their order', async () => {
    const t = tx();
    t.subscriptionDelivery.findMany.mockResolvedValue([{ id: 'del-1' }]);

    const count = await service.cancelPausedRiderArtifactsWithinTransaction(t as any, 'sub-1', new Date('2026-10-05'), 'paused');

    expect(count).toBe(1);
    expect(t.order.updateMany).not.toHaveBeenCalled();
    expect(t.subscriptionDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED', skipReason: 'PAUSED_WINDOW' }) }),
    );
  });

  it('restores paused occurrences on resume, keeping generated rows as ORDER_GENERATED', async () => {
    const t = tx();
    t.subscriptionDelivery.findMany.mockResolvedValue([
      { id: 'del-1', order: { id: 'order-1' } },
      { id: 'del-2', order: null },
    ]);

    const restored = await service.restorePausedDeliveriesWithinTransaction(t as any, 'sub-1', new Date('2026-10-05'));

    expect(restored).toBe(2);
    expect(t.subscriptionDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'del-1' }, data: expect.objectContaining({ status: 'ORDER_GENERATED' }) }),
    );
    expect(t.subscriptionDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'del-2' }, data: expect.objectContaining({ status: 'SCHEDULED' }) }),
    );
  });

  it('shifts non-terminal deliveries and their orders on resume', async () => {
    const t = tx();
    t.subscriptionDelivery.findMany.mockResolvedValue([
      { id: 'del-1', serviceDate: new Date('2026-10-05T00:00:00.000Z') },
      { id: 'del-2', serviceDate: new Date('2026-10-06T00:00:00.000Z') },
    ]);

    const shifted = await service.shiftResumedDeliveriesWithinTransaction(t as any, 'sub-1', new Date('2026-10-05'), 3);

    expect(shifted).toBe(2);
    expect(t.subscriptionDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'del-1' },
        data: expect.objectContaining({ serviceDate: new Date('2026-10-08T00:00:00.000Z') }),
      }),
    );
    expect(t.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { scheduledDeliveryDate: new Date('2026-10-08T00:00:00.000Z') } }),
    );
  });
});
