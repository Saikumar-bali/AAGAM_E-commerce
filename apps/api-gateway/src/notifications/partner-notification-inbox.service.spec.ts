import { prisma, Role } from '@aagam/database';
import { PartnerNotificationInboxService } from './partner-notification-inbox.service';

describe('PartnerNotificationInboxService', () => {
  afterEach(() => jest.restoreAllMocks());

  const recipient = (id: string, eventType: string, role: Role, readAt: Date | null = null) => ({
    id,
    userId: 'user-1',
    recipientRole: role,
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
      data: {},
      createdAt: new Date('2026-08-09T04:00:00.000Z'),
    },
  });

  it('queries Rider recipients by persisted role before applying the public limit', async () => {
    const findMany = jest.spyOn(prisma.notificationRecipient, 'findMany').mockResolvedValue([
      recipient('rider-offer', 'ASSIGNMENT_OFFERED', Role.RIDER),
      recipient('rider-completed', 'DELIVERY_COMPLETED', Role.RIDER, new Date('2026-08-09T04:05:00.000Z')),
    ] as any);

    const inbox = await new PartnerNotificationInboxService().list('user-1', Role.RIDER, 2);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', recipientRole: Role.RIDER },
      take: 2,
    }));
    expect(inbox.items.map((item) => item.id)).toEqual(['rider-offer', 'rider-completed']);
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.source).toBe('PARTNER_ROLE_SCOPED');
  });

  it('queries Store recipients independently for a multi-role identity', async () => {
    const findMany = jest.spyOn(prisma.notificationRecipient, 'findMany').mockResolvedValue([
      recipient('store-arrival', 'RIDER_AT_STORE', Role.STORE_OWNER),
      recipient('store-completed', 'DELIVERY_COMPLETED', Role.STORE_OWNER),
    ] as any);

    const inbox = await new PartnerNotificationInboxService().list('user-1', Role.STORE_OWNER, 10);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1', recipientRole: Role.STORE_OWNER },
    }));
    expect(inbox.items.map((item) => item.id)).toEqual(['store-arrival', 'store-completed']);
  });

  it('rejects read acknowledgement for a recipient belonging to another role', async () => {
    jest.spyOn(prisma.notificationRecipient, 'findFirst').mockResolvedValue(null);
    await expect(
      new PartnerNotificationInboxService().markRead('user-1', Role.RIDER, 'store-recipient'),
    ).rejects.toThrow('Notification not found');
    expect(prisma.notificationRecipient.findFirst).toHaveBeenCalledWith({
      where: { id: 'store-recipient', userId: 'user-1', recipientRole: Role.RIDER },
    });
  });
});
