import { Role } from '@aagam/database';
import { scopeNotificationInboxForActor } from './notification-inbox-audience';

function item(overrides: Record<string, unknown>) {
  return {
    id: String(overrides.id || Math.random()),
    sourceHistoryId: String(overrides.sourceHistoryId || overrides.id || Math.random()),
    orderId: 'order-1',
    type: 'ORDER_UPDATE',
    title: 'Update',
    body: 'Update',
    createdAt: new Date().toISOString(),
    readAt: null,
    metadata: {},
    ...overrides,
  } as any;
}

describe('partner notification inbox audience isolation', () => {
  it('does not leak customer support or customer-only delivery history to Store Owners', () => {
    const scoped = scopeNotificationInboxForActor({
      items: [
        item({ id: 'support', type: 'CUSTOMER_SUPPORT_TICKET_OPENED', metadata: { event: 'CUSTOMER_SUPPORT_TICKET_OPENED' } }),
        item({ id: 'out', type: 'ORDER_OUT_FOR_DELIVERY' }),
        item({ id: 'complete', type: 'ORDER_DELIVERED' }),
      ],
      unreadCount: 3,
      source: 'DEDICATED_WITH_LEGACY_FALLBACK',
    }, Role.STORE_OWNER);

    expect(scoped.items.map((entry) => entry.id)).toEqual(['complete']);
    expect(scoped.unreadCount).toBe(1);
  });

  it('does not leak customer support or customer-only order progress to Riders', () => {
    const scoped = scopeNotificationInboxForActor({
      items: [
        item({ id: 'support', type: 'CUSTOMER_SUPPORT_TICKET_OPENED', metadata: { event: 'CUSTOMER_SUPPORT_TICKET_OPENED' } }),
        item({ id: 'out', type: 'ORDER_OUT_FOR_DELIVERY' }),
        item({ id: 'complete', type: 'ORDER_DELIVERED' }),
      ],
      unreadCount: 3,
    }, Role.RIDER);

    expect(scoped.items.map((entry) => entry.id)).toEqual(['complete']);
  });

  it('prefers one durable recipient over legacy DELIVERED history and duplicate durable events', () => {
    const scoped = scopeNotificationInboxForActor({
      items: [
        item({ id: 'recipient-new', recipientId: 'recipient-new', type: 'DELIVERY_COMPLETED' }),
        item({ id: 'recipient-duplicate', recipientId: 'recipient-duplicate', type: 'DELIVERY_COMPLETED' }),
        item({ id: 'legacy-delivered', type: 'ORDER_DELIVERED', metadata: { deliveryToStatus: 'DELIVERED' } }),
      ],
      unreadCount: 3,
    }, Role.STORE_OWNER);

    expect(scoped.items.map((entry) => entry.id)).toEqual(['recipient-new']);
    expect(scoped.unreadCount).toBe(1);
    expect(scoped.source).toBe('DEDICATED');
  });

  it('does not alter non-partner inboxes', () => {
    const inbox = {
      items: [item({ id: 'support', type: 'CUSTOMER_SUPPORT_TICKET_OPENED' })],
      unreadCount: 1,
      source: 'DEDICATED_WITH_LEGACY_FALLBACK',
    };
    expect(scopeNotificationInboxForActor(inbox, Role.ADMIN)).toBe(inbox);
    expect(scopeNotificationInboxForActor(inbox, Role.CUSTOMER)).toBe(inbox);
  });
});
