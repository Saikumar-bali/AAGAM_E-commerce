import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeliveryJobStatus, RiderJobAction, RiderWorkspace } from '../domain/riderWorkspace';
import { normalizeRiderWorkspace } from '../domain/riderWorkspace';
import { NativeRiderTracking, nativeRiderTrackingSupported } from '../services/NativeRiderTracking';
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
export type RiderSupportInput = {
  deliveryJobId?: string;
  category: 'DELIVERY' | 'PICKUP' | 'CUSTOMER' | 'STORE' | 'PAYMENT' | 'SAFETY' | 'APP' | 'OTHER';
  subject: string;
  description: string;
  evidenceKeys?: string[];
};

export const RIDER_WORKSPACE_QUERY_KEY = ['rider', 'delivery-workspace'] as const;
const RIDER_STATUS_CACHE_KEY = 'aagam:partners:rider-status:v1';
type CachedRiderStatus = 'ONLINE' | 'OFFLINE' | 'BUSY';
const TRANSITION_PATHS: Record<RiderJobAction, string> = {
  EN_ROUTE_TO_STORE: 'en-route-to-store',
  ARRIVED_AT_STORE: 'arrived-at-store',
  OUT_FOR_DELIVERY: 'out-for-delivery',
  ARRIVED_AT_CUSTOMER: 'arrived-at-customer',
  DELIVERED: 'delivered',
};
function currentBearerToken() {
  const value = apiClient.defaults.headers.common.Authorization;
  return typeof value === 'string' ? value.replace(/^Bearer\s+/i, '') : '';
}
function assignmentMutationHeaders(action: 'accept' | 'reject', assignmentId: string) {
  return { headers: { 'Idempotency-Key': `mobile-assignment-${action}:${assignmentId}` } };
}
function validCachedStatus(value: unknown): value is CachedRiderStatus { return value === 'ONLINE' || value === 'OFFLINE' || value === 'BUSY'; }
async function cacheRiderStatus(status: unknown) { if (validCachedStatus(status)) await AsyncStorage.setItem(RIDER_STATUS_CACHE_KEY, status).catch(() => undefined); }
export async function readCachedRiderStatus(): Promise<CachedRiderStatus | null> { const status = await AsyncStorage.getItem(RIDER_STATUS_CACHE_KEY).catch(() => null); return validCachedStatus(status) ? status : null; }
export async function hydrateCachedRiderWorkspace(queryClient: { setQueryData: (key: readonly unknown[], value: any) => void }) { const status = await readCachedRiderStatus(); if (status) queryClient.setQueryData(RIDER_WORKSPACE_QUERY_KEY, normalizeRiderWorkspace({ rider: { status }, pendingOffers: [], activeJob: null, assignmentHistory: [] })); }

export const riderService = {
  getWorkspace: async (): Promise<RiderWorkspace> => { const response = await apiClient.get('/orders/dispatch/rider/workspace'); const workspace = normalizeRiderWorkspace(response.data); await cacheRiderStatus(workspace.rider?.status); return workspace; },
  getWorkspaceSince: async (historyFrom: string): Promise<RiderWorkspace> => { const response = await apiClient.get('/orders/dispatch/rider/workspace', { params: { historyFrom } }); const workspace = normalizeRiderWorkspace(response.data); await cacheRiderStatus(workspace.rider?.status); return workspace; },
  acceptOffer: async (assignmentId: string) => (await apiClient.patch(`/orders/dispatch/assignments/${encodeURIComponent(assignmentId)}/accept`, {}, assignmentMutationHeaders('accept', assignmentId))).data,
  rejectOffer: async (assignmentId: string, reason?: string) => (await apiClient.patch(`/orders/dispatch/assignments/${encodeURIComponent(assignmentId)}/reject`, reason ? { reason } : {}, assignmentMutationHeaders('reject', assignmentId))).data,
  transitionJob: async (deliveryJobId: string, action: RiderJobAction, proof?: { proofType?: string; code?: string; note?: string; latitude?: number; longitude?: number }) => {
    const path = TRANSITION_PATHS[action];
    return (await apiClient.patch(`/orders/dispatch/jobs/${encodeURIComponent(deliveryJobId)}/${path}`, action === 'DELIVERED' ? (proof || { proofType: 'RIDER_CONFIRMATION' }) : {})).data;
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
  stopTracking: async (orderId: string, reason = 'WORKSPACE_INACTIVE') => { await NativeRiderTracking.stop(reason).catch(() => false); return (await apiClient.post(`/tracking/stop/${encodeURIComponent(orderId)}`, { reason })).data; },
  getNativeTrackingStatus: () => NativeRiderTracking.status(),
  sendLocationPing: async (orderId: string, location: RiderLocationPayload) => (await apiClient.post('/tracking/rider-location', { orderId, ...location, source: 'MOBILE_PARTNERS' })).data,
  updateMyStatus: async (status: CachedRiderStatus, location?: { latitude: number; longitude: number }) => { const response = await apiClient.patch('/riders/me/status', { status, ...(location || {}) }); await cacheRiderStatus(response.data?.status || status); return response.data; },
  getProfile: async () => (await apiClient.get('/riders/portal/profile')).data,
  updateProfile: async (input: RiderProfileUpdate) => (await apiClient.patch('/riders/portal/profile', input)).data,
  submitDocument: async (input: RiderDocumentInput) => (await apiClient.post('/riders/portal/documents', input)).data,
  getAvailability: async () => (await apiClient.get('/riders/portal/availability')).data,
  updateAvailabilitySchedule: async (entries: RiderAvailabilityEntry[]) => (await apiClient.patch('/riders/portal/availability/schedule', { entries })).data,
  startBreak: async (reason?: string) => (await apiClient.post('/riders/portal/availability/break/start', reason ? { reason } : {})).data,
  endBreak: async () => (await apiClient.post('/riders/portal/availability/break/end')).data,
  createSupportTicket: async (input: RiderSupportInput) => (await apiClient.post('/riders/portal/support', input)).data,
  getSupportTickets: async () => (await apiClient.get('/riders/portal/support')).data,
  getCodLedger: async () => (await apiClient.get('/riders/portal/cod')).data,
  getPerformance: async () => (await apiClient.get('/riders/portal/performance')).data,
  getEarnings: async () => (await apiClient.get('/riders/portal/earnings')).data,
};