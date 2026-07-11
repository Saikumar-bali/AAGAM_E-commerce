import { RiderJobAction, RiderWorkspace, normalizeRiderWorkspace } from '../domain/riderWorkspace';
import { apiClient } from './client';

export type RiderLocationPayload = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  clientPingId: string;
  sequence: number;
  capturedAt: string;
};

const TRANSITION_PATHS: Record<RiderJobAction, string> = {
  EN_ROUTE_TO_STORE: 'en-route-to-store',
  ARRIVED_AT_STORE: 'arrived-at-store',
  OUT_FOR_DELIVERY: 'out-for-delivery',
  ARRIVED_AT_CUSTOMER: 'arrived-at-customer',
  DELIVERED: 'delivered',
};

export const riderService = {
  getWorkspace: async (): Promise<RiderWorkspace> => {
    const response = await apiClient.get('/orders/dispatch/rider/workspace');
    return normalizeRiderWorkspace(response.data);
  },

  acceptOffer: async (assignmentId: string) => {
    const response = await apiClient.patch(
      `/orders/dispatch/assignments/${encodeURIComponent(assignmentId)}/accept`,
    );
    return response.data;
  },

  rejectOffer: async (assignmentId: string, reason?: string) => {
    const response = await apiClient.patch(
      `/orders/dispatch/assignments/${encodeURIComponent(assignmentId)}/reject`,
      reason ? { reason } : {},
    );
    return response.data;
  },

  transitionJob: async (
    deliveryJobId: string,
    action: RiderJobAction,
    proof?: { proofType?: string; code?: string; note?: string; latitude?: number; longitude?: number },
  ) => {
    const path = TRANSITION_PATHS[action];
    const response = await apiClient.patch(
      `/orders/dispatch/jobs/${encodeURIComponent(deliveryJobId)}/${path}`,
      action === 'DELIVERED' ? (proof || { proofType: 'RIDER_CONFIRMATION' }) : {},
    );
    return response.data;
  },

  startTracking: async (orderId: string) => {
    const response = await apiClient.post(`/tracking/start/${encodeURIComponent(orderId)}`);
    return response.data;
  },

  stopTracking: async (orderId: string, reason = 'WORKSPACE_INACTIVE') => {
    const response = await apiClient.post(
      `/tracking/stop/${encodeURIComponent(orderId)}`,
      { reason },
    );
    return response.data;
  },

  sendLocationPing: async (orderId: string, location: RiderLocationPayload) => {
    const response = await apiClient.post('/tracking/rider-location', {
      orderId,
      ...location,
      source: 'MOBILE_PARTNERS',
    });
    return response.data;
  },

  updateMyStatus: async (
    status: 'ONLINE' | 'OFFLINE' | 'BUSY',
    location?: { latitude: number; longitude: number },
  ) => {
    const response = await apiClient.patch('/riders/me/status', {
      status,
      ...(location || {}),
    });
    return response.data;
  },

  getProfile: async (userId: string) => {
    const response = await apiClient.get(`/riders/${encodeURIComponent(userId)}`);
    return response.data;
  },
};
