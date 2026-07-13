import { apiClient } from './client';

export type DeliveryFailureReason =
  | 'CUSTOMER_UNAVAILABLE'
  | 'INVALID_ADDRESS'
  | 'CUSTOMER_REFUSED'
  | 'PAYMENT_ISSUE'
  | 'UNSAFE_LOCATION'
  | 'OTHER';

export type ReturnDisposition = 'SELLABLE' | 'DAMAGED' | 'MISSING';

export type DeliveryOperation = {
  id: string;
  deliveryJobId: string;
  orderId: string;
  type: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'SUPERSEDED';
  actorUserId?: string | null;
  actorRole?: string | null;
  idempotencyKey: string;
  details?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryOperationsSummary = {
  job: any;
  operations: DeliveryOperation[];
  requirements: {
    deliveryOtpRequired: boolean;
    codCollectionRequired: boolean;
  };
  otp: {
    issued: boolean;
    operationId?: string;
    expiresAt?: string | null;
    maxAttempts?: number;
  };
  cod: {
    applicable: boolean;
    expectedAmountPaise: number;
    collected: boolean;
    settled: boolean;
  };
  returnInspection: DeliveryOperation | null;
};

export type DeliveryOperationsQueueItem = any & {
  operations: DeliveryOperation[];
};

export type ReturnInspectionLine = {
  orderItemId: string;
  disposition: ReturnDisposition;
  quantity: number;
  note?: string;
};

function operationKey(prefix: string, jobId: string) {
  return `${prefix}:${jobId}:${Date.now()}`;
}

function headers(idempotencyKey: string) {
  return { headers: { 'Idempotency-Key': idempotencyKey } };
}

export const deliveryOperationsService = {
  getSummary: async (deliveryJobId: string): Promise<DeliveryOperationsSummary> => {
    const response = await apiClient.get(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/summary`,
    );
    return response.data;
  },

  getQueue: async (): Promise<DeliveryOperationsQueueItem[]> => {
    const response = await apiClient.get('/orders/delivery-operations/queue');
    return Array.isArray(response.data) ? response.data : [];
  },

  issueOtp: async (deliveryJobId: string, idempotencyKey = operationKey('mobile-otp', deliveryJobId)) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/otp/issue`,
      {},
      headers(idempotencyKey),
    );
    return response.data;
  },

  completeDelivery: async (
    deliveryJobId: string,
    input: { otpCode?: string; proofType?: string; note?: string },
    idempotencyKey = operationKey('mobile-complete', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/complete`,
      input,
      headers(idempotencyKey),
    );
    return response.data;
  },

  recordFailure: async (
    deliveryJobId: string,
    input: { reason: DeliveryFailureReason; note?: string },
    idempotencyKey = operationKey('mobile-failure', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/failure`,
      input,
      headers(idempotencyKey),
    );
    return response.data;
  },

  startReturn: async (
    deliveryJobId: string,
    idempotencyKey = operationKey('mobile-return-start', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/return/start`,
      {},
      headers(idempotencyKey),
    );
    return response.data;
  },

  confirmReturn: async (
    deliveryJobId: string,
    idempotencyKey = operationKey('mobile-return-confirm', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/return/confirm`,
      {},
      headers(idempotencyKey),
    );
    return response.data;
  },

  inspectReturn: async (
    deliveryJobId: string,
    input: { lines: ReturnInspectionLine[]; note?: string },
    idempotencyKey = operationKey('mobile-return-inspection', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/return/inspection`,
      input,
      headers(idempotencyKey),
    );
    return response.data;
  },

  collectCod: async (
    deliveryJobId: string,
    input: { amountPaise: number; collectionReference?: string },
    idempotencyKey = operationKey('mobile-cod-collect', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/cod/collect`,
      input,
      headers(idempotencyKey),
    );
    return response.data;
  },

  settleCod: async (
    deliveryJobId: string,
    input: { amountPaise: number; settlementReference: string; note?: string },
    idempotencyKey = operationKey('mobile-cod-settle', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/cod/settle`,
      input,
      headers(idempotencyKey),
    );
    return response.data;
  },
};
