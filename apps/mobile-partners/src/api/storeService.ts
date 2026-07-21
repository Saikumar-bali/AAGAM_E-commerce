import { apiClient } from './client';

export type AddStoreProductPayload = {
  productId: string;
  openingQuantity: number;
  sellingPrice: number | null;
  isListed?: boolean;
  autoHideWhenOutOfStock?: boolean;
};

export type UpdateStoreInventoryPayload = {
  productId: string;
  quantity: number;
  sellingPrice: number | null;
  isListed: boolean;
  autoHideWhenOutOfStock: boolean;
};

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

  getStoreAssortment: async (storeId: string) => {
    const r = await apiClient.get(`/stores/${storeId}/assortment`);
    return r.data;
  },

  getAvailableCatalogue: async (storeId: string, search = '') => {
    const r = await apiClient.get(`/stores/${storeId}/catalog`, {
      params: { page: 1, pageSize: 50, search: search || undefined },
    });
    return r.data;
  },

  addStoreProduct: async (storeId: string, data: AddStoreProductPayload) => {
    const r = await apiClient.post(`/stores/${storeId}/assortment`, data);
    return r.data;
  },

  updateInventory: async (storeId: string, data: UpdateStoreInventoryPayload) => {
    const r = await apiClient.patch(`/stores/${storeId}/inventory`, data);
    return r.data;
  },

  updateStore: async (storeId: string, data: Record<string, any>) => {
    const r = await apiClient.patch(`/stores/${storeId}`, data);
    return r.data;
  },
};
