import { apiClient } from './client';

export type PartnerNotification = {
  id: string;
  recipientId?: string;
  sourceHistoryId: string;
  orderId?: string | null;
  deliveryJobId?: string | null;
  assignmentId?: string | null;
  ticketId?: string | null;
  storeId?: string | null;
  type: string;
  title: string;
  body: string;
  deepLink?: string | null;
  target?: string | null;
  action?: string | null;
  createdAt: string;
  sentAt?: string | null;
  openedAt?: string | null;
  readAt?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type PartnerNotificationInbox = {
  items: PartnerNotification[];
  unreadCount: number;
  source?: string;
};

export type NotificationPreference = {
  eventType: string;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  required?: boolean;
  title?: string;
  description?: string;
};

export type PushSubscriptionSummary = {
  id: string;
  provider?: string;
  deviceName?: string | null;
  userAgent?: string | null;
  enabled?: boolean;
  lastSeenAt?: string | null;
  createdAt?: string;
  isCurrentDevice?: boolean;
};

function normalizePreferences(value: unknown): NotificationPreference[] {
  const items = Array.isArray(value)
    ? value
    : Array.isArray((value as any)?.items)
      ? (value as any).items
      : [];
  return items.map((item: any) => ({
    eventType: String(item.eventType || item.type || ''),
    pushEnabled: item.pushEnabled !== false,
    inAppEnabled: item.inAppEnabled !== false,
    required: Boolean(item.required || item.mandatory || item.critical),
    title: item.title,
    description: item.description,
  })).filter((item) => item.eventType);
}

export const notificationService = {
  getInbox: async (limit = 50): Promise<PartnerNotificationInbox> => {
    const response = await apiClient.get('/notifications/inbox', { params: { limit } });
    return {
      items: Array.isArray(response.data?.items) ? response.data.items : [],
      unreadCount: Number(response.data?.unreadCount || 0),
      source: response.data?.source,
    };
  },

  markRead: async (notificationId: string) => {
    const response = await apiClient.patch(`/notifications/${encodeURIComponent(notificationId)}/read`);
    return response.data;
  },

  markOpened: async (recipientId: string) => {
    const response = await apiClient.patch(`/notifications/${encodeURIComponent(recipientId)}/opened`);
    return response.data;
  },

  getPreferences: async (): Promise<NotificationPreference[]> => {
    const response = await apiClient.get('/notifications/preferences');
    return normalizePreferences(response.data);
  },

  updatePreference: async (input: {
    eventType: string;
    pushEnabled?: boolean;
    inAppEnabled?: boolean;
  }) => {
    const response = await apiClient.patch('/notifications/preferences', input);
    return response.data;
  },

  getPushSubscriptions: async (): Promise<PushSubscriptionSummary[]> => {
    const response = await apiClient.get('/notifications/push/subscriptions');
    const items = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.data?.items)
        ? response.data.items
        : [];
    return items.map((item: any) => ({
      id: String(item.id),
      provider: item.provider,
      deviceName: item.deviceName,
      userAgent: item.userAgent,
      enabled: item.enabled !== false,
      lastSeenAt: item.lastSeenAt,
      createdAt: item.createdAt,
      isCurrentDevice: Boolean(item.isCurrentDevice),
    }));
  },

  disablePushSubscription: async (subscriptionId: string) => {
    const response = await apiClient.delete(
      `/notifications/push/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    return response.data;
  },
};
