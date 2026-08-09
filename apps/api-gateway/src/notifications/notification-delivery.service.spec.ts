import { Role, prisma } from '@aagam/database';
import { NotificationDeliveryService } from './notification-delivery.service';

describe('NotificationDeliveryService provider outcomes', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockRecipientUpdate() {
    return jest.spyOn(prisma.notificationRecipient, 'update').mockImplementation((async (args: any) => ({
      id: 'recipient-1',
      ...args.data,
    })) as any);
  }

  it('does not mark a recipient SENT when every configured provider skips delivery', async () => {
    const recipientUpdate = mockRecipientUpdate();
    jest.spyOn(prisma.notificationRecipient, 'findUnique').mockResolvedValue({
      id: 'recipient-1',
      userId: 'owner-1',
      status: 'QUEUED',
      sentAt: null,
      notification: {
        id: 'notification-1',
        eventType: 'ORDER_PLACED',
        title: 'New store order',
        body: 'Review the picking list.',
        orderId: 'order-1',
        deliveryJobId: null,
        deepLink: null,
        data: { storeId: 'store-1' },
      },
      user: { role: Role.STORE_OWNER },
    } as any);
    jest.spyOn(prisma.notificationPreference, 'findMany').mockResolvedValue([] as any);
    jest.spyOn(prisma.pushSubscription, 'findMany').mockResolvedValue([{
      id: 'subscription-1',
      userId: 'owner-1',
      provider: 'FCM_MOBILE',
      token: 'test-token',
      deviceName: 'Aagaam Store Partner',
      isActive: true,
    }] as any);
    jest.spyOn(prisma.notificationDeliveryAttempt, 'count').mockResolvedValue(0);
    const attemptCreate = jest.spyOn(prisma.notificationDeliveryAttempt, 'create').mockResolvedValue({ id: 'attempt-1' } as any);

    const push = {
      send: jest.fn().mockResolvedValue({ status: 'SKIPPED', reason: 'Firebase Admin is not configured' }),
      isInvalidSubscriptionError: jest.fn().mockReturnValue(false),
    };
    const service = new NotificationDeliveryService(push as any);

    await expect(service.deliverRecipient('recipient-1')).rejects.toThrow('Firebase Admin is not configured');

    expect(attemptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SKIPPED', nextRetryAt: expect.any(Date) }),
    }));
    expect(recipientUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', failureReason: expect.stringContaining('Firebase Admin is not configured') }),
    }));
    expect(recipientUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT' }),
    }));
  });

  it('marks the recipient SENT when at least one device receives the push', async () => {
    const recipientUpdate = mockRecipientUpdate();
    jest.spyOn(prisma.notificationRecipient, 'findUnique').mockResolvedValue({
      id: 'recipient-1',
      userId: 'rider-1',
      status: 'QUEUED',
      sentAt: null,
      notification: {
        id: 'notification-1',
        eventType: 'ASSIGNMENT_OFFERED',
        title: 'New delivery offer',
        body: 'Review before it expires.',
        orderId: 'order-1',
        deliveryJobId: 'job-1',
        deepLink: null,
        data: { riderUserId: 'rider-1' },
      },
      user: { role: Role.RIDER },
    } as any);
    jest.spyOn(prisma.notificationPreference, 'findMany').mockResolvedValue([] as any);
    jest.spyOn(prisma.pushSubscription, 'findMany').mockResolvedValue([{
      id: 'subscription-1',
      userId: 'rider-1',
      provider: 'FCM_MOBILE',
      token: 'test-token',
      deviceName: 'Aagaam Rider',
      isActive: true,
    }] as any);
    jest.spyOn(prisma.notificationDeliveryAttempt, 'count').mockResolvedValue(0);
    jest.spyOn(prisma.notificationDeliveryAttempt, 'create').mockResolvedValue({ id: 'attempt-1' } as any);

    const service = new NotificationDeliveryService({
      send: jest.fn().mockResolvedValue({ status: 'SENT', responseId: 'firebase-message-1' }),
      isInvalidSubscriptionError: jest.fn().mockReturnValue(false),
    } as any);

    await service.deliverRecipient('recipient-1');

    expect(recipientUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', sentAt: expect.any(Date) }),
    }));
  });

  it('sends a Store-only event only to Store-labelled mobile tokens for a multi-role account', async () => {
    mockRecipientUpdate();
    jest.spyOn(prisma.notificationRecipient, 'findUnique').mockResolvedValue({
      id: 'recipient-1',
      userId: 'multi-role-1',
      status: 'QUEUED',
      sentAt: null,
      notification: {
        id: 'notification-1',
        eventType: 'RIDER_AT_STORE',
        title: 'Rider arrived at store',
        body: 'A rider is waiting for pickup.',
        orderId: 'order-1',
        deliveryJobId: 'job-1',
        deepLink: null,
        data: { storeId: 'store-1' },
      },
      user: { role: Role.CUSTOMER },
    } as any);
    jest.spyOn(prisma.notificationPreference, 'findMany').mockResolvedValue([] as any);
    jest.spyOn(prisma.pushSubscription, 'findMany').mockResolvedValue([
      {
        id: 'store-sub',
        userId: 'multi-role-1',
        provider: 'FCM_MOBILE',
        token: 'store-token',
        deviceName: 'Aagaam Store Partner',
        isActive: true,
      },
      {
        id: 'rider-sub',
        userId: 'multi-role-1',
        provider: 'FCM_MOBILE',
        token: 'rider-token',
        deviceName: 'Aagaam Rider',
        isActive: true,
      },
      {
        id: 'customer-sub',
        userId: 'multi-role-1',
        provider: 'FCM_MOBILE',
        token: 'customer-token',
        deviceName: 'Aagaam Customer',
        isActive: true,
      },
    ] as any);
    jest.spyOn(prisma.notificationDeliveryAttempt, 'count').mockResolvedValue(0);
    jest.spyOn(prisma.notificationDeliveryAttempt, 'create').mockResolvedValue({ id: 'attempt-1' } as any);

    const push = {
      send: jest.fn().mockResolvedValue({ status: 'SENT', responseId: 'firebase-message-1' }),
      isInvalidSubscriptionError: jest.fn().mockReturnValue(false),
    };
    const service = new NotificationDeliveryService(push as any);

    await service.deliverRecipient('recipient-1');

    expect(push.send).toHaveBeenCalledTimes(1);
    expect(push.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'store-sub', token: 'store-token' }),
      expect.objectContaining({ deepLink: '/store/notifications' }),
    );
  });
});
