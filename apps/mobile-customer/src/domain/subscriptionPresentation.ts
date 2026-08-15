import type { SubscriptionStatus } from '../api/subscriptionService';

export type SubscriptionSegment = 'Active' | 'Upcoming' | 'Paused' | 'Completed';

export const subscriptionStatusGroups: Record<SubscriptionSegment, SubscriptionStatus[]> = {
  Active: ['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD'],
  Upcoming: ['PENDING_CASH_COLLECTION'],
  Paused: ['PAUSED'],
  Completed: ['COMPLETED', 'CANCELLED'],
};

export function subscriptionSegmentCounts(
  subscriptions: Array<{ status: SubscriptionStatus }>,
): Record<SubscriptionSegment, number> {
  return (Object.keys(subscriptionStatusGroups) as SubscriptionSegment[]).reduce(
    (counts, segment) => {
      const statuses = subscriptionStatusGroups[segment];
      counts[segment] = subscriptions.filter((item) => statuses.includes(item.status)).length;
      return counts;
    },
    { Active: 0, Upcoming: 0, Paused: 0, Completed: 0 } as Record<SubscriptionSegment, number>,
  );
}

export function subscriptionTotalDeliveries(subscription: {
  planVersion?: { totalDeliveries?: number | null } | null;
  plan?: { totalDeliveries?: number | null } | null;
  deliveries?: unknown[] | null;
  completedDeliveries?: number | null;
  remainingFundedDeliveries?: number | null;
}) {
  const candidates = [
    Number(subscription.planVersion?.totalDeliveries || 0),
    Number(subscription.plan?.totalDeliveries || 0),
    Array.isArray(subscription.deliveries) ? subscription.deliveries.length : 0,
    Number(subscription.completedDeliveries || 0) + Number(subscription.remainingFundedDeliveries || 0),
  ];
  return Math.max(1, ...candidates.filter((value) => Number.isFinite(value) && value > 0));
}
