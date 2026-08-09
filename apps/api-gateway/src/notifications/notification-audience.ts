import { Role } from '@aagam/database';
import { NotificationEventTypeType } from '@aagam/types';

export type PartnerInboxRole = 'RIDER' | 'STORE_OWNER';

type UserWithRoles = {
  role?: Role | string | null;
  roles?: Array<Role | string | { role?: unknown; name?: unknown; code?: unknown }> | null;
} | null | undefined;

const EVENT_AUDIENCES: Record<NotificationEventTypeType, readonly Role[]> = {
  ORDER_PLACED: [Role.STORE_OWNER, Role.ADMIN],
  STORE_ACCEPTED_ORDER: [Role.CUSTOMER],
  STORE_STARTED_PICKING: [Role.CUSTOMER],
  ORDER_PACKED: [Role.ADMIN],
  DISPATCH_JOB_CREATED: [Role.ADMIN],
  ASSIGNMENT_OFFERED: [Role.RIDER],
  ASSIGNMENT_ACCEPTED: [Role.CUSTOMER, Role.STORE_OWNER, Role.ADMIN],
  ASSIGNMENT_REJECTED: [Role.STORE_OWNER, Role.ADMIN],
  ASSIGNMENT_EXPIRED: [Role.STORE_OWNER, Role.ADMIN],
  RIDER_EN_ROUTE_TO_STORE: [Role.STORE_OWNER, Role.ADMIN],
  RIDER_AT_STORE: [Role.STORE_OWNER],
  PICKUP_VERIFIED: [Role.CUSTOMER, Role.ADMIN],
  OUT_FOR_DELIVERY: [Role.CUSTOMER],
  RIDER_AT_CUSTOMER: [Role.CUSTOMER],
  DELIVERY_COMPLETED: [Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN],
  DELIVERY_FAILED: [Role.CUSTOMER, Role.STORE_OWNER, Role.ADMIN],
  DELIVERY_CANCELLED: [Role.CUSTOMER, Role.STORE_OWNER, Role.ADMIN],
  ROUTE_ASSIGNED: [Role.RIDER],
  ROUTE_REMOVED: [Role.RIDER],
  SUBSCRIPTION_WORKER_FAILED: [Role.ADMIN],
  ADMIN_BROADCAST: [],
};

function normalizedRole(value: unknown): Role | null {
  const candidate = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? String((value as any).role ?? (value as any).name ?? (value as any).code ?? '')
      : '';
  const normalized = candidate.trim().toUpperCase();
  return Object.values(Role).includes(normalized as Role) ? normalized as Role : null;
}

export function collectUserRoles(user: UserWithRoles): Set<Role> {
  const roles = new Set<Role>();
  const primary = normalizedRole(user?.role);
  if (primary) roles.add(primary);
  if (Array.isArray(user?.roles)) {
    user.roles.forEach((entry) => {
      const role = normalizedRole(entry);
      if (role) roles.add(role);
    });
  }
  return roles;
}

// Mirrors the Partner mobile workspace precedence. ADMIN keeps the normal admin
// inbox; otherwise Rider wins over Store Owner when a legacy account has both.
export function resolvePartnerInboxRole(user: UserWithRoles): PartnerInboxRole | null {
  const roles = collectUserRoles(user);
  if (roles.has(Role.ADMIN)) return null;
  if (roles.has(Role.RIDER)) return Role.RIDER;
  if (roles.has(Role.STORE_OWNER)) return Role.STORE_OWNER;
  return null;
}

function broadcastAudienceRoles(data: any): readonly Role[] {
  switch (String(data?.audience || '').toUpperCase()) {
    case 'ALL_USERS':
      return [Role.CUSTOMER, Role.RIDER, Role.STORE_OWNER, Role.ADMIN];
    case 'CUSTOMERS':
      return [Role.CUSTOMER];
    case 'RIDERS':
      return [Role.RIDER];
    case 'STORE_OWNERS':
      return [Role.STORE_OWNER];
    case 'ADMINS':
      return [Role.ADMIN];
    default:
      // Old broadcasts did not retain their audience in Notification.data.
      // Do not guess a Partner audience for those rows.
      return [];
  }
}

export function notificationAudienceRoles(eventType: string, data?: any): readonly Role[] {
  if (eventType === 'ADMIN_BROADCAST') return broadcastAudienceRoles(data);
  return EVENT_AUDIENCES[eventType as NotificationEventTypeType] || [];
}

export function isNotificationForRole(role: Role, eventType: string, data?: any) {
  return notificationAudienceRoles(eventType, data).includes(role);
}

export function mobileSubscriptionRole(deviceName?: string | null): Role | null {
  const normalized = String(deviceName || '').trim().toLowerCase();
  if (normalized.includes('store partner')) return Role.STORE_OWNER;
  if (normalized.includes('rider')) return Role.RIDER;
  if (normalized.includes('customer')) return Role.CUSTOMER;
  return null;
}
