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
    deliverySlot?: string | null;
    cashDuePaise?: number;
    cashCollectedPaise?: number;
    subscription: {
      id: string;
      customerId: string;
      addressSnapshot?: Record<string, unknown> | null;
      deliveryMethod: 'TRUSTED_DROP' | 'PERSONAL_HANDOVER' | 'SECURITY_RECEPTION';
      trustedDropInstructions?: string | null;
      itemsSnapshot?: Record<string, unknown> | null;
      plan?: { name?: string | null } | null;
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

  skipStop: async (runId: string, stopId: string, input: { reason?: string; note?: string; version: number }) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/skip`,
      input,
      requestHeaders(mutationKey('skip', stopId, input.version)),
    );
    return response.data;
  },

  // Collect cash at the door. The rider holds the money and hands it to the
  // store later; the server caps the amount at the day's outstanding due so an
  // over-collection is a 400, not a 500.
  recordStopPayment: async (
    runId: string,
    stopId: string,
    input: { version: number; amountPaise: number; paymentMode?: 'CASH' | 'PHONE_PE'; note?: string },
  ) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/record-payment`,
      input,
      requestHeaders(mutationKey('payment', stopId, input.version)),
    );
    return response.data;
  },

  // Reverse a mistaken completion or skip. The server restores the stop to
  // ARRIVED (undo deliver) or PLANNED (undo skip) and unwinds the counters.
  undoStop: async (runId: string, stopId: string, input: { version: number; reason?: string }) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/undo`,
      input,
      requestHeaders(mutationKey('undo', stopId, input.version)),
    );
    return response.data;
  },

  finishRun: async (runId: string, version: number) => {
    const response = await apiClient.post(`/rider/delivery-runs/${encodeURIComponent(runId)}/finish`, { version });
    return response.data;
  },

  addExtraMilk: async (
    runId: string,
    stopId: string,
    input: {
      extraQuantity: string;
      extraPaise?: number;
      consecutiveDays?: number;
      targetSlot?: 'AM' | 'PM';
      note?: string;
    },
    // A rider on a flaky connection can tap "Attach" twice; the key lets the
    // API collapse the replay instead of charging the add-on twice.
    idempotencyKey?: string,
  ) => {
    const response = await apiClient.post(
      `/rider/delivery-runs/${encodeURIComponent(runId)}/stops/${encodeURIComponent(stopId)}/extra-milk`,
      input,
      idempotencyKey ? { headers: { 'idempotency-key': idempotencyKey } } : undefined,
    );
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

  getSubscribers: async (): Promise<any[]> => {
    const response = await apiClient.get('/store/subscriptions/subscribers');
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.subscribers)) return data.subscribers;
    return [];
  },

  // The subscribers endpoint returns `{ subscribers, counts }`; expose both so
  // the hub can show server-computed totals instead of re-deriving them.
  getSubscriberSnapshot: async (): Promise<{ subscribers: any[]; counts: Record<string, number> }> => {
    const response = await apiClient.get('/store/subscriptions/subscribers');
    const data = response.data ?? {};
    const subscribers = Array.isArray(data) ? data : (Array.isArray(data.subscribers) ? data.subscribers : []);
    const counts = data.counts ?? {};
    return { subscribers, counts };
  },

  getPlans: async (): Promise<any[]> => {
    const response = await apiClient.get('/store/subscriptions/plans');
    return Array.isArray(response.data) ? response.data : [];
  },

  getCalendar: async (from?: string, to?: string): Promise<any[]> => {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    const response = await apiClient.get('/store/subscriptions/calendar', { params });
    return Array.isArray(response.data) ? response.data : [];
  },

  getGrid: async (year?: number, month?: number): Promise<any> => {
    const params: Record<string, string> = {};
    if (year != null) params.year = String(year);
    if (month != null) params.month = String(month);
    const response = await apiClient.get('/store/subscriptions/grid', { params });
    return response.data;
  },

  setDefaultRider: async (subscriptionId: string, riderProfileId: string) => {
    const response = await apiClient.post(`/subscriptions/${encodeURIComponent(subscriptionId)}/default-rider`, { riderProfileId });
    return response.data;
  },

  autoDispatchDefaultRiders: async (date?: string) => {
    const response = await apiClient.post('/subscriptions/auto-dispatch-default-riders', { date });
    return response.data;
  },

  createOfflineCustomer: async (input: {
    name: string;
    phone: string;
    line1: string;
    line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    latitude?: number;
    longitude?: number;
    storeId?: string;
  }): Promise<{ customer: { id: string }; address: { id: string } }> => {
    const response = await apiClient.post('/store/subscriptions/manual-customer', input);
    return response.data;
  },

  // The offline-customer directory is the same one the web store portal uses;
  // these lifecycle calls mirror the web's move-to-recycle-bin / restore /
  // permanent-purge actions so the app can manage offline customers identically.
  getOfflineCustomers: async (params?: { search?: string; status?: string; recycleBin?: boolean; page?: number; pageSize?: number }): Promise<{
    customers: any[];
    total: number;
    recycleBinCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> => {
    const query: Record<string, string> = {};
    if (params?.search) query.search = params.search;
    if (params?.status) query.status = params.status;
    if (params?.recycleBin) query.recycleBin = 'true';
    if (params?.page) query.page = String(params.page);
    if (params?.pageSize) query.pageSize = String(params.pageSize);
    const response = await apiClient.get('/store/subscriptions/offline-customers', { params: query });
    const data = response.data ?? {};
    return {
      customers: Array.isArray(data.customers) ? data.customers : [],
      total: Number(data.total || 0),
      recycleBinCount: Number(data.recycleBinCount || 0),
      page: Number(data.page || 1),
      pageSize: Number(data.pageSize || 25),
      totalPages: Number(data.totalPages || 0),
    };
  },

  deleteOfflineCustomer: async (customerId: string, reason?: string) => {
    const response = await apiClient.delete(`/store/subscriptions/offline-customers/${encodeURIComponent(customerId)}`, {
      data: reason ? { reason } : undefined,
    });
    return response.data;
  },

  restoreOfflineCustomer: async (customerId: string) => {
    const response = await apiClient.post(`/store/subscriptions/offline-customers/${encodeURIComponent(customerId)}/restore`);
    return response.data;
  },

  purgeOfflineCustomer: async (customerId: string) => {
    const response = await apiClient.delete(`/store/subscriptions/offline-customers/${encodeURIComponent(customerId)}/permanent`);
    return response.data;
  },

  createManualSubscription: async (input: {
    storeId: string;
    planId: string;
    customerId: string;
    addressId: string;
    startDate: string;
    totalDeliveries?: number;
    deliverySlot?: string;
    frequency?: string;
    splitItems?: { amProductName: string; amQuantity: string; pmProductName: string; pmQuantity: string };
    vacationRange?: { fromDate: string; toDate: string; policy: string };
    initialCashCollectedPaise?: number;
    storeDelivery?: boolean;
    note?: string;
  }) => {
    const response = await apiClient.post('/store/subscriptions/manual-subscribe', input);
    return response.data;
  },

  getRiderAssignments: async (date?: string): Promise<any> => {
    const response = await apiClient.get('/store/subscriptions/rider-assignments', {
      params: date ? { date } : undefined,
    });
    return response.data;
  },

  getAvailableRiders: async (): Promise<any[]> => {
    const response = await apiClient.get('/store/subscriptions/available-riders');
    return Array.isArray(response.data) ? response.data : [];
  },

  dispatchToRider: async (input: {
    deliveryIds: string[];
    riderProfileId: string;
    slot?: 'AM' | 'PM';
    saveAsDefaultRider?: boolean;
    saveAsTemporaryRange?: boolean;
    temporaryStartDate?: string;
    temporaryEndDate?: string;
  }) => {
    const response = await apiClient.post('/store/subscriptions/dispatch-to-rider', input);
    return response.data;
  },

  // --- Milk-grid operations console -------------------------------------
  // These mirror the web MilkDeliveryGrid so the store can run the day from
  // the phone: act on a single delivery, re-assign it, settle cash, print a
  // bill, or export the month. All of them target endpoints the web already
  // uses, so nothing new is needed on the API.

  quickAction: async (
    deliveryId: string,
    type:
      | 'TOGGLE_DELIVERED'
      | 'SKIP'
      | 'EXTRA_MILK'
      | 'TOGGLE_SLOT'
      | 'RECORD_PAYMENT'
      | 'VOID_PAYMENT'
      | 'ATTACH_EVENING_MILK',
    options?: {
      extraQuantity?: string;
      extraPaise?: number;
      paymentMode?: 'CASH' | 'PHONE_PE';
      amountPaise?: number;
      note?: string;
      consecutiveDays?: number;
      targetSlot?: 'AM' | 'PM';
    },
  ) => {
    const response = await apiClient.post(
      `/store/subscriptions/deliveries/${encodeURIComponent(deliveryId)}/quick-action`,
      { type, ...options },
    );
    return response.data;
  },

  getDispatchSummary: async (date?: string): Promise<any> => {
    const response = await apiClient.get('/store/subscriptions/dispatch-summary', {
      params: date ? { date } : undefined,
    });
    return response.data;
  },

  getCustomerStatement: async (subscriptionId: string): Promise<any> => {
    const response = await apiClient.get(
      `/store/subscriptions/customer/${encodeURIComponent(subscriptionId)}/statement`,
    );
    return response.data;
  },

  renewThirtyDays: async (subscriptionId: string) => {
    const response = await apiClient.post(
      `/store/subscriptions/subscribers/${encodeURIComponent(subscriptionId)}/renew`,
      { isSamePlan: true, totalDeliveries: 30 },
    );
    return response.data;
  },

  setTemporaryRider: async (
    subscriptionId: string,
    input: { riderProfileId?: string; startDate?: string; endDate?: string; applyToScheduledDeliveries?: boolean },
  ) => {
    const response = await apiClient.post(
      `/store/subscriptions/${encodeURIComponent(subscriptionId)}/temporary-rider`,
      input,
    );
    return response.data;
  },

  // The web downloads a blob; React Native has no filesystem here, so the CSV
  // is fetched as text and handed to the OS share sheet, which is the native
  // equivalent of "Export Sheets".
  exportGridCsv: async (year?: number, month?: number): Promise<string> => {
    const params: Record<string, string> = {};
    if (year != null) params.year = String(year);
    if (month != null) params.month = String(month);
    const response = await apiClient.get('/store/subscriptions/grid/export-csv', {
      params,
      responseType: 'text',
      transformResponse: [(data) => data],
    });
    return typeof response.data === 'string' ? response.data : String(response.data ?? '');
  },

  getEvidenceUrl: async (key: string): Promise<string | null> => {
    const response = await apiClient.get('/upload/evidence-url', { params: { key } });
    return response.data?.url || response.data?.signedUrl || null;
  },
};
