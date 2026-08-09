import { prisma, Role } from '@aagam/database';
import { PartnerNotificationInboxService } from './partner-notification-inbox.service';

describe('PartnerNotificationInboxService', () => {
  afterEach(() => jest.restoreAllMocks());

  const recipient = (id: string, eventType: string, data: any = {}, readAt: Date | null = null) => ({
    id,
    userId: 'user-1',
    status: readAt ? 'READ' : 'SENT',
    sentAt: new Date('2026-08-09T04:00:00.000Z'),
    openedAt: null,
    readAt,
    createdAt: new Date('2026-08-09T04:00:00.000Z'),
    notification: {
      id: `notification-${id}`,
      eventType,
      title: eventType,
      body: `${eventType} body`,
      orderId: 'order-1',
      deliveryJobId: 'job-1',
      deepLink: null,
      data,
      createdAt: new Date('2026-08-09T04:00:00.000Z'),
    },
  });

  it('continues to older rows when the newest page contains only migrated or wrong-role alerts', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => (
      index % 2 === 0
        ? recipient(`migrated-${index}`, 'DELIVERY_COMPLETED', { migratedFromOrderHistory: true })
        : recipient(`customer-${index}`, 'OUT_FOR_DELIVERY')
    ));
    const secondPage = [
      recipient('rider-offer', 'ASSIGNMENT_OFFERED'),
      recipient('rider-completed', 'DELIVERY_COMPLETED', {}, new Date('2026-08-09T04:05:00.000Z')),
    ];
    const findMany = jest.spyOn(prisma.notificationRecipient, 'findMany')
      .mockResolvedValueOnce(firstPage as any)
      .mockResolvedValueOnce(secondPage as any);

    const service = new PartnerNotificationInboxService();
    const inbox = await service.list('user-1', Role.RIDER, 2);

    expect(findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ skip: 0, take: 50 }));
    expect(findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ skip: 50, take: 50 }));
    expect(inbox.items.map((item) => item.id)).toEqual(['rider-offer', 'rider-completed']);
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.source).toBe('PARTNER_SCOPED');
  });

  it('does not show customer-only canonical events in a Rider inbox for the same user', async () => {
    jest.spyOn(prisma.notificationRecipient, 'findMany').mockResolvedValue([
      recipient('customer-out', 'OUT_FOR_DELIVERY'),
      recipient('rider-offer', 'ASSIGNMENT_OFFERED'),
    ] as any);

    const inbox = await new PartnerNotificationInboxService().list('user-1', Role.RIDER, 10);
    expect(inbox.items.map((item) => item.id)).toEqual(['rider-offer']);
  });

  it('does not show Rider-only canonical events in a Store inbox for the same user', async () => {
    jest.spyOn(prisma.notificationRecipient, 'findMany').mockResolvedValue([
      recipient('rider-offer', 'ASSIGNMENT_OFFERED'),
      recipient('store-arrival', 'RIDER_AT_STORE'),
    ] as any);

    const inbox = await new PartnerNotificationInboxService().list('user-1', Role.STORE_OWNER, 10);
    expect(inbox.items.map((item) => item.id)).toEqual(['store-arrival']);
  });
});
