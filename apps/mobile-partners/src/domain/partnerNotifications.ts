export type PartnerNotificationTarget =
  | 'RIDER_OFFER'
  | 'RIDER_ACTIVE_JOB'
  | 'RIDER_PICKUP'
  | 'RIDER_DELIVERY'
  | 'RIDER_RETURN'
  | 'RIDER_HISTORY'
  | 'RIDER_SUPPORT'
  | 'RIDER_EARNINGS'
  | 'RIDER_DOCUMENTS'
  | 'RIDER_PROFILE'
  | 'STORE_ORDER'
  | 'ALERTS';

export type NotificationNavigationPayload = {
  version: 1;
  target: PartnerNotificationTarget;
  recipientId?: string;
  notificationId?: string;
  eventType?: string;
  deliveryJobId?: string;
  assignmentId?: string;
  orderId?: string;
  ticketId?: string;
  storeId?: string;
  action?: string;
};

export type PartnerNavigationCommand =
  | { workspace: 'RIDER'; tab: 'Operations'; screen: 'RiderOfferDetail'; params: { assignmentId: string } }
  | { workspace: 'RIDER'; tab: 'Operations'; screen: 'RiderActiveJob'; params: { deliveryJobId: string } }
  | { workspace: 'RIDER'; tab: 'Operations'; screen: 'RiderPickup'; params: { deliveryJobId: string } }
  | { workspace: 'RIDER'; tab: 'Operations'; screen: 'RiderDelivery'; params: { deliveryJobId: string } }
  | { workspace: 'RIDER'; tab: 'Operations'; screen: 'RiderReturn'; params: { deliveryJobId: string } }
  | { workspace: 'RIDER'; tab: 'Operations'; screen: 'RiderJobHistoryDetail'; params: { deliveryJobId?: string; orderId?: string } }
  | { workspace: 'RIDER'; tab: 'RiderSupportConversation'; params: { ticketId: string } }
  | { workspace: 'RIDER'; tab: 'RiderSupport' }
  | { workspace: 'RIDER'; tab: 'Alerts' }
  | { workspace: 'RIDER'; tab: 'History' }
  | { workspace: 'RIDER'; tab: 'Profile' }
  | { workspace: 'RIDER'; tab: 'NotificationSettings' }
  | { workspace: 'STORE'; tab: 'Orders'; params: { storeId?: string } }
  | { workspace: 'ROOT'; screen: 'Notifications' };

const RIDER_WORKSPACE_KEYS = [
  ['rider', 'portal', 'home'],
  ['rider', 'portal', 'offers'],
  ['rider', 'portal', 'delivery'],
  ['rider', 'delivery-workspace'],
] as const;

const EVENT_TARGETS: Record<string, PartnerNotificationTarget> = {
  ASSIGNMENT_CREATED: 'RIDER_OFFER',
  ASSIGNMENT_OFFERED: 'RIDER_OFFER',
  ASSIGNMENT_EXPIRED: 'RIDER_OFFER',
  ASSIGNMENT_REASSIGNED: 'RIDER_OFFER',
  ASSIGNMENT_ACCEPTED: 'RIDER_ACTIVE_JOB',
  RIDER_ASSIGNED: 'RIDER_ACTIVE_JOB',
  RIDER_EN_ROUTE_TO_STORE: 'RIDER_ACTIVE_JOB',
  RIDER_AT_STORE: 'RIDER_PICKUP',
  PICKUP_VERIFIED: 'RIDER_DELIVERY',
  OUT_FOR_DELIVERY: 'RIDER_DELIVERY',
  RIDER_AT_CUSTOMER: 'RIDER_DELIVERY',
  DELIVERY_FAILED: 'RIDER_RETURN',
  RETURNING_TO_STORE: 'RIDER_RETURN',
  RETURNED_TO_STORE: 'RIDER_HISTORY',
  DELIVERED: 'RIDER_HISTORY',
  DELIVERY_CANCELLED: 'RIDER_HISTORY',
  SUPPORT_REPLY: 'RIDER_SUPPORT',
  RIDER_SUPPORT_REPLY: 'RIDER_SUPPORT',
  RIDER_PAYOUT_UPDATED: 'RIDER_EARNINGS',
  RIDER_EARNINGS_UPDATED: 'RIDER_EARNINGS',
  RIDER_DOCUMENT_UPDATED: 'RIDER_DOCUMENTS',
  RIDER_PROFILE_UPDATED: 'RIDER_PROFILE',
  ORDER_PLACED: 'STORE_ORDER',
};

