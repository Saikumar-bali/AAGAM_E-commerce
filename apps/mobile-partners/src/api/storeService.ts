import { apiClient } from './client';

export const storeService = {
  getMyStores: async () => {
    const r = await apiClient.get('/stores/mine');
    return r.data;
  },

  createStore: async (data: { name: string; address: string; phone: string }) => {
    const r = await apiClient.post('/stores', data);
    return r.data;
  },

  getStoreStats: async (storeId: string) => {
    const r = await apiClient.get(`/stores/${storeId}/stats`);
    return r.data;
  },

  getStoreOrders: async (storeId: string) => {
    const r = await apiClient.get(`/stores/${storeId}/orders`);
    return r.data;
  },

  updateStore: async (storeId: string, data: Record<string, any>) => {
    const r = await apiClient.patch(`/stores/${storeId}`, data);
    return r.data;
  },
};
