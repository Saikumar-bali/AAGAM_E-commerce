import { apiClient } from './client';

export const riderService = {
  getAssignedOrders: async () => {
    const r = await apiClient.get('/orders/rider');
    return r.data;
  },

  getAvailableQueue: async () => {
    const r = await apiClient.get('/orders/rider/queue');
    return r.data;
  },

  updateOrderStatus: async (orderId: string, status: string, riderId?: string) => {
    const r = await apiClient.patch(`/orders/${orderId}/status`, { status, riderId });
    return r.data;
  },

  startTracking: async (orderId: string) => {
    const r = await apiClient.post(`/tracking/start/${orderId}`);
    return r.data;
  },

  stopTracking: async (orderId: string) => {
    const r = await apiClient.post(`/tracking/stop/${orderId}`);
    return r.data;
  },

  sendLocationPing: async (
    orderId: string,
    location: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      speed?: number;
      heading?: number;
    }
  ) => {
    const r = await apiClient.post('/tracking/rider-location', {
      orderId,
      ...location,
      source: 'MOBILE',
    });
    return r.data;
  },

  updateMyStatus: async (status: string, location?: { latitude: number; longitude: number }) => {
    const r = await apiClient.patch('/riders/me/status', { status, ...location });
    return r.data;
  },

  assignOrder: async (orderId: string) => {
    const r = await apiClient.patch('/orders/assign', { orderId });
    return r.data;
  },

  getProfile: async (userId: string) => {
    const r = await apiClient.get(`/riders/${userId}`);
    return r.data;
  },
};
