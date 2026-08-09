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

  it('scopes durable recipient rows to the active partner workspace for multi-role users', () => {
    const scoped = scopeNotificationInboxForActor({
      items: [
        item({ id: 'customer-only', recipientId: 'customer-only', type: 'OUT_FOR_DELIVERY' }),
        item({ id: 'store-only', recipientId: 'store-only', type: 'RIDER_AT_STORE' }),
        item({ id: 'shared-complete', recipientId: 'shared-complete', type: 'DELIVERY_COMPLETED' }),
      ],
      unreadCount: 3,
    }, Role.STORE_OWNER);

    expect(scoped.items.map((entry) => entry.id)).toEqual(['store-only', 'shared-complete']);
  });

  it('normalizes RIDER_ASSIGNED migration history to the durable assignment event', () => {
    const scoped = scopeNotificationInboxForActor({
      items: [
        item({ id: 'dedicated', recipientId: 'dedicated', type: 'ASSIGNMENT_ACCEPTED' }),
        item({
          id: 'legacy',
          type: 'ORDER_RIDER_ASSIGNED',
          metadata: { deliveryToStatus: 'RIDER_ASSIGNED' },
        }),
      ],
      unreadCount: 2,
    }, Role.STORE_OWNER);

    expect(scoped.items.map((entry) => entry.id)).toEqual(['dedicated']);
  });

  it('prefers one durable recipient over legacy DELIVERED history and duplicate durable terminal events', () => {
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

  it('preserves repeated non-terminal operational events', () => {
    const scoped = scopeNotificationInboxForActor({
      items: [
        item({ id: 'failure-2', recipientId: 'failure-2', type: 'DELIVERY_FAILED' }),
        item({ id: 'failure-1', recipientId: 'failure-1', type: 'DELIVERY_FAILED' }),
      ],
      unreadCount: 2,
    }, Role.STORE_OWNER);

    expect(scoped.items.map((entry) => entry.id)).toEqual(['failure-2', 'failure-1']);
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
