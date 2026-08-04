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

export const riderPortalService = {
  getHome: async (): Promise<RiderPortalHome> => (
    await apiClient.get('/riders/portal/home')
  ).data,

  getOffers: async (): Promise<RiderPortalOffer[]> => {
    const response = await apiClient.get('/riders/portal/offers');
    return Array.isArray(response.data) ? response.data : [];
  },

  getCurrentDelivery: async (): Promise<RiderPortalDelivery> => (
    await apiClient.get('/riders/portal/delivery')
  ).data || null,

  getHistory: async (): Promise<RiderDeliveryJob[]> => {
    const response = await apiClient.get('/riders/portal/history');
    return Array.isArray(response.data) ? response.data : [];
  },

  getWorkspace: async (): Promise<RiderWorkspace> => {
    try {
      const [home, offers, delivery, history] = await Promise.all([
        riderPortalService.getHome(),
        riderPortalService.getOffers(),
        riderPortalService.getCurrentDelivery(),
        riderPortalService.getHistory(),
      ]);
      return normalizeRiderPortalWorkspace({ home, offers, delivery, history });
    } catch (error) {
      if (!shouldUseLegacyRiderWorkspace(error)) throw error;
      const response = await apiClient.get('/orders/dispatch/rider/workspace');
      return normalizeRiderWorkspace(response.data);
    }
  },
};
