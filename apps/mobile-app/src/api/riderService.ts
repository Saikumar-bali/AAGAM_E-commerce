import { apiClient } from './client';

export const riderService = {
  // Get orders assigned to the current rider
  getAssignedOrders: async () => {
    const response = await apiClient.get('/orders/rider');
    return response.data;
  },

  // Get available orders in the queue
  getAvailableQueue: async () => {
    const response = await apiClient.get('/orders/rider/queue');
    return response.data;
  },

  // Update an order's status
  updateOrderStatus: async (orderId: string, status: string, riderId?: string) => {
    const response = await apiClient.patch(`/orders/${orderId}/status`, {
      status,
      riderId,
    });
    return response.data;
  },

  startTracking: async (orderId: string) => {
    const response = await apiClient.post(`/tracking/start/${orderId}`);
    return response.data;
  },

  stopTracking: async (orderId: string) => {
    const response = await apiClient.post(`/tracking/stop/${orderId}`);
    return response.data;
  },

  sendLocationPing: async (
    orderId: string,
    location: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      speed?: number;
      heading?: number;
    },
  ) => {
    const response = await apiClient.post('/tracking/rider-location', {
      orderId,
      ...location,
      source: 'MOBILE',
    });
    return response.data;
  },

  // Update rider's own status and location
  updateRiderStatus: async (riderId: string, status: string, location?: { latitude: number; longitude: number }) => {
    const response = await apiClient.patch(`/riders/${riderId}/status`, {
      status,
      ...location,
    });
    return response.data;
  },

  // Assign an order to the current rider (Accept/Pick)
  assignOrder: async (orderId: string) => {
    const response = await apiClient.patch('/orders/assign', { orderId });
    return response.data;
  },

  // Get rider's own profile/details
  getProfile: async (userId: string) => {
    const response = await apiClient.get(`/riders/${userId}`);
    return response.data;
  }
};
