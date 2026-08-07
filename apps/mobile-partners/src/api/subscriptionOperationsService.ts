import { apiClient } from './client';

export type DeliveryRunStatus =
  | 'PLANNED'
  | 'RIDER_NEEDED'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'IN_PROGRESS'
  | 'RETURNING'
  | 'AWAITING_SETTLEMENT'
  | 'INTERRUPTED'
  | 'RECOVERY_REQUIRED'
  | 'COMPLETED'
  | 'CANCELLED';

export type DeliveryRunStopStatus =
  | 'PLANNED'
  | 'READY'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRY_PENDING'
  | 'RETURN_REQUIRED'
  | 'RETURNED'
  | 'CANCELLED';

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

export type DeliveryRunSummary = {
  id: string;
  routeCode: string;
  deliveryZoneId?: string | null;
  deliveryZone?: { id: string; code: string; name: string; maximumStopsPerRun?: number; cashRiskLimitPaise?: number } | null;
  planningAlgorithmVersion?: string;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  assignmentReasonSummary?: string | null;
  assignmentSource?: 'AUTOMATIC' | 'MANUAL' | 'RECOVERY' | null;
  recoveryFromRunId?: string | null;
  serviceDate: string;
  slotStart: string;
  slotEnd: string;
  status: DeliveryRunStatus;
  totalStopCount: number;
  completedStopCount: number;
  failedStopCount: number;
  retryPendingStopCount: number;
  expectedCashPaise: number;
  collectedCashPaise: number;
  depositedCashPaise: number;
  varianceCashPaise: number;
  expectedParcelCount: number;
  version: number;
  expectedBagCount?: number;
  packedBagCount?: number;
  crateCode?: string | null;
  storeHandoffConfirmedAt?: string | null;
  storeHandoffConfirmedById?: string | null;
  pickupConfirmedAt?: string | null;
  pickupConfirmedById?: string | null;
  store: { id: string; name: string; address: string; latitude: number; longitude: number };
  _count?: { stops: number };
};

export type DeliveryRunStop = {
  id: string;
  deliveryRunId: string;
  deliveryJobId: string;
  subscriptionDeliveryId: string;
  deliveryZoneId?: string | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  movedFromRunId?: string | null;
  lastMovedAt?: string | null;
  sequenceNumber: number;
  status: DeliveryRunStopStatus;
  proofMode: string;
  cashDuePaise: number;
  expectedItemCount: number;
  expectedParcelCount: number;
  arrivedAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  retryCount: number;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMetres?: number | null;
  proofReference?: string | null;
  failureReason?: string | null;
  routeOrderChangeReason?: string | null;
  version: number;
  deliveryJob: {
    id: string;
    status: string;
    order: {
      id: string;
      grandTotalPaise: number;
      customer: { name?: string | null; phone?: string | null };
      payment?: { method?: string | null; amountPaise?: number | null; status?: string | null } | null;
      items: Array<{
        id: string;
        quantity: number;
        product: { id: string; name: string; image?: string | null };
      }>;
    };
  };
  subscriptionDelivery: {
    id: string;
    serviceDate: string;
    subscription: {
      id: string;
      customerId: string;
      addressSnapshot?: Record<string, unknown> | null;
      deliveryMethod: 'TRUSTED_DROP' | 'PERSONAL_HANDOVER' | 'SECURITY_RECEPTION';
      trustedDropInstructions?: string | null;
    };
  };
};

export type DeliveryRunDetails = DeliveryRunSummary & { stops: DeliveryRunStop[] };

export type CashLedger = {
  id: string;
  orderId: string;
  expectedAmountPaise: number;
  collectedAmountPaise: number;
  depositedAmountPaise: number;
  riderHoldingBalancePaise: number;
  status: string;
};

export type CashAccountability = {
  runId: string;
  routeCode: string;
  expectedCashPaise: number;
  collectedCashPaise: number;
  depositedCashPaise: number;
  riderHoldingPaise: number;
  ledgers: CashLedger[];
};

