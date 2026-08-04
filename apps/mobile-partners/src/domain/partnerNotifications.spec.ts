import {
  navigationCommandForNotification,
  normalizeNotificationNavigation,
  notificationDedupeKey,
  queryKeysForNotification,
} from './partnerNotifications';

describe('partner notification contract', () => {
  it('opens an exact offered assignment', () => {
    const payload = normalizeNotificationNavigation({
      eventType: 'ASSIGNMENT_OFFERED',
      assignmentId: 'assignment-1',
      deliveryJobId: 'job-1',
    });
    expect(navigationCommandForNotification(payload)).toEqual({
      workspace: 'RIDER',
      tab: 'Operations',
      screen: 'RiderOfferDetail',
      params: { assignmentId: 'assignment-1' },
    });
  });

  it.each([
    ['RIDER_AT_STORE', 'RiderPickup'],
    ['PICKUP_VERIFIED', 'RiderDelivery'],
    ['OUT_FOR_DELIVERY', 'RiderDelivery'],
    ['DELIVERY_FAILED', 'RiderReturn'],
  ])('maps %s to %s', (eventType, screen) => {
    const command = navigationCommandForNotification(normalizeNotificationNavigation({
      eventType,
      deliveryJobId: 'job-2',
    }));
    expect(command).toMatchObject({ workspace: 'RIDER', screen });
  });

  it('falls back safely when a required offer identifier is absent', () => {
    const command = navigationCommandForNotification(normalizeNotificationNavigation({
      eventType: 'ASSIGNMENT_OFFERED',
    }));
    expect(command).toEqual({ workspace: 'RIDER', tab: 'Alerts' });
  });

  it('opens the exact support conversation when ticketId is present', () => {
    const payload = normalizeNotificationNavigation({
      eventType: 'RIDER_SUPPORT_REPLY',
      ticketId: 'ticket-123',
      notificationId: 'notification-1',
    });
    expect(navigationCommandForNotification(payload)).toEqual({
      workspace: 'RIDER',
      tab: 'RiderSupportConversation',
      params: { ticketId: 'ticket-123' },
    });
  });

  it('falls back to the support inbox without a ticket id', () => {
    expect(navigationCommandForNotification(normalizeNotificationNavigation({
      eventType: 'SUPPORT_REPLY',
    }))).toEqual({ workspace: 'RIDER', tab: 'RiderSupport' });
  });

  it('uses ticket id in the dedupe key when no notification id exists', () => {
    const payload = normalizeNotificationNavigation({
      eventType: 'SUPPORT_REPLY',
      ticketId: 'ticket-456',
    });
    expect(notificationDedupeKey(payload)).toContain('ticket-456');
  });

  it('invalidates the canonical Rider Portal and workflow queries', () => {
    const keys = queryKeysForNotification('RIDER_AT_CUSTOMER');
    expect(keys).toEqual(expect.arrayContaining([
      ['partner-notifications'],
      ['rider', 'portal', 'home'],
      ['rider', 'portal', 'delivery'],
      ['rider', 'delivery-workspace'],
      ['rider', 'delivery-operations'],
    ]));
  });

  it('invalidates Rider support for support replies', () => {
    expect(queryKeysForNotification('RIDER_SUPPORT_REPLY')).toContainEqual(['rider', 'support']);
  });
});
