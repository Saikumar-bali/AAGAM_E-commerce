import { DeliveryRunPlanningService } from './delivery-run-planning.service';

/**
 * BUG-040: the Runs-tab "Cash Due" used to read the raw run/stop columns, so a
 * subscription whose only cash-due day cell was auto-skipped (MISSED) read ₹0
 * while the ledger still owed. `storeRuns` must expose the reconciled
 * outstanding instead of the raw cell.
 */
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
      deliveryRun: { findMany: jest.fn() },
      subscriptionDelivery: { findMany: jest.fn() },
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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('@aagam/database');

describe('DeliveryRunPlanningService.storeRuns — reconciled cash due (BUG-040)', () => {
  const service = new DeliveryRunPlanningService({} as any, {} as any);
  const storeOwner = { id: 'owner-1', role: 'STORE_OWNER' as any };

  const runRow = (overrides: Record<string, any> = {}) => ({
    id: 'run-1',
    routeCode: 'RUN-AAGA-AM-2026-10-12-f2ce',
    deliveryZone: null,
    rider: null,
    stops: [
      {
        id: 'stop-1',
        sequenceNumber: 1,
        deliveryLatitude: null,
        deliveryLongitude: null,
        deliveryJobId: 'job-1',
        subscriptionDelivery: {
          subscription: {
            id: 'sub-1',
            amountCollectedPaise: 0,
            amountDuePaise: 89903,
            addressSnapshot: { line1: 'Rani Home' },
          },
        },
      },
    ],
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports the ledger due when the day cell was stranded at 0', async () => {
    (prisma.deliveryRun.findMany as jest.Mock).mockResolvedValue([runRow()]);
    (prisma.subscriptionDelivery.findMany as jest.Mock).mockResolvedValue([
      { subscriptionId: 'sub-1', cashCollectedPaise: 0 },
    ]);

    const runs = await service.storeRuns(storeOwner, '2026-10-12');

    expect(runs[0].stops[0].outstandingDuePaise).toBe(89903);
    expect(runs[0].outstandingDuePaise).toBe(89903);
    expect((prisma.subscriptionDelivery.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      subscriptionId: { in: ['sub-1'] },
    });
  });

  it('absorbs day-cell cash the ledger never recorded before reporting the due', async () => {
    (prisma.deliveryRun.findMany as jest.Mock).mockResolvedValue([
      runRow({
        stops: [
          {
            ...runRow().stops[0],
            subscriptionDelivery: {
              subscription: {
                id: 'sub-1',
                amountCollectedPaise: 0,
                amountDuePaise: 10000,
                addressSnapshot: null,
              },
            },
          },
        ],
      }),
    ]);
    (prisma.subscriptionDelivery.findMany as jest.Mock).mockResolvedValue([
      { subscriptionId: 'sub-1', cashCollectedPaise: 5000 },
    ]);

    const runs = await service.storeRuns(storeOwner, '2026-10-12');

    expect(runs[0].stops[0].outstandingDuePaise).toBe(5000);
    expect(runs[0].outstandingDuePaise).toBe(5000);
  });
});
