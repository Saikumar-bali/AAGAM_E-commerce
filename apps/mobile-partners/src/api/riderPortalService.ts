import {
  normalizeRiderPortalWorkspace,
  RiderPortalDelivery,
  RiderPortalHome,
  RiderPortalOffer,
  shouldUseLegacyRiderWorkspace,
} from '../domain/riderPortal';
import type { RiderDeliveryJob, RiderWorkspace } from '../domain/riderWorkspace';
import { normalizeRiderWorkspace } from '../domain/riderWorkspace';
import { apiClient } from './client';

function stripRawContact<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  const clone: any = Array.isArray(value) ? value.map(stripRawContact) : { ...(value as any) };
  if (clone.order) {
    clone.order = { ...clone.order };
    if (clone.order.customer) {
      clone.order.customer = { ...clone.order.customer };
      delete clone.order.customer.phone;
      delete clone.order.customer.email;
    }
    if (clone.order.store) {
      clone.order.store = { ...clone.order.store };
      delete clone.order.store.owner;
    }
    if (clone.order.addressSnapshot && typeof clone.order.addressSnapshot === 'object') {
      clone.order.addressSnapshot = { ...clone.order.addressSnapshot };
      delete clone.order.addressSnapshot.phoneE164;
      delete clone.order.addressSnapshot.alternatePhoneE164;
    }
    if (clone.order.customerSnapshot && typeof clone.order.customerSnapshot === 'object') {
      clone.order.customerSnapshot = { ...clone.order.customerSnapshot };
      delete clone.order.customerSnapshot.phone;
      delete clone.order.customerSnapshot.email;
    }
  }
  if (clone.deliveryJob) clone.deliveryJob = stripRawContact(clone.deliveryJob);
  return clone;
}

export const riderPortalService = {
  getHome: async (): Promise<RiderPortalHome> => stripRawContact((await apiClient.get('/riders/portal/home')).data),

  getOffers: async (): Promise<RiderPortalOffer[]> => {
    const response = await apiClient.get('/riders/portal/offers');
    return Array.isArray(response.data) ? response.data.map(stripRawContact) : [];
  },

  getCurrentDelivery: async (): Promise<RiderPortalDelivery> => stripRawContact((await apiClient.get('/riders/portal/delivery')).data || null),

  getHistory: async (): Promise<RiderDeliveryJob[]> => {
    const response = await apiClient.get('/riders/portal/history', { params: { page: 1, pageSize: 20, status: 'ALL' } });
    const rows = Array.isArray(response.data) ? response.data : Array.isArray(response.data?.items) ? response.data.items : [];
    return rows.map((row: any) => stripRawContact(row?.order ? row : {
      id: row.id,
      orderId: row.orderId,
      status: row.status,
      currentRiderId: null,
      version: 0,
      createdAt: row.outcomeAt,
      updatedAt: row.outcomeAt,
      completedAt: row.outcomeAt,
      order: {
        id: row.orderId,
        status: row.status === 'DELIVERED' ? 'DELIVERED' : row.status === 'CANCELLED' ? 'CANCELLED' : 'OUT_FOR_DELIVERY',
        store: row.store,
        customer: row.customer,
        addressSnapshot: row.customer?.destination || null,
        items: [],
        deliveredAt: row.status === 'DELIVERED' ? row.outcomeAt : null,
      },
    }));
  },

  getWorkspace: async (): Promise<RiderWorkspace> => {
    try {
      const [home, offers, delivery] = await Promise.all([
        riderPortalService.getHome(),
        riderPortalService.getOffers(),
        riderPortalService.getCurrentDelivery(),
      ]);
      return normalizeRiderPortalWorkspace({ home, offers, delivery, history: [] });
    } catch (error) {
      if (!shouldUseLegacyRiderWorkspace(error)) throw error;
      const response = await apiClient.get('/orders/dispatch/rider/workspace');
      return stripRawContact(normalizeRiderWorkspace(response.data));
    }
  },
};
