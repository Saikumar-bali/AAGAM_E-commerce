import { apiClient } from './client';

export type DeliveryFailureReason =
  | 'CUSTOMER_UNREACHABLE'
  | 'CUSTOMER_REFUSED'
  | 'ADDRESS_NOT_FOUND'
  | 'WRONG_ADDRESS'
  | 'PAYMENT_NOT_AVAILABLE'
  | 'VEHICLE_BREAKDOWN'
  | 'PACKAGE_DAMAGED'
  | 'SAFETY_CONCERN'
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

/** Replays of one mutation keep one logical key. */
function operationKey(prefix: string, jobId: string) {
  return `${prefix}:${jobId}`;
}

/** Each explicit OTP issue action is a new logical operation. */
function otpIssueKey(jobId: string) {
  return `mobile-otp:${jobId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

let failureOperationSequence = 0;
const pendingFailureKeys = new Map<string, string>();

/**
 * One failure submission keeps a stable key across transport retries. After a
 * confirmed response the key is retired, so a later redelivery attempt for the
 * same job receives a new logical operation key.
 */
function failureAttemptKey(jobId: string) {
  const pending = pendingFailureKeys.get(jobId);
  if (pending) return pending;
  failureOperationSequence += 1;
  const key = `mobile-failure:${jobId}:${Date.now()}:${failureOperationSequence}`;
  pendingFailureKeys.set(jobId, key);
  return key;
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

  issueOtp: async (deliveryJobId: string, idempotencyKey = otpIssueKey(deliveryJobId)) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/otp/issue`,
      {},
      headers(idempotencyKey),
    );
    return response.data;
  },

  completeDelivery: async (
    deliveryJobId: string,
    input: {
      otpCode: string;
      proofType: 'CUSTOMER_OTP_PIN';
      riderConfirmed: true;
      note?: string;
      latitude?: number;
      longitude?: number;
      accuracyMetres?: number;
    },
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
    idempotencyKey?: string,
  ) => {
    const generatedKey = !idempotencyKey;
    const operationIdempotencyKey = idempotencyKey || failureAttemptKey(deliveryJobId);
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/failure`,
      input,
      headers(operationIdempotencyKey),
    );
    if (generatedKey) pendingFailureKeys.delete(deliveryJobId);
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

  issuePickupChallenge: async (
    deliveryJobId: string,
    input: { method: 'STORE_PICKUP_PIN' | 'QR_CODE'; parcelCount: number },
    idempotencyKey = operationKey('mobile-pickup-challenge', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/pickup/challenge`,
      input,
      headers(idempotencyKey),
    );
    return response.data;
  },

  confirmStoreHandoff: async (
    deliveryJobId: string,
    input: { parcelCount: number; latitude?: number; longitude?: number; accuracyMetres?: number },
    idempotencyKey = operationKey('mobile-pickup-confirm', deliveryJobId),
  ) => {
    const response = await apiClient.post(
      `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/pickup/confirm`,
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
