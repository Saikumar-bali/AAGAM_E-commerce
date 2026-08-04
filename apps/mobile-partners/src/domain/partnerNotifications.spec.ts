import {
  navigationCommandForNotification,
  normalizeNotificationNavigation,
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

  it('falls back safely when a required identifier is absent', () => {
    const command = navigationCommandForNotification(normalizeNotificationNavigation({
      eventType: 'ASSIGNMENT_OFFERED',
    }));
    expect(command).toEqual({ workspace: 'RIDER', tab: 'Alerts' });
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
});
