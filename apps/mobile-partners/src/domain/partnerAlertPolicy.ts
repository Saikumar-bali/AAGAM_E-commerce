import {
  NotificationNavigationPayload,
  normalizeNotificationNavigation,
} from './partnerNotifications';

/**
 * A rider offer is a stateful request: it stays OFFERED until the rider accepts,
 * rejects, or it expires. Everything else in the durable inbox is a status
 * update that the rider only needs to see once.
 */
export function isOfferEvent(payload: NotificationNavigationPayload): boolean {
  return payload.target === 'RIDER_OFFER';
}

/**
 * Stable identity for "the rider has already been alerted about this". Offer
 * alerts key off the assignment so a re-materialized outbox row, a replayed
 * push, or a fresh app launch cannot ring the same offer twice. Non-offer
 * events key off the recipient row so each lifecycle update alerts once.
 */
export function alertKeyForPayload(payload: NotificationNavigationPayload): string {
  if (isOfferEvent(payload)) {
    return `offer:${payload.assignmentId || payload.deliveryJobId || payload.recipientId || payload.notificationId || 'unknown'}`;
  }
  return `event:${payload.recipientId || payload.notificationId || `${payload.eventType || 'unknown'}:${payload.deliveryJobId || payload.orderId || 'unknown'}`}`;
}

export type InboxAlertItem = {
  id: string;
  type?: string | null;
  target?: string | null;
  action?: string | null;
  deepLink?: string | null;
  orderId?: string | null;
  deliveryJobId?: string | null;
  assignmentId?: string | null;
  ticketId?: string | null;
  storeId?: string | null;
  readAt?: string | null;
  openedAt?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

export function inboxItemNavigationData(item: InboxAlertItem): Record<string, unknown> {
  const metadata = item.metadata || {};
  return {
    ...metadata,
    id: item.id,
    notificationId: item.id,
    recipientId: item.id,
    eventType: item.type,
    target: item.target,
    action: item.action,
    deepLink: item.deepLink,
    orderId: item.orderId ?? metadata.orderId,
    deliveryJobId: item.deliveryJobId ?? metadata.deliveryJobId,
    assignmentId: item.assignmentId ?? metadata.assignmentId,
    ticketId: item.ticketId ?? metadata.ticketId,
    storeId: item.storeId ?? metadata.storeId,
  };
}

/**
 * Decides whether a durable-inbox row should raise a foreground alert.
 *
 * - Read/opened rows never alert again (this is what stopped the polling loop
 *   from re-ringing an offer the rider already accepted).
 * - Rows already alerted in a previous app session are suppressed.
 * - Rows the rider has not been alerted about alert exactly once.
 */
export function shouldAlertForInboxItem(
  item: InboxAlertItem,
  alreadyAlerted: ReadonlySet<string>,
): boolean {
  if (item.readAt || item.openedAt) return false;
  const payload = normalizeNotificationNavigation(inboxItemNavigationData(item));
  return !alreadyAlerted.has(alertKeyForPayload(payload));
}

/**
 * The first inbox load after launch is a reconciliation pass, not an alert
 * burst: mark everything currently pending as "seen" so a rider is not
 * re-alerted about offers they were already notified about before restarting.
 */
export function alertKeysForInboxBootstrap(items: readonly InboxAlertItem[]): string[] {
  return items
    .filter((item) => !item.readAt && !item.openedAt)
    .map((item) => alertKeyForPayload(normalizeNotificationNavigation(inboxItemNavigationData(item))));
}
