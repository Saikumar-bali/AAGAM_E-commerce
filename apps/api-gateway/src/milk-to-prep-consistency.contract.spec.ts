import { readFileSync } from 'fs';
import path from 'path';

jest.mock('@aagam/database', () => ({
  prisma: {
    store: { findMany: jest.fn() },
    subscriptionDelivery: { findMany: jest.fn() },
  },
  Role: { ADMIN: 'ADMIN', STORE_OWNER: 'STORE_OWNER', RIDER: 'RIDER', CUSTOMER: 'CUSTOMER' },
  SubscriptionDeliveryStatus: {
    SCHEDULED: 'SCHEDULED',
    ORDER_GENERATED: 'ORDER_GENERATED',
    PREPARING: 'PREPARING',
    PACKED: 'PACKED',
    ASSIGNED: 'ASSIGNED',
  },
  Prisma: {},
}));

import { Role } from '@aagam/database';
import { DeliveryRunPlanningService } from './subscriptions/delivery-run-planning.service';

const { prisma } = jest.requireMock('@aagam/database');

/**
 * The store's daily "milk to prep" is read by three independent surfaces:
 * the dispatch summary (the source of truth for the day), the rider
 * assignment board, and the prep-demand report. They must agree, otherwise
 * the same day shows a different stop count on each screen.
 */
describe('Milk-to-prep consistency across store surfaces', () => {
  const api = (file: string) => readFileSync(path.join(__dirname, file), 'utf8');

  it('excludes skipped and cancelled deliveries from the rider assignment board', () => {
    const service = api('subscriptions/store-milk-grid.service.ts');
    // getRiderAssignments must mirror getDispatchSummary: a COMPLETED contract
    // keeps stale SCHEDULED/ORDER_GENERATED rows that are not milk to prep, and
    // skipped/cancelled rows must never inflate the board.
    const start = service.indexOf('async getRiderAssignments(');
    expect(start).toBeGreaterThan(-1);
    const body = service.slice(start, service.indexOf('async dispatchToRider(', start));
    expect(body).toContain("status: { not: 'COMPLETED' }");
    expect(body).toContain(
      'status: { notIn: [SubscriptionDeliveryStatus.SKIPPED, SubscriptionDeliveryStatus.CANCELLED] }',
    );
  });

  it('excludes completed contracts and deactivated customers from prep demand', async () => {
    const service = new DeliveryRunPlanningService({} as any, {} as any);
    (prisma.store.findMany as jest.Mock).mockResolvedValue([{ id: 'store-1', name: 'Store' }]);
    (prisma.subscriptionDelivery.findMany as jest.Mock).mockResolvedValue([]);

    await service.storeDemand({ id: 'owner-1', role: Role.STORE_OWNER });

    expect(prisma.subscriptionDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subscription: expect.objectContaining({
            status: { not: 'COMPLETED' },
            customer: { isActive: true },
          }),
        }),
      }),
    );
  });
});