const TARGETS = new Set<PartnerNotificationTarget>([
  'RIDER_OFFER',
  'RIDER_ACTIVE_JOB',
  'RIDER_PICKUP',
  'RIDER_DELIVERY',
  'RIDER_RETURN',
  'RIDER_HISTORY',
  'RIDER_SUPPORT',
  'RIDER_EARNINGS',
  'RIDER_DOCUMENTS',
  'RIDER_PROFILE',
  'STORE_ORDER',
  'ALERTS',
]);

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function upper(value: unknown): string | undefined {
  return text(value)?.toUpperCase();
}

function targetFromLegacyDeepLink(deepLink?: string): PartnerNotificationTarget | undefined {
  if (!deepLink) return undefined;
  const path = deepLink.toLowerCase();
  if (path.includes('/offer')) return 'RIDER_OFFER';
  if (path.includes('/pickup')) return 'RIDER_PICKUP';
  if (path.includes('/return')) return 'RIDER_RETURN';
  if (path.includes('/delivery')) return 'RIDER_DELIVERY';
  if (path.includes('/support')) return 'RIDER_SUPPORT';
  if (path.includes('/earning') || path.includes('/payout')) return 'RIDER_EARNINGS';
  if (path.includes('/document')) return 'RIDER_DOCUMENTS';
  if (path.includes('/profile')) return 'RIDER_PROFILE';
  if (path.includes('/order')) return 'STORE_ORDER';
  return undefined;
}

export function normalizeNotificationNavigation(
  input: Record<string, unknown> | null | undefined,
): NotificationNavigationPayload {
  const data = input || {};
  const eventType = upper(data.eventType ?? data.type);
  const explicitTarget = upper(data.target ?? data.navigationTarget);
  const target = explicitTarget && TARGETS.has(explicitTarget as PartnerNotificationTarget)
    ? explicitTarget as PartnerNotificationTarget
    : EVENT_TARGETS[eventType || '']
      ?? targetFromLegacyDeepLink(text(data.deepLink))
      ?? (eventType?.startsWith('ORDER_') ? 'STORE_ORDER' : undefined)
      ?? (eventType?.startsWith('ASSIGNMENT_') ? 'RIDER_OFFER' : undefined)
      ?? (eventType?.startsWith('DELIVERY_') ? 'RIDER_ACTIVE_JOB' : undefined)
      ?? 'ALERTS';

  return {
    version: 1,
    target,
    recipientId: text(data.recipientId),
    notificationId: text(data.notificationId ?? data.id),
    eventType,
    deliveryJobId: text(data.deliveryJobId),
    assignmentId: text(data.assignmentId),
    orderId: text(data.orderId),
    ticketId: text(data.ticketId),
    storeId: text(data.storeId),
    action: text(data.action),
  };
}

export function notificationDedupeKey(payload: NotificationNavigationPayload): string {
  return payload.recipientId
    ?? payload.notificationId
    ?? [payload.eventType, payload.assignmentId, payload.deliveryJobId, payload.orderId, payload.ticketId]
      .filter(Boolean)
      .join(':')
    ?? 'notification:unknown';
}

