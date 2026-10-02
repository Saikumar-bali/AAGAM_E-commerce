import {
  alertKeyForPayload,
  alertKeysForInboxBootstrap,
  inboxItemNavigationData,
  isOfferEvent,
  shouldAlertForInboxItem,
  type InboxAlertItem,
} from './partnerAlertPolicy';
import { normalizeNotificationNavigation } from './partnerNotifications';

function offerItem(overrides: Partial<InboxAlertItem> = {}): InboxAlertItem {
  return {
    id: 'recipient-1',
    type: 'ASSIGNMENT_OFFERED',
    target: 'RIDER_OFFER',
    assignmentId: 'assignment-1',
    deliveryJobId: 'job-1',
    createdAt: '2026-07-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('partner alert policy', () => {
  it('treats rider offers as stateful, once-only alerts keyed by assignment', () => {
    const payload = normalizeNotificationNavigation(inboxItemNavigationData(offerItem()));
    expect(isOfferEvent(payload)).toBe(true);
    expect(alertKeyForPayload(payload)).toBe('offer:assignment-1');
  });

  it('keys non-offer updates by recipient so each lifecycle update alerts once', () => {
    const payload = normalizeNotificationNavigation(inboxItemNavigationData({
      id: 'recipient-9',
      type: 'OUT_FOR_DELIVERY',
      target: 'RIDER_DELIVERY',
      deliveryJobId: 'job-9',
      createdAt: '2026-07-11T10:00:00.000Z',
    }));
    expect(isOfferEvent(payload)).toBe(false);
    expect(alertKeyForPayload(payload)).toBe('event:recipient-9');
  });

  it('never re-alerts a pending offer that was already alerted in this or a prior session', () => {
    const item = offerItem();
    const alreadyAlerted = new Set(['offer:assignment-1']);
    expect(shouldAlertForInboxItem(item, new Set())).toBe(true);
    expect(shouldAlertForInboxItem(item, alreadyAlerted)).toBe(false);
  });

  it('never alerts read or opened rows, which stops the poll loop from re-ringing accepted offers', () => {
    expect(shouldAlertForInboxItem(offerItem({ readAt: '2026-07-11T10:00:05.000Z' }), new Set())).toBe(false);
    expect(shouldAlertForInboxItem(offerItem({ openedAt: '2026-07-11T10:00:05.000Z' }), new Set())).toBe(false);
  });

  it('bootstraps a fresh launch by marking only pending rows as seen', () => {
    const keys = alertKeysForInboxBootstrap([
      offerItem(),
      offerItem({ id: 'recipient-2', assignmentId: 'assignment-2' }),
      offerItem({ id: 'recipient-3', assignmentId: 'assignment-3', readAt: '2026-07-11T10:00:09.000Z' }),
    ]);
    expect(keys).toEqual(['offer:assignment-1', 'offer:assignment-2']);
  });
});
