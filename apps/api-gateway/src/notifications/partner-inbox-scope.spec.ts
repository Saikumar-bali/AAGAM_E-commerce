import { Role } from '@aagam/database';
import { scopePartnerInbox } from './notifications.controller';

const canonical = (id: string, type: string, readAt: string | null = null) => ({
  id,
  recipientId: `recipient-${id}`,
  type,
  readAt,
  metadata: {},
});

const legacy = (id: string, type: string, readAt: string | null = null) => ({
  id,
  type,
  readAt,
  metadata: {},
});

describe('partner notification inbox scoping', () => {
  const mixedInbox = {
    items: [
      canonical('offer', 'ASSIGNMENT_OFFERED'),
      canonical('completed', 'DELIVERY_COMPLETED'),
      legacy('support', 'CUSTOMER_SUPPORT_TICKET_OPENED'),
      legacy('out-for-delivery', 'ORDER_OUT_FOR_DELIVERY'),
      {
        ...canonical('migrated', 'DELIVERY_COMPLETED'),
        metadata: { migratedFromOrderHistory: true },
      },
    ],
    unreadCount: 5,
    source: 'DEDICATED_WITH_LEGACY_FALLBACK',
  };

  it('never exposes legacy order history rows to riders', () => {
    expect(scopePartnerInbox(Role.RIDER, mixedInbox)).toEqual(
      expect.objectContaining({
        source: 'PARTNER_SCOPED',
        unreadCount: 2,
        items: [
          expect.objectContaining({ id: 'offer' }),
          expect.objectContaining({ id: 'completed' }),
        ],
      }),
    );
  });

  it('never exposes legacy support or lifecycle rows to store owners', () => {
    const scoped = scopePartnerInbox(Role.STORE_OWNER, mixedInbox);
    expect(scoped.items.map((item: any) => item.id)).toEqual(['offer', 'completed']);
    expect(scoped.unreadCount).toBe(2);
  });

  it('rejects migrated legacy lifecycle rows even when they already have a recipient id', () => {
    const scoped = scopePartnerInbox(Role.RIDER, mixedInbox);
    expect(scoped.items.some((item: any) => item.id === 'migrated')).toBe(false);
  });

  it('does not alter customer or admin inboxes', () => {
    expect(scopePartnerInbox(Role.CUSTOMER, mixedInbox)).toBe(mixedInbox);
    expect(scopePartnerInbox(Role.ADMIN, mixedInbox)).toBe(mixedInbox);
  });
});
