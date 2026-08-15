import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@aagam/mobile-shared';
import type { DeliveryJobStatus, RiderJobAction, RiderWorkspace } from '../domain/riderWorkspace';
import { normalizeRiderWorkspace } from '../domain/riderWorkspace';
import { NativeRiderTracking, nativeRiderTrackingSupported } from '../services/NativeRiderTracking';
import {
  captureRiderLocationEvidence,
  RiderLocationEvidence,
  RiderLocationOverride,
} from '../services/riderLocationEvidence';
import { apiClient } from './client';
import { riderPortalService } from './riderPortalService';

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
export type RiderProfileUpdate = {
  vehicleType?: string;
  vehicleNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
};
export type RiderAvailabilityEntry = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  isAvailable: boolean;
};
export type RiderDocumentInput = {
  type: 'DRIVING_LICENSE' | 'IDENTITY' | 'VEHICLE_REGISTRATION' | 'VEHICLE_INSURANCE' | 'OTHER';
  storageKey: string;
  documentNumberLast4?: string;
  expiresAt?: string;
};
export type RiderEvidenceFile = { uri: string; name: string; type: string; size?: number };
export type RiderSupportInput = {
  deliveryJobId?: string;
  category: 'DELIVERY' | 'PICKUP' | 'CUSTOMER' | 'STORE' | 'PAYMENT' | 'SAFETY' | 'APP' | 'OTHER';
  subject: string;
  description: string;
  evidenceKeys?: string[];
};
export type RiderTransitionEvidence = RiderLocationEvidence | RiderLocationOverride;
export type RiderHistoryFilter = {
  page?: number;
  pageSize?: number;
  status?: 'ALL' | 'DELIVERED' | 'DELIVERY_FAILED' | 'CANCELLED' | 'RETURNED_TO_STORE';
  from?: string;
  to?: string;
};

export const RIDER_WORKSPACE_QUERY_KEY = ['rider', 'delivery-workspace'] as const;
const RIDER_STATUS_CACHE_KEY = 'aagam:partners:rider-status:v1';
const RECEIPT_CACHE_PREFIX = 'aagam:partners:rider:last-receipt:v2';
const PICKUP_DRAFT_PREFIX = 'aagam:partners:rider:pickup-draft:v2';
type CachedRiderStatus = 'ONLINE' | 'OFFLINE' | 'BUSY';
const TRANSITION_PATHS: Record<RiderJobAction, string> = {
  EN_ROUTE_TO_STORE: 'en-route-to-store',
  ARRIVED_AT_STORE: 'arrived-at-store',
  OUT_FOR_DELIVERY: 'out-for-delivery',
  ARRIVED_AT_CUSTOMER: 'arrived-at-customer',
  DELIVERED: 'delivered',
};
const EVIDENCE_TRANSITIONS = new Set<RiderJobAction>(['EN_ROUTE_TO_STORE', 'ARRIVED_AT_STORE', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER']);

function currentBearerToken() {
  return useAuthStore.getState().token || '';
}
function assignmentMutationHeaders(action: 'accept' | 'reject', assignmentId: string) {
  return { headers: { 'Idempotency-Key': `mobile-assignment-${action}:${assignmentId}` } };
}
function validCachedStatus(value: unknown): value is CachedRiderStatus {
  return value === 'ONLINE' || value === 'OFFLINE' || value === 'BUSY';
}
async function cacheRiderStatus(status: unknown) {
  if (validCachedStatus(status)) await AsyncStorage.setItem(RIDER_STATUS_CACHE_KEY, status).catch(() => undefined);
}
function sanitizeProfile(input: RiderProfileUpdate): RiderProfileUpdate {
  const clean: RiderProfileUpdate = {};
  const entries = Object.entries(input) as Array<[keyof RiderProfileUpdate, string | undefined]>;
  for (const [key, value] of entries) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) clean[key] = trimmed;
  }
  if (clean.bankAccountNumber || clean.bankIfsc) {
    if (!clean.bankAccountNumber || !clean.bankIfsc) throw new Error('Bank account number and IFSC must be supplied together.');
    clean.bankIfsc = clean.bankIfsc.toUpperCase();
  }
  if (clean.vehicleNumber) clean.vehicleNumber = clean.vehicleNumber.toUpperCase();
  return clean;
}
function scopedKey(prefix: string, userId: string, subject?: string) {
  return `${prefix}:${encodeURIComponent(userId)}${subject ? `:${encodeURIComponent(subject)}` : ''}`;
}

