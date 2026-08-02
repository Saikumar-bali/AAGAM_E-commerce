import {
  compareRiderMetric,
  formatActiveMinutes,
  summarizeRiderDay,
} from './riderDashboardSummary';
import { RiderAssignmentOffer } from './riderWorkspace';

const localIso = (hour: number, minute = 0) => new Date(2026, 7, 2, hour, minute, 0, 0).toISOString();

const completedAssignment = (overrides: Partial<RiderAssignmentOffer> = {}): RiderAssignmentOffer => ({
  id: 'assignment-1',
  deliveryJobId: 'job-1',
  status: 'ACCEPTED',
  offeredAt: localIso(4),
  respondedAt: localIso(4, 10),
  payoutAmount: 125,
  deliveryJob: {
    id: 'job-1',
    orderId: 'order-1',
    status: 'DELIVERED',
    completedAt: localIso(5, 10),
    order: { id: 'order-1', deliveredAt: localIso(5, 10) },
  },
  ...overrides,
});

describe('rider dashboard summary', () => {
  it('summarizes completed work, earnings, cancellations and active minutes for the selected day', () => {
    const cancelled = completedAssignment({
      id: 'assignment-2',
      status: 'REJECTED',
      payoutAmount: null,
      respondedAt: localIso(6),
      deliveryJob: {
        id: 'job-2',
        orderId: 'order-2',
        status: 'CANCELLED',
        updatedAt: localIso(6),
        order: { id: 'order-2' },
      },
    });
    const result = summarizeRiderDay(
      [completedAssignment(), cancelled],
      new Date(2026, 7, 2, 12),
    );

    expect(result).toEqual({ earnings: 125, completed: 1, cancelled: 1, activeMinutes: 60 });
  });

  it('keeps earnings unavailable when dispatch omits a completed payout', () => {
    const result = summarizeRiderDay(
      [completedAssignment({ payoutAmount: null })],
      new Date(2026, 7, 2, 12),
    );
    expect(result.earnings).toBeNull();
  });

  it('builds metric comparisons and active-hour labels', () => {
    expect(compareRiderMetric(18, 12)).toEqual({ percent: 50, direction: 'up' });
    expect(compareRiderMetric(1, 0)).toEqual({ percent: null, direction: 'up' });
    expect(formatActiveMinutes(275)).toBe('4h 35m');
  });
});
