/**
 * Single source of truth for "was this subscription acquired offline?".
 *
 * Three surfaces need this answer and previously each answered it differently:
 * the milk grid only inspected `subscription.source`, while the store and
 * admin Subscribers tabs additionally inspected the customer's
 * `acquisitionSource` and the synthetic `offline.<phone>@aagaam.local` email
 * minted by the offline-customer flow. The divergence mislabelled offline
 * walk-in customers as online on the grid (their subscriptions were created
 * with `source = NULL` by the manual subscribe path).
 *
 * Keep every online/offline classification routed through this helper.
 */
export type SubscriptionSourceInput = {
  source?: string | null;
  customer?: {
    email?: string | null;
    phone?: string | null;
    acquisitionSource?: string | null;
  } | null;
};

export function isOfflineSubscription(subscription: SubscriptionSourceInput): boolean {
  const customer = subscription.customer;
  // Match the backend's authoritative offline identity (offline-customer.service.ts
  // `offlineIdentity`): the synthetic email is both prefixed `offline.` and
  // suffixed `@aagaam.local`. Requiring the suffix avoids mislabelling a real
  // registered customer whose email merely starts with "offline.".
  const syntheticOfflineEmail =
    Boolean(customer?.email?.startsWith('offline.')) &&
    Boolean(customer?.email?.endsWith('@aagaam.local'));
  return Boolean(
    subscription.source === 'manual' ||
      subscription.source === 'custom_manual' ||
      syntheticOfflineEmail ||
      String(customer?.phone ?? '').startsWith('offline_') ||
      customer?.acquisitionSource === 'OFFLINE' ||
      customer?.acquisitionSource === 'OFFLINE_STORE',
  );
}