export function navigationCommandForNotification(
  payload: NotificationNavigationPayload,
): PartnerNavigationCommand {
  switch (payload.target) {
    case 'RIDER_OFFER':
      return payload.assignmentId
        ? { workspace: 'RIDER', tab: 'Operations', screen: 'RiderOfferDetail', params: { assignmentId: payload.assignmentId } }
        : { workspace: 'RIDER', tab: 'Alerts' };
    case 'RIDER_PICKUP':
      return payload.deliveryJobId
        ? { workspace: 'RIDER', tab: 'Operations', screen: 'RiderPickup', params: { deliveryJobId: payload.deliveryJobId } }
        : { workspace: 'RIDER', tab: 'Alerts' };
    case 'RIDER_DELIVERY':
      return payload.deliveryJobId
        ? { workspace: 'RIDER', tab: 'Operations', screen: 'RiderDelivery', params: { deliveryJobId: payload.deliveryJobId } }
        : { workspace: 'RIDER', tab: 'Alerts' };
    case 'RIDER_RETURN':
      return payload.deliveryJobId
        ? { workspace: 'RIDER', tab: 'Operations', screen: 'RiderReturn', params: { deliveryJobId: payload.deliveryJobId } }
        : { workspace: 'RIDER', tab: 'Alerts' };
    case 'RIDER_ACTIVE_JOB':
      return payload.deliveryJobId
        ? { workspace: 'RIDER', tab: 'Operations', screen: 'RiderActiveJob', params: { deliveryJobId: payload.deliveryJobId } }
        : { workspace: 'RIDER', tab: 'Alerts' };
    case 'RIDER_HISTORY':
      return payload.deliveryJobId || payload.orderId
        ? {
            workspace: 'RIDER',
            tab: 'Operations',
            screen: 'RiderJobHistoryDetail',
            params: { deliveryJobId: payload.deliveryJobId, orderId: payload.orderId },
          }
        : { workspace: 'RIDER', tab: 'History' };
    case 'RIDER_EARNINGS':
      return { workspace: 'RIDER', tab: 'History' };
    case 'RIDER_DOCUMENTS':
    case 'RIDER_PROFILE':
      return { workspace: 'RIDER', tab: 'Profile' };
    case 'RIDER_SUPPORT':
      return payload.ticketId
        ? { workspace: 'RIDER', tab: 'RiderSupportConversation', params: { ticketId: payload.ticketId } }
        : { workspace: 'RIDER', tab: 'RiderSupport' };
    case 'STORE_ORDER':
      return { workspace: 'STORE', tab: 'Orders', params: { storeId: payload.storeId } };
    default:
      return { workspace: 'ROOT', screen: 'Notifications' };
  }
}

export function queryKeysForNotification(eventType?: string): ReadonlyArray<readonly unknown[]> {
  const event = upper(eventType) || '';
  const keys: Array<readonly unknown[]> = [['partner-notifications']];

  if (event.startsWith('ORDER_')) {
    keys.push(['partner-store-orders'], ['store-owner-dashboard-stores'], ['partner-stores']);
  }

  if (
    event.startsWith('ASSIGNMENT_')
    || [
      'RIDER_ASSIGNED',
      'RIDER_EN_ROUTE_TO_STORE',
      'RIDER_AT_STORE',
      'PICKUP_VERIFIED',
      'OUT_FOR_DELIVERY',
      'RIDER_AT_CUSTOMER',
      'DELIVERY_FAILED',
      'RETURNING_TO_STORE',
      'RETURNED_TO_STORE',
      'DELIVERED',
      'DELIVERY_CANCELLED',
    ].includes(event)
  ) {
    keys.push(...RIDER_WORKSPACE_KEYS, ['rider', 'delivery-operations']);
  }

  if (event.includes('EARNING') || event.includes('PAYOUT')) keys.push(['rider', 'earnings']);
  if (event.includes('COD')) keys.push(['rider', 'cod']);
  if (event.includes('SUPPORT')) keys.push(['rider', 'support']);
  if (event.includes('DOCUMENT')) keys.push(['rider', 'documents']);
  if (event.includes('PROFILE')) keys.push(['rider', 'profile']);

  const seen = new Set<string>();
  return keys.filter((key) => {
    const fingerprint = JSON.stringify(key);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
