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

export type StoreOwnerProfilePayload = {
  name: string;
  address: string;
  phone: string;
};

export type StoreOrderStatus =
  | 'PENDING'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'CONFIRMED'
  | 'PICKING'
  | 'PACKED'
  | 'RIDER_ASSIGNED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type StoreOrderQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: StoreOrderStatus | StoreOrderStatus[];
};

export type StoreOrderPage = {
  items: any[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  statusCounts?: Partial<Record<StoreOrderStatus, number>>;
};

export const storeService = {
  getMyStores: async () => {
    const r = await apiClient.get('/stores/my-stores');
    return r.data;
  },

  getStoreDashboardSummaries: async () => {
    const r = await apiClient.get('/store-owner/stores');
    return r.data;
  },

  getPendingOrderCount: async (): Promise<{ count: number }> => {
    const r = await apiClient.get('/store-owner/orders/summary/pending-count');
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

  getStoreOrders: async (storeId: string, query: StoreOrderQuery = {}): Promise<StoreOrderPage> => {
    const status = Array.isArray(query.status) ? query.status.join(',') : query.status;
    const r = await apiClient.get(`/store-owner/orders/${encodeURIComponent(storeId)}`, {
      params: {
        page: query.page || 1,
        pageSize: query.pageSize || 20,
        search: query.search?.trim() || undefined,
        status: status || undefined,
      },
    });
    return r.data;
  },

  getStoreOrder: async (storeId: string, orderId: string) => {
    const r = await apiClient.get(
      `/store-owner/orders/${encodeURIComponent(storeId)}/${encodeURIComponent(orderId)}`,
    );
    return r.data;
  },

  updateOrderStatus: async (orderId: string, status: StoreOrderStatus) => {
    const r = await apiClient.patch(`/orders/${orderId}/status`, { status });
    return r.data;
  },

  markOrderReady: async (orderId: string) => {
    const r = await apiClient.patch(`/orders/store/${orderId}/ready`);
    return r.data;
  },

  markOrderItemUnavailable: async (orderId: string, itemId: string, reason = 'Store marked item unavailable') => {
    const r = await apiClient.patch(`/orders/store/${orderId}/items/${itemId}/unavailable`, { reason });
    return r.data;
  },

  getOrderItemSubstitutes: async (orderId: string, itemId: string) => {
    const r = await apiClient.get(`/orders/store/${orderId}/items/${itemId}/substitutes`);
    return r.data;
  },

  applyOrderItemSubstitute: async (orderId: string, itemId: string, productId: string) => {
    const r = await apiClient.patch(`/orders/store/${orderId}/items/${itemId}/substitute`, { productId });
    return r.data;
  },

  getStoreAssortment: async (storeId: string) => {
    const r = await apiClient.get(`/stores/${storeId}/assortment`);
    return r.data;
  },

  getAvailableCatalogue: async (storeId: string, search = '', page = 1, pageSize = 50) => {
    const r = await apiClient.get(`/stores/${storeId}/catalog`, {
      params: { page, pageSize, search: search || undefined },
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

  updateOwnedStoreProfile: async (storeId: string, data: StoreOwnerProfilePayload) => {
    const r = await apiClient.patch(`/store-owner/stores/${storeId}/profile`, data);
    return r.data;
  },

  updateStore: async (storeId: string, data: Record<string, any>) => {
    const r = await apiClient.patch(`/stores/${storeId}`, data);
    return r.data;
  },
};
