import { DeliveryRunPlanningService } from './delivery-run-planning.service';

/**
 * Regression coverage for BUG-011 — a route whose earlier stop is already
 * delivered could not be re-packed/handed off as a whole because
 * `confirmPacking` validated every stop, including the terminal one.
 */
// Any enum export resolves to a proxy that returns the property name, so the
// service's transitive imports do not force us to enumerate every enum value.
jest.mock('@aagam/database', () => {
  const mockEnumProxy = new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) },
  );
  const base: Record<string, unknown> = {
    Prisma: new Proxy({}, {
      get: (_t, prop) => (prop === 'sql'
        ? (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })
        : prop),
    }),
    prisma: {
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn((globalThis as any).__tx)),
    },
  };
  return new Proxy(base, {
    get: (target, prop) => (prop in target ? target[prop as string] : mockEnumProxy),
  });
});

jest.mock('@aagam/types', () => ({
  DeliveryJobStatus: new Proxy(
    {},
    { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) },
  ),
}));

describe('DeliveryRunPlanningService.confirmPacking — partial route (BUG-011)', () => {
  const storeOwner = { id: 'owner-1', role: 'STORE_OWNER' as any };

  function buildTx(overrides: Record<string, unknown> = {}) {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      deliveryRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'run-1',
          routeCode: 'RUN-AAGA-AM',
          status: 'PLANNED',
          version: 5,
          expectedBagCount: 2,
          packedBagCount: 0,
          riderId: 'rider-1',
          store: { ownerId: 'owner-1' },
          stops: [
            {
              id: 'stop-1',
              sequenceNumber: 1,
              status: 'DELIVERED',
              subscriptionDeliveryId: 'del-1',
              deliveryJob: { orderId: 'order-1' },
            },
            {
              id: 'stop-2',
              sequenceNumber: 2,
              status: 'READY',
              subscriptionDeliveryId: 'del-2',
              deliveryJob: { orderId: 'order-2' },
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'run-1', status: 'READY_FOR_PICKUP' }),
      },
      order: {
        findUnique: jest.fn().mockResolvedValue({ status: 'RIDER_ASSIGNED' }),
        update: jest.fn().mockResolvedValue({}),
      },
      orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      subscriptionDelivery: { update: jest.fn().mockResolvedValue({}) },
      deliveryRunStop: { update: jest.fn().mockResolvedValue({}) },
      ...overrides,
    };
    (globalThis as any).__tx = tx;
    return tx;
  }

  it('packs the live stop and skips the already-delivered stop', async () => {
    const tx = buildTx();
    const service = new DeliveryRunPlanningService({} as any, {} as any);

    await service.confirmPacking(
      'run-1',
      { version: 5, expectedBagCount: 2, packedBagCount: 2 } as any,
      storeOwner,
    );

    // The delivered stop must not be re-packed or read as an order to pack.
    expect(tx.order.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.order.findUnique).toHaveBeenCalledWith({
      where: { id: 'order-2' },
      select: { status: true },
    });
    expect(tx.deliveryRunStop.update).toHaveBeenCalledTimes(1);
    expect(tx.deliveryRunStop.update).toHaveBeenCalledWith({
      where: { id: 'stop-2' },
      data: { status: 'READY' },
    });
    expect(tx.deliveryRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'READY_FOR_PICKUP', packedBagCount: 2 }),
      }),
    );
  });
});
