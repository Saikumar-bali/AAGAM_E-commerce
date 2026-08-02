import { RiderAssignmentOffer } from './riderWorkspace';

export type RiderDaySummary = {
  earnings: number | null;
  completed: number;
  cancelled: number;
  activeMinutes: number;
};

export type RiderMetricComparison = {
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
};

const validDate = (value?: string | null) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const activityTime = (assignment: RiderAssignmentOffer) => {
  const delivery = assignment.deliveryJob;
  return validDate(
    delivery.order.deliveredAt
      || delivery.completedAt
      || delivery.updatedAt
      || assignment.respondedAt
      || assignment.updatedAt
      || assignment.offeredAt
      || assignment.createdAt,
  );
};

const payoutAmount = (assignment: RiderAssignmentOffer) => {
  const candidates = [
    assignment.riderPayoutAmount,
    assignment.payoutAmount,
    assignment.deliveryJob.riderPayoutAmount,
  ];
  const value = candidates.find(
    (candidate) => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0,
  );
  return value == null ? null : value;
};

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value.getTime();
};

export function summarizeRiderDay(history: RiderAssignmentOffer[], day: Date): RiderDaySummary {
  const start = startOfDay(day);
  const end = start + 24 * 60 * 60 * 1000;
  const assignments = history.filter((assignment) => {
    const timestamp = activityTime(assignment);
    return timestamp != null && timestamp >= start && timestamp < end;
  });
  const completed = assignments.filter(
    (assignment) => assignment.status === 'ACCEPTED' && assignment.deliveryJob.status === 'DELIVERED',
  );
  const cancelled = assignments.filter(
    (assignment) => ['CANCELLED', 'REJECTED'].includes(assignment.status)
      || (assignment.status === 'ACCEPTED' && assignment.deliveryJob.status === 'CANCELLED'),
  );
  const payouts = completed.map(payoutAmount);
  const earnings = completed.length === 0
    ? 0
    : payouts.every((value): value is number => value != null)
      ? payouts.reduce((total, value) => total + value, 0)
      : null;
  const activeMinutes = completed.reduce((total, assignment) => {
    const started = validDate(assignment.respondedAt || assignment.offeredAt || assignment.createdAt);
    const finished = activityTime(assignment);
    if (started == null || finished == null || finished <= started) return total;
    return total + Math.round((finished - started) / 60_000);
  }, 0);

  return {
    earnings,
    completed: completed.length,
    cancelled: cancelled.length,
    activeMinutes,
  };
}

export function compareRiderMetric(current: number, previous: number): RiderMetricComparison {
  if (current === previous) return { percent: 0, direction: 'flat' };
  if (previous === 0) return { percent: null, direction: current > 0 ? 'up' : 'down' };
  const percent = Math.round(Math.abs(((current - previous) / previous) * 100));
  return { percent, direction: current > previous ? 'up' : 'down' };
}

export function formatActiveMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m`;
}
