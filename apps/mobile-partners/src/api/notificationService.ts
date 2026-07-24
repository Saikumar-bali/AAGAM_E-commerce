import { apiClient } from './client';

export type PartnerNotification = {
  id: string;
  recipientId?: string;
  sourceHistoryId: string;
  orderId?: string | null;
  deliveryJobId?: string | null;
  type: string;
  title: string;
  body: string;
  deepLink?: string | null;
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
};
