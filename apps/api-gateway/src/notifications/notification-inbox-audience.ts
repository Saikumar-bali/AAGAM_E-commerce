import { Role } from '@aagam/database';

type InboxItem = {
  id: string;
  recipientId?: string;
  sourceHistoryId?: string;
  orderId?: string;
  type?: string;
  readAt?: unknown;
  metadata?: Record<string, unknown> | null;
};

type InboxPayload<T extends InboxItem = InboxItem> = {
  items: T[];
  unreadCount: number;
  source?: string;
  [key: string]: unknown;
};

const STORE_LEGACY_EVENTS = new Set([
  'ORDER_PLACED',
  'ORDER_CONFIRMED',
  'ASSIGNMENT_ACCEPTED',
  'ORDER_RIDER_ASSIGNED',
  'ASSIGNMENT_REJECTED',
  'ASSIGNMENT_EXPIRED',
  'RIDER_EN_ROUTE_TO_STORE',
  'RIDER_AT_STORE',
  'DELIVERY_COMPLETED',
  'ORDER_DELIVERED',
  'DELIVERY_FAILED',
  'ORDER_DELIVERY_FAILED',
  'DELIVERY_CANCELLED',
  'ORDER_CANCELLED',
]);

const RIDER_LEGACY_EVENTS = new Set([
  'ASSIGNMENT_OFFERED',
  'ROUTE_ASSIGNED',
  'ROUTE_REMOVED',
  'DELIVERY_COMPLETED',
  'ORDER_DELIVERED',
]);

const SINGLETON_ORDER_EVENTS = new Set([
  'ORDER_PLACED',
  'DELIVERY_COMPLETED',
  'DELIVERY_CANCELLED',
]);

function upper(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/**
 * OrderStatusHistory predates role-addressed notifications. Normalize its status
 * vocabulary to the durable notification event vocabulary before comparing it
 * with dedicated recipient rows.
 */
export function legacyNotificationSemantic(item: InboxItem) {
  const metadata = item.metadata || {};
  const explicitEvent = upper(metadata.event);
  if (explicitEvent) return explicitEvent;

  const deliveryStatus = upper(metadata.deliveryToStatus);
  if (deliveryStatus) {
    if (deliveryStatus === 'DELIVERED') return 'DELIVERY_COMPLETED';
    if (deliveryStatus === 'CANCELLED') return 'DELIVERY_CANCELLED';
    if (deliveryStatus === 'RIDER_ASSIGNED') return 'ASSIGNMENT_ACCEPTED';
    return deliveryStatus;
  }

  const type = upper(item.type);
  if (type === 'ORDER_CONFIRMED') return 'ORDER_PLACED';
  if (type === 'ORDER_DELIVERED') return 'DELIVERY_COMPLETED';
  if (type === 'ORDER_CANCELLED') return 'DELIVERY_CANCELLED';
  if (type === 'ORDER_RIDER_ASSIGNED') return 'ASSIGNMENT_ACCEPTED';
  return type;
}

export function isLegacyNotificationVisibleToRole(item: InboxItem, role: Role) {
  // Customer support and rating history are case-management data, not Partner
  // operational alerts. They previously leaked because legacy fallback was scoped
  // only by whether the Rider/Store happened to be attached to the order.
  const semantic = legacyNotificationSemantic(item);
  if (semantic === 'CUSTOMER_SUPPORT_TICKET_OPENED' || semantic === 'CUSTOMER_RATING_SUBMITTED') {
    return false;
  }
  if (role === Role.STORE_OWNER) {
    return STORE_LEGACY_EVENTS.has(upper(item.type)) || STORE_LEGACY_EVENTS.has(semantic);
  }
  if (role === Role.RIDER) {
    return RIDER_LEGACY_EVENTS.has(upper(item.type)) || RIDER_LEGACY_EVENTS.has(semantic);
  }
  return true;
}

export function scopeNotificationInboxForActor<T extends InboxItem>(
  inbox: InboxPayload<T>,
  role: Role,
): InboxPayload<T> {
  if (role !== Role.RIDER && role !== Role.STORE_OWNER) return inbox;

  // Dedicated rows have already been filtered by NotificationRecipient.recipientRole.
  // Only legacy OrderStatusHistory fallback still needs audience inference.
  const dedicatedKeys = new Set(
    inbox.items
      .filter((item) => Boolean(item.recipientId))
      .map((item) => `${item.orderId || ''}:${legacyNotificationSemantic(item)}`),
  );

  const seenSingletons = new Set<string>();
  const items = inbox.items.filter((item) => {
    const semantic = legacyNotificationSemantic(item);
    const key = `${item.orderId || ''}:${semantic}`;

    if (!item.recipientId) {
      if (!isLegacyNotificationVisibleToRole(item, role)) return false;
      // Exact migrated source IDs are removed before this stage. Semantic
      // suppression is intentionally limited to singleton lifecycle events so a
      // later failure/reassignment attempt is never hidden by an earlier one.
      if (SINGLETON_ORDER_EVENTS.has(semantic) && dedicatedKeys.has(key)) return false;
    }

    if (item.orderId && SINGLETON_ORDER_EVENTS.has(semantic)) {
      if (seenSingletons.has(key)) return false;
      seenSingletons.add(key);
    }
    return true;
  });

  return {
    ...inbox,
    items,
    unreadCount: items.filter((item) => !item.readAt).length,
    source: items.some((item) => !item.recipientId)
      ? 'DEDICATED_WITH_SCOPED_LEGACY_FALLBACK'
      : 'DEDICATED',
  };
}