export async function readCachedRiderStatus(): Promise<CachedRiderStatus | null> {
  const status = await AsyncStorage.getItem(RIDER_STATUS_CACHE_KEY).catch(() => null);
  return validCachedStatus(status) ? status : null;
}
export async function hydrateCachedRiderWorkspace(queryClient: { setQueryData: (key: readonly unknown[], value: any) => void }) {
  const status = await readCachedRiderStatus();
  if (status) queryClient.setQueryData(RIDER_WORKSPACE_QUERY_KEY, normalizeRiderWorkspace({ rider: { status }, pendingOffers: [], activeJobs: [], activeJob: null, assignmentHistory: [] }));
}

export const riderService = {
  getWorkspace: async (): Promise<RiderWorkspace> => {
    const workspace = await riderPortalService.getWorkspace();
    await cacheRiderStatus(workspace.rider?.status);
    return workspace;
  },
  getPortalHome: riderPortalService.getHome,
  getPortalOffers: riderPortalService.getOffers,
  getCurrentDelivery: riderPortalService.getCurrentDelivery,
  getWorkspaceSince: async (historyFrom: string): Promise<RiderWorkspace> => {
    const response = await apiClient.get('/orders/dispatch/rider/workspace', { params: { historyFrom } });
    const workspace = normalizeRiderWorkspace(response.data);
    await cacheRiderStatus(workspace.rider?.status);
    return workspace;
  },
  getHistory: async (filter: RiderHistoryFilter = {}) => (await apiClient.get('/riders/portal/history', { params: { page: 1, pageSize: 20, status: 'ALL', ...filter } })).data,
  getHistoryDetail: async (deliveryJobId: string) => (await apiClient.get(`/riders/portal/history/${encodeURIComponent(deliveryJobId)}`)).data,
  getReceipt: async (deliveryJobId: string) => (await apiClient.get(`/riders/portal/receipts/${encodeURIComponent(deliveryJobId)}`)).data,
  cacheLastCompletedJob: async (userId: string, deliveryJobId: string) => AsyncStorage.setItem(scopedKey(RECEIPT_CACHE_PREFIX, userId), deliveryJobId),
  readLastCompletedJob: async (userId: string) => AsyncStorage.getItem(scopedKey(RECEIPT_CACHE_PREFIX, userId)).catch(() => null),
  clearLastCompletedJob: async (userId: string) => AsyncStorage.removeItem(scopedKey(RECEIPT_CACHE_PREFIX, userId)),
  savePickupDraft: async (userId: string, jobId: string, draft: unknown) => AsyncStorage.setItem(scopedKey(PICKUP_DRAFT_PREFIX, userId, jobId), JSON.stringify(draft)),
  readPickupDraft: async (userId: string, jobId: string) => {
    const raw = await AsyncStorage.getItem(scopedKey(PICKUP_DRAFT_PREFIX, userId, jobId)).catch(() => null);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  clearPickupDraft: async (userId: string, jobId: string) => AsyncStorage.removeItem(scopedKey(PICKUP_DRAFT_PREFIX, userId, jobId)),
  getOfferDetail: async (assignmentId: string) => (await apiClient.get(`/riders/portal/offers/${encodeURIComponent(assignmentId)}`)).data,
  acceptOffer: async (assignmentId: string) => (await apiClient.patch(`/orders/dispatch/assignments/${encodeURIComponent(assignmentId)}/accept`, {}, assignmentMutationHeaders('accept', assignmentId))).data,
  rejectOffer: async (assignmentId: string, reason?: string) => (await apiClient.patch(`/orders/dispatch/assignments/${encodeURIComponent(assignmentId)}/reject`, reason ? { reason } : {}, assignmentMutationHeaders('reject', assignmentId))).data,
  transitionJob: async (deliveryJobId: string, action: RiderJobAction, proof?: { proofType?: string; code?: string; note?: string; latitude?: number; longitude?: number; locationEvidence?: RiderTransitionEvidence }) => {
    const path = TRANSITION_PATHS[action];
    let body: Record<string, unknown> = {};
    if (action === 'DELIVERED') body = proof || { proofType: 'RIDER_CONFIRMATION' };
    else if (EVIDENCE_TRANSITIONS.has(action)) body = proof?.locationEvidence || await captureRiderLocationEvidence();
    return (await apiClient.patch(`/orders/dispatch/jobs/${encodeURIComponent(deliveryJobId)}/${path}`, body)).data;
  },
  startTracking: async (orderId: string, deliveryJobId?: string, deliveryStatus?: DeliveryJobStatus) => {
    const response = await apiClient.post(`/tracking/start/${encodeURIComponent(orderId)}`);
    let nativeTracking = false;
    if (nativeRiderTrackingSupported() && deliveryJobId && deliveryStatus && apiClient.defaults.baseURL && currentBearerToken()) {
      await NativeRiderTracking.start({ apiUrl: String(apiClient.defaults.baseURL), authToken: currentBearerToken(), orderId, deliveryJobId, deliveryStatus });
      nativeTracking = true;
    }
    return { ...response.data, nativeTracking };
  },
  stopTracking: async (orderId: string, reason = 'WORKSPACE_INACTIVE') => {
    await NativeRiderTracking.stop(reason).catch(() => false);
    return (await apiClient.post(`/tracking/stop/${encodeURIComponent(orderId)}`, { reason })).data;
  },
  getNativeTrackingStatus: () => NativeRiderTracking.status(),
  sendLocationPing: async (orderId: string, location: RiderLocationPayload) => (await apiClient.post('/tracking/rider-location', { orderId, ...location, source: 'MOBILE_PARTNERS' })).data,
  updateMyStatus: async (status: CachedRiderStatus) => {
    const response = await apiClient.patch('/riders/portal/availability/status', { status });
    await cacheRiderStatus(response.data?.status || status);
    return response.data;
  },
  getProfile: async () => (await apiClient.get('/riders/portal/profile')).data,
  updateProfile: async (input: RiderProfileUpdate) => {
    const sanitized = sanitizeProfile(input);
    if (Object.keys(sanitized).length === 0) throw new Error('Enter at least one profile change.');
    return (await apiClient.patch('/riders/portal/profile', sanitized)).data;
  },
  uploadEvidence: async (file: RiderEvidenceFile): Promise<{ storageKey: string }> => {
    if (file.size && file.size > 10 * 1024 * 1024) throw new Error('Document exceeds the 10 MB limit.');
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) throw new Error('Choose a JPG, PNG, WebP, or PDF document.');
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
    const response = await apiClient.post('/upload/evidence', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 90_000 });
    if (!response.data?.storageKey) throw new Error('Evidence upload did not return a storage key.');
    return response.data;
  },
  submitDocument: async (input: RiderDocumentInput) => (await apiClient.post('/riders/portal/documents', input)).data,
  uploadAndSubmitDocument: async (file: RiderEvidenceFile, metadata: Omit<RiderDocumentInput, 'storageKey'>) => {
    const uploaded = await riderService.uploadEvidence(file);
    return riderService.submitDocument({ ...metadata, storageKey: uploaded.storageKey });
  },
  getDocumentPreview: async (documentId: string) => (await apiClient.get(`/riders/portal/documents/${encodeURIComponent(documentId)}/preview`)).data,
  getAvailability: async () => (await apiClient.get('/riders/portal/availability')).data,
  updateAvailabilitySchedule: async (entries: RiderAvailabilityEntry[]) => (await apiClient.patch('/riders/portal/availability/schedule', { entries })).data,
  startBreak: async (reason?: string) => (await apiClient.post('/riders/portal/availability/break/start', reason ? { reason } : {})).data,
  endBreak: async () => (await apiClient.post('/riders/portal/availability/break/end')).data,
  createSupportTicket: async (input: RiderSupportInput) => (await apiClient.post('/riders/portal/support', input)).data,
  getSupportTickets: async () => (await apiClient.get('/riders/portal/support')).data,
  getSupportTicket: async (ticketId: string) => (await apiClient.get(`/riders/portal/support/${encodeURIComponent(ticketId)}`)).data,
  replySupportTicket: async (ticketId: string, body: string, keys?: string[]) => (await apiClient.post(`/riders/portal/support/${encodeURIComponent(ticketId)}/messages`, { body, evidenceKeys: keys })).data,
  getCodLedger: async () => (await apiClient.get('/riders/portal/cod')).data,
  getPerformance: async () => (await apiClient.get('/riders/portal/performance')).data,
  getEarnings: async (filter: RiderHistoryFilter = {}) => (await apiClient.get('/riders/portal/earnings', { params: { page: 1, pageSize: 50, ...filter } })).data,
  requestContact: async (deliveryJobId: string, targetRole: 'CUSTOMER' | 'STORE', channel: 'CALL' | 'MESSAGE' | 'SAFETY_ESCALATION') => (await apiClient.post(`/riders/portal/contact/${encodeURIComponent(deliveryJobId)}`, { targetRole, channel })).data,
};
