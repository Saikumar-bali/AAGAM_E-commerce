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