export type CashDepositBatch = {
  id: string;
  reference: string;
  status: string;
  expectedAmountPaise: number;
  submittedAmountPaise: number;
  verifiedAmountPaise: number;
  variancePaise: number;
  version: number;
  createdAt: string;
};

export type StoreDemandProduct = { productId: string; name: string; quantity: number };

export type StoreDemandItem = {
  serviceDate: string;
  storeId: string;
  stopCount: number;
  productTotals: StoreDemandProduct[];
};

export type StoreRunStop = {
  id: string;
  sequenceNumber: number;
  status: DeliveryRunStopStatus;
  expectedItemCount: number;
  expectedParcelCount: number;
  cashDuePaise: number;
  failureReason?: string | null;
  subscriptionDelivery: {
    id: string;
    subscription: {
      customerId: string;
      addressSnapshot?: Record<string, unknown> | null;
      itemsSnapshot?: unknown;
      deliveryMethod: 'TRUSTED_DROP' | 'PERSONAL_HANDOVER' | 'SECURITY_RECEPTION';
    };
    order?: {
      id: string;
      customer?: { name?: string | null; phone?: string | null } | null;
      items: Array<{ id: string; quantity: number; product: { id: string; name: string; image?: string | null } }>;
    } | null;
  };
};

export type StoreRun = DeliveryRunSummary & {
  expectedBagCount?: number;
  packedBagCount?: number;
  crateCode?: string | null;
  rider?: { id: string; user?: { id: string; name?: string | null; phone?: string | null } | null } | null;
  stops: StoreRunStop[];
};

export type StoreSubscriptionException = StoreRunStop & {
  deliveryRun: DeliveryRunSummary;
};

function requestHeaders(idempotencyKey: string) {
  return { headers: { 'Idempotency-Key': idempotencyKey } };
}

function mutationKey(scope: string, id: string, version: number) {
  return `partners:${scope}:${id}:v${version}`;
}

