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

let readinessQueueRequest: Promise<PickupReadiness[]> | null = null;

function fallbackPickupReadiness(deliveryJobId: string): PickupReadiness {
  return {
    deliveryJobId,
    deliveryStatus: 'RIDER_AT_STORE',
    ready: false,
    task: null,
  };
}

function getReadinessQueueOnce(): Promise<PickupReadiness[]> {
  if (!readinessQueueRequest) {
    readinessQueueRequest = apiClient
      .get('/orders/delivery-operations/pickup/readiness')
      .then((response) => (Array.isArray(response.data) ? response.data : []))
      .finally(() => {
        readinessQueueRequest = null;
      });
  }

  return readinessQueueRequest;
}

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
    input: { problemType: string; note: string; evidenceKeys?: string[] },
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

  getReadinessQueue: async (): Promise<PickupReadiness[]> => getReadinessQueueOnce(),

  getReadiness: async (deliveryJobId: string): Promise<PickupReadiness> => {
    try {
      const queue = await getReadinessQueueOnce();
      return queue.find((entry) => entry.deliveryJobId === deliveryJobId)
        || fallbackPickupReadiness(deliveryJobId);
    } catch (error) {
      if (__DEV__) console.warn('[Pickup readiness] Refresh failed; keeping queue visible.', error);
      return fallbackPickupReadiness(deliveryJobId);
    }
  },
};
