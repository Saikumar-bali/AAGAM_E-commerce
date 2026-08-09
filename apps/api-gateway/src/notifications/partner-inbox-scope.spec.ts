import { Role } from '@aagam/database';
import {
  isNotificationForRole,
  notificationAudienceRoles,
  resolvePartnerInboxRole,
} from './notification-audience';

describe('partner notification audience scoping', () => {
  it('resolves a Rider membership even when CUSTOMER remains the primary role', () => {
    expect(resolvePartnerInboxRole({
      role: Role.CUSTOMER,
      roles: [Role.CUSTOMER, Role.RIDER],
    })).toBe(Role.RIDER);
  });

  it('resolves a Store Owner membership even when CUSTOMER remains the primary role', () => {
    expect(resolvePartnerInboxRole({
      role: Role.CUSTOMER,
      roles: [Role.CUSTOMER, Role.STORE_OWNER],
    })).toBe(Role.STORE_OWNER);
  });

  it('matches the partner workspace precedence when a legacy account has both partner roles', () => {
    expect(resolvePartnerInboxRole({
      role: Role.CUSTOMER,
      roles: [Role.STORE_OWNER, Role.RIDER],
    })).toBe(Role.RIDER);
  });

  it('keeps customer-only lifecycle events out of Rider and Store alerts', () => {
    for (const eventType of ['STORE_ACCEPTED_ORDER', 'STORE_STARTED_PICKING', 'OUT_FOR_DELIVERY', 'RIDER_AT_CUSTOMER']) {
      expect(isNotificationForRole(Role.RIDER, eventType)).toBe(false);
      expect(isNotificationForRole(Role.STORE_OWNER, eventType)).toBe(false);
    }
  });

  it('keeps Store operational events out of Rider alerts', () => {
    for (const eventType of ['ORDER_PLACED', 'ASSIGNMENT_REJECTED', 'RIDER_EN_ROUTE_TO_STORE', 'RIDER_AT_STORE']) {
      expect(isNotificationForRole(Role.STORE_OWNER, eventType)).toBe(true);
      expect(isNotificationForRole(Role.RIDER, eventType)).toBe(false);
    }
  });

  it('allows only Rider-addressed events in Rider alerts', () => {
    expect(isNotificationForRole(Role.RIDER, 'ASSIGNMENT_OFFERED')).toBe(true);
    expect(isNotificationForRole(Role.RIDER, 'ROUTE_ASSIGNED')).toBe(true);
    expect(isNotificationForRole(Role.RIDER, 'ROUTE_REMOVED')).toBe(true);
    expect(isNotificationForRole(Role.RIDER, 'DELIVERY_COMPLETED')).toBe(true);
  });

  it('uses the retained admin-broadcast audience instead of assuming all partners', () => {
    expect(notificationAudienceRoles('ADMIN_BROADCAST', { audience: 'RIDERS' })).toEqual([Role.RIDER]);
    expect(isNotificationForRole(Role.RIDER, 'ADMIN_BROADCAST', { audience: 'RIDERS' })).toBe(true);
    expect(isNotificationForRole(Role.STORE_OWNER, 'ADMIN_BROADCAST', { audience: 'RIDERS' })).toBe(false);
    expect(notificationAudienceRoles('ADMIN_BROADCAST', {})).toEqual([]);
  });
});