export const subscriptionOperationsService = {
  getTodayRuns: async (): Promise<DeliveryRunSummary[]> => {
    const response = await apiClient.get('/rider/delivery-runs/today');
    return Array.isArray(response.data) ? response.data : [];
  },

  getRun: async (runId: string): Promise<DeliveryRunDetails> => {
    const response = await apiClient.get(`/rider/delivery-runs/${encodeURIComponent(runId)}`);
    return response.data;
  },

  confirmRunPickupReceipt: async (runId: string, input: { version: number; expectedBagCount: number; crateCode?: string }) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/pickup`,
      input,
      requestHeaders(mutationKey('pickup-receipt', runId, input.version)),
    );
    return response.data;
  },

  startRun: async (runId: string, version: number) => {
    const response = await apiClient.post(`/rider/delivery-runs/${encodeURIComponent(runId)}/start`, { version });
    return response.data;
  },

  arriveAtStop: async (
    runId: string,
    stopId: string,
    input: { version: number; latitude: number; longitude: number; accuracyMetres?: number },
  ) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/arrive`,
      input,
      requestHeaders(mutationKey('arrive', stopId, input.version)),
    );
    return response.data;
  },

  issueStopOtp: async (runId: string, stopId: string, version: number) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/otp`,
      {},
      requestHeaders(mutationKey('otp', stopId, version)),
    );
    return response.data;
  },


  uploadTrustedDropEvidence: async (
    runId: string,
    stopId: string,
    input: { trustedDropToken: string; file: { uri: string; name: string; type: string }; capturedAt?: string },
  ): Promise<{ id: string; storageKey: string; capturedAt: string }> => {
    const form = new FormData();
    form.append('trustedDropToken', input.trustedDropToken);
    if (input.capturedAt) form.append('capturedAt', input.capturedAt);
    form.append('file', input.file as any);
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/trusted-drop-evidence`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  },

  completeStop: async (
    runId: string,
    stopId: string,
    input: {
      version: number;
      latitude: number;
      longitude: number;
      accuracyMetres?: number;
      riderConfirmed: true;
      otpCode?: string;
      trustedDropToken?: string;
      evidenceId?: string;
      cashCollectedPaise?: number;
      note?: string;
    },
  ) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/complete`,
      input,
      requestHeaders(mutationKey('complete', stopId, input.version)),
    );
    return response.data;
  },

  failStop: async (
    runId: string,
    stopId: string,
    input: {
      version: number;
      latitude: number;
      longitude: number;
      accuracyMetres?: number;
      reason: DeliveryFailureReason;
      note?: string;
      retryRequested?: boolean;
    },
  ) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/fail`,
      input,
      requestHeaders(mutationKey('fail', stopId, input.version)),
    );
    return response.data;
  },

  reorderStop: async (runId: string, stopId: string, input: { version: number; newSequenceNumber: number; reason: string }) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/reorder`,
      input,
    );
    return response.data;
  },

  finishRun: async (runId: string, version: number) => {
    const response = await apiClient.post(`/rider/delivery-runs/${encodeURIComponent(runId)}/finish`, { version });
    return response.data;
  },

  getCashAccountability: async (runId: string): Promise<CashAccountability> => {
    const response = await apiClient.get(`/rider/delivery-runs/${encodeURIComponent(runId)}/cash-accountability`);
    return response.data;
  },

  createCashBatch: async (runId: string, version: number, codLedgerIds: string[]): Promise<CashDepositBatch> => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/cash-batches`,
      { version, codLedgerIds },
      requestHeaders(mutationKey('cash-batch', runId, version)),
    );
    return response.data;
  },

  submitCashBatch: async (batchId: string, version: number, submittedAmountPaise: number): Promise<CashDepositBatch> => {
    const response = await apiClient.post(
      `/rider/delivery-runs/cash-batches/${encodeURIComponent(batchId)}/submit`,
      { version, submittedAmountPaise },
      requestHeaders(mutationKey('cash-submit', batchId, version)),
    );
    return response.data;
  },

  getRiderCashBatches: async (): Promise<CashDepositBatch[]> => {
    const response = await apiClient.get('/rider/delivery-runs/cash-batches');
    return Array.isArray(response.data) ? response.data : [];
  },

  getStoreDemand: async (days = 14): Promise<StoreDemandItem[]> => {
    const response = await apiClient.get('/store/subscription-operations/demand', { params: { days } });
    return Array.isArray(response.data) ? response.data : [];
  },

  getStoreRuns: async (): Promise<StoreRun[]> => {
    const response = await apiClient.get('/store/subscription-operations/runs');
    return Array.isArray(response.data) ? response.data : [];
  },

  getStoreExceptions: async (): Promise<StoreSubscriptionException[]> => {
    const response = await apiClient.get('/store/subscription-operations/exceptions');
    return Array.isArray(response.data) ? response.data : [];
  },

  getStoreCashBatches: async (): Promise<CashDepositBatch[]> => {
    const response = await apiClient.get('/store/subscription-operations/cash-batches');
    return Array.isArray(response.data) ? response.data : [];
  },

  confirmRunPacking: async (
    runId: string,
    input: { version: number; expectedBagCount: number; packedBagCount: number; crateCode?: string; exceptionNote?: string },
  ) => {
    const response = await apiClient.post(`/store/subscription-operations/runs/${encodeURIComponent(runId)}/packing`, input);
    return response.data;
  },

  confirmRunPickup: async (runId: string, version: number) => {
    const response = await apiClient.post(`/store/subscription-operations/runs/${encodeURIComponent(runId)}/pickup`, { version });
    return response.data;
  },

  verifyCashBatch: async (
    batchId: string,
    input: { version: number; verifiedAmountPaise: number; settlementReference: string; varianceReason?: string },
  ) => {
    const response = await apiClient.post(
      `/store/subscription-operations/cash-batches/${encodeURIComponent(batchId)}/verify`,
      input,
      requestHeaders(mutationKey('cash-verify', batchId, input.version)),
    );
    return response.data;
  },
};
