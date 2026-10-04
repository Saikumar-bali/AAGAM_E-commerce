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
    SKIPPED: 'SKIPPED',
    CANCELLED: 'CANCELLED',
    DELIVERED: 'DELIVERED',
    FAILED: 'FAILED',
    RESCHEDULED: 'RESCHEDULED',
  },
  DeliveryJobStatus: {
    RIDER_ASSIGNED: 'RIDER_ASSIGNED',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
    WAITING_FOR_DISPATCH: 'WAITING_FOR_DISPATCH',
    STORE_DELIVERING: 'STORE_DELIVERING',
    RIDER_EN_ROUTE_TO_STORE: 'RIDER_EN_ROUTE_TO_STORE',
    RIDER_AT_STORE: 'RIDER_AT_STORE',
    PICKUP_VERIFIED: 'PICKUP_VERIFIED',
    RIDER_AT_CUSTOMER: 'RIDER_AT_CUSTOMER',
    DELIVERY_FAILED: 'DELIVERY_FAILED',
    RETURNING_TO_STORE: 'RETURNING_TO_STORE',
    RETURNED_TO_STORE: 'RETURNED_TO_STORE',
  },
  DeliveryRunStatus: {
    PLANNED: 'PLANNED',
    READY_FOR_PICKUP: 'READY_FOR_PICKUP',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },
  DeliveryRunStopStatus: {
    PENDING: 'PENDING',
    READY: 'READY',
    DELIVERED: 'DELIVERED',
    FAILED: 'FAILED',
    RETRY_PENDING: 'RETRY_PENDING',
    RETURN_REQUIRED: 'RETURN_REQUIRED',
    RETURNED: 'RETURNED',
    CANCELLED: 'CANCELLED',
  },
  OrderStatus: {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    PICKING: 'PICKING',
    PACKED: 'PACKED',
    RIDER_ASSIGNED: 'RIDER_ASSIGNED',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
  },
  CodLedgerEntryType: { COLLECTED: 'COLLECTED', REMITTED: 'REMITTED', ADJUSTMENT: 'ADJUSTMENT' },
  CodSettlementStatus: { PENDING: 'PENDING', SETTLED: 'SETTLED', DISPUTED: 'DISPUTED' },
  DeliveryResolutionAction: {
    RETRY_DELIVERY: 'RETRY_DELIVERY',
    RETURN_TO_STORE: 'RETURN_TO_STORE',
    ESCALATE: 'ESCALATE',
    CANCEL: 'CANCEL',
  },
  DeliveryResolutionStatus: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    RESOLVED: 'RESOLVED',
  },
  PaymentMethod: { CASH: 'CASH', PHONE_PE: 'PHONE_PE' },
  PaymentStatus: { CAPTURED: 'CAPTURED', PENDING_COD: 'PENDING_COD' },
  PickupChallengeStatus: { PENDING: 'PENDING', VERIFIED: 'VERIFIED', FAILED: 'FAILED' },
  PickupVerificationMethod: { OTP: 'OTP', QR: 'QR', MANUAL: 'MANUAL' },
  Prisma: { sql: jest.fn() },
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
