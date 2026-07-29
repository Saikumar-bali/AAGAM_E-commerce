import { apiClient } from './client';
import type { RiderPickupTask } from '../domain/pickupOperations';

export type RiderPickupPayload = {
  job: any;
  task: RiderPickupTask;
};

export type PickupReadiness = {
  deliveryJobId: string;
  deliveryStatus: string;
  ready: boolean;
  task: {
    status: string;
    verifiedAt?: string | null;
    problemType?: string | null;
    problemNote?: string | null;
    updatedAt?: string | null;
  } | null;
};

export const pickupOperationsService = {
  getRiderPickup: async (): Promise<RiderPickupPayload | null> => {
    const response = await apiClient.get('/riders/portal/pickup');
    return response.data || null;
  },

  verifyChecklist: async (
    deliveryJobId: string,
    input: { lines: Array<{ orderItemId: string; checkedQuantity: number }>; parcelCode?: string },
  ) => {
    const response = await apiClient.post(
      `/riders/portal/pickup/${encodeURIComponent(deliveryJobId)}/verify`,
      input,
    );
    return response.data;
  },

  reportProblem: async (
    deliveryJobId: string,
    input: { problemType: string; note: string },
  ) => {
    const response = await apiClient.post(
      `/riders/portal/pickup/${encodeURIComponent(deliveryJobId)}/problem`,
      input,
    );
    return response.data;
  },

  verifyChallenge: async (
    deliveryJobId: string,
    input: {
      method: 'STORE_PICKUP_PIN' | 'QR_CODE';
      code: string;
      parcelCount: number;
      latitude?: number;
      longitude?: number;
      accuracyMetres?: number;
    },
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/pickup/verify`,
      input,
    );
    return response.data;
  },

  getReadiness: async (deliveryJobId: string): Promise<PickupReadiness> => {
    const response = await apiClient.get(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/pickup/readiness`,
    );
    return response.data;
  },
};
