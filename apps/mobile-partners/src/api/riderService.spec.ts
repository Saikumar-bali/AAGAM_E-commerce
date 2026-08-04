jest.mock('./client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    defaults: { headers: { common: {} }, baseURL: '' },
  },
}));

jest.mock('../services/NativeRiderTracking', () => ({
  NativeRiderTracking: {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({ supported: false }),
  },
  nativeRiderTrackingSupported: jest.fn().mockReturnValue(false),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './client';
import {
  hydrateCachedRiderWorkspace,
  readCachedRiderStatus,
  RIDER_WORKSPACE_QUERY_KEY,
  riderService,
} from './riderService';

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;
const patch = apiClient.patch as jest.Mock;
const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const locationEvidence = {
  latitude: 17.7301,
  longitude: 83.3101,
  accuracyMetres: 18,
  capturedAt: '2026-08-04T01:00:00.000Z',
  source: 'MOBILE_PARTNERS_GPS' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  storage.setItem.mockResolvedValue(undefined);
  storage.getItem.mockResolvedValue(null);
});

function mockPortalWorkspace(input?: {
  home?: Record<string, unknown>;
  offers?: unknown[];
  delivery?: unknown;
  history?: unknown[];
}) {
  const values = input || {};
  get.mockImplementation((url: string) => {
    if (url === '/riders/portal/home') {
      return Promise.resolve({
        data: {
          rider: null,
          pendingOffers: 0,
          activeJob: null,
          completedToday: 0,
          unreadCount: 0,
          alerts: [],
          ...(values.home || {}),
        },
      });
    }
    if (url === '/riders/portal/offers') {
      return Promise.resolve({ data: values.offers || [] });
    }
    if (url === '/riders/portal/delivery') {
      return Promise.resolve({ data: values.delivery ?? null });
    }
    if (url === '/riders/portal/history') {
      return Promise.resolve({ data: values.history || [] });
    }
    throw new Error(`Unexpected GET ${url}`);
  });
}

describe('riderService.getWorkspace', () => {
  it('uses Rider Portal contracts, normalizes the workspace and caches status', async () => {
    mockPortalWorkspace({ home: { rider: { id: 'r1', status: 'ONLINE' } } });
    const workspace = await riderService.getWorkspace();
    expect(get).toHaveBeenCalledWith('/riders/portal/home');
    expect(get).toHaveBeenCalledWith('/riders/portal/offers');
    expect(get).toHaveBeenCalledWith('/riders/portal/delivery');
    expect(get).not.toHaveBeenCalledWith('/riders/portal/history');
    expect(get).toHaveBeenCalledTimes(3);
    expect(workspace.rider).toEqual({ id: 'r1', status: 'ONLINE' });
    expect(workspace.pendingOffers).toEqual([]);
    expect(workspace.activeJob).toBeNull();
    expect(storage.setItem).toHaveBeenCalledWith('aagam:partners:rider-status:v1', 'ONLINE');
  });

  it('normalizes missing Portal arrays to empty', async () => {
    mockPortalWorkspace();
    const workspace = await riderService.getWorkspace();
    expect(workspace.pendingOffers).toEqual([]);
    expect(workspace.assignmentHistory).toEqual([]);
  });

  it('falls back to the legacy workspace only when Portal routes are unsupported', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/riders/portal/home') {
        return Promise.reject({ response: { status: 404 } });
      }
      if (url === '/orders/dispatch/rider/workspace') {
        return Promise.resolve({ data: { rider: { id: 'r2', status: 'BUSY' } } });
      }
      return Promise.resolve({ data: [] });
    });
    const workspace = await riderService.getWorkspace();
    expect(get).toHaveBeenCalledWith('/orders/dispatch/rider/workspace');
    expect(workspace.rider).toEqual({ id: 'r2', status: 'BUSY' });
    expect(storage.setItem).toHaveBeenCalledWith('aagam:partners:rider-status:v1', 'BUSY');
  });
});

describe('rider cache hydration', () => {
  it('hydrates React Query before the dashboard mounts', async () => {
    storage.getItem.mockResolvedValueOnce('BUSY');
    const setQueryData = jest.fn();
    await hydrateCachedRiderWorkspace({ setQueryData });
    expect(setQueryData).toHaveBeenCalledWith(
      RIDER_WORKSPACE_QUERY_KEY,
      expect.objectContaining({ rider: expect.objectContaining({ status: 'BUSY' }) }),
    );
  });

  it('ignores malformed cached states', async () => {
    storage.getItem.mockResolvedValueOnce('NOT_A_STATUS');
    await expect(readCachedRiderStatus()).resolves.toBeNull();
  });
});

describe('riderService.acceptOffer', () => {
  it('calls PATCH accept endpoint with a deterministic idempotency key', async () => {
    patch.mockResolvedValueOnce({ data: { ok: true } });
    const result = await riderService.acceptOffer('assignment-42');
    expect(patch).toHaveBeenCalledWith(
      '/orders/dispatch/assignments/assignment-42/accept',
      {},
      { headers: { 'Idempotency-Key': 'mobile-assignment-accept:assignment-42' } },
    );
    expect(result).toEqual({ ok: true });
  });

  it('encodes special characters in the path while retaining a stable idempotency key', async () => {
    patch.mockResolvedValueOnce({ data: { ok: true } });
    await riderService.acceptOffer('a/b=c');
    expect(patch).toHaveBeenCalledWith(
      '/orders/dispatch/assignments/a%2Fb%3Dc/accept',
      {},
      { headers: { 'Idempotency-Key': 'mobile-assignment-accept:a/b=c' } },
    );
  });
});

describe('riderService.rejectOffer', () => {
  it('calls PATCH reject endpoint without a reason and with an idempotency key', async () => {
    patch.mockResolvedValueOnce({ data: { ok: true } });
    await riderService.rejectOffer('assignment-99');
    expect(patch).toHaveBeenCalledWith(
      '/orders/dispatch/assignments/assignment-99/reject',
      {},
      { headers: { 'Idempotency-Key': 'mobile-assignment-reject:assignment-99' } },
    );
  });

  it('includes the reason and deterministic idempotency key when provided', async () => {
    patch.mockResolvedValueOnce({ data: { ok: true } });
    await riderService.rejectOffer('assignment-99', 'too far');
    expect(patch).toHaveBeenCalledWith(
      '/orders/dispatch/assignments/assignment-99/reject',
      { reason: 'too far' },
      { headers: { 'Idempotency-Key': 'mobile-assignment-reject:assignment-99' } },
    );
  });
});

describe('riderService.transitionJob', () => {
  it('maps EN_ROUTE_TO_STORE and sends fresh location evidence', async () => {
    patch.mockResolvedValueOnce({ data: { status: 'RIDER_EN_ROUTE_TO_STORE' } });
    const result = await riderService.transitionJob('job-1', 'EN_ROUTE_TO_STORE', {
      locationEvidence,
    });
    expect(patch).toHaveBeenCalledWith(
      '/orders/dispatch/jobs/job-1/en-route-to-store',
      locationEvidence,
    );
    expect(result).toEqual({ status: 'RIDER_EN_ROUTE_TO_STORE' });
  });

  it('maps ARRIVED_AT_CUSTOMER and sends geofence evidence', async () => {
    patch.mockResolvedValueOnce({ data: { status: 'RIDER_AT_CUSTOMER' } });
    await riderService.transitionJob('job-2', 'ARRIVED_AT_CUSTOMER', {
      locationEvidence,
    });
    expect(patch).toHaveBeenCalledWith(
      '/orders/dispatch/jobs/job-2/arrived-at-customer',
      locationEvidence,
    );
  });

  it('sends proof payload for DELIVERED action', async () => {
    patch.mockResolvedValueOnce({ data: { status: 'DELIVERED' } });
    const proof = { proofType: 'OTP', code: '123456' };
    await riderService.transitionJob('job-3', 'DELIVERED', proof);
    expect(patch).toHaveBeenCalledWith('/orders/dispatch/jobs/job-3/delivered', proof);
  });

  it('sends default proof when DELIVERED has no proof arg', async () => {
    patch.mockResolvedValueOnce({ data: {} });
    await riderService.transitionJob('job-4', 'DELIVERED');
    expect(patch).toHaveBeenCalledWith('/orders/dispatch/jobs/job-4/delivered', { proofType: 'RIDER_CONFIRMATION' });
  });
});

describe('riderService.updateMyStatus', () => {
  it('updates and persists the confirmed status', async () => {
    patch.mockResolvedValueOnce({ data: { status: 'ONLINE' } });
    const result = await riderService.updateMyStatus('ONLINE');
    expect(patch).toHaveBeenCalledWith('/riders/portal/availability/status', { status: 'ONLINE' });
    expect(storage.setItem).toHaveBeenCalledWith('aagam:partners:rider-status:v1', 'ONLINE');
    expect(result).toEqual({ status: 'ONLINE' });
  });

  it('includes location when provided', async () => {
    patch.mockResolvedValueOnce({ data: { status: 'BUSY' } });
    await riderService.updateMyStatus('BUSY', { latitude: 17.5, longitude: 78.4 });
    expect(patch).toHaveBeenCalledWith('/riders/portal/availability/status', { status: 'BUSY', latitude: 17.5, longitude: 78.4 });
  });
});

describe('riderService.sendLocationPing', () => {
  it('POSTs location with the order id and source tag', async () => {
    post.mockResolvedValueOnce({ data: { sent: true } });
    const result = await riderService.sendLocationPing('order-10', {
      latitude: 17.7,
      longitude: 83.3,
      clientPingId: 'ping-1',
      sequence: 1,
      capturedAt: '2026-01-01T00:00:00Z',
    });
    expect(post).toHaveBeenCalledWith('/tracking/rider-location', {
      orderId: 'order-10',
      latitude: 17.7,
      longitude: 83.3,
      clientPingId: 'ping-1',
      sequence: 1,
      capturedAt: '2026-01-01T00:00:00Z',
      source: 'MOBILE_PARTNERS',
    });
    expect(result).toEqual({ sent: true });
  });
});

describe('riderService.getProfile', () => {
  it('fetches the authenticated rider self-service profile', async () => {
    get.mockResolvedValueOnce({ data: { id: 'u1', name: 'Test' } });
    const result = await riderService.getProfile();
    expect(get).toHaveBeenCalledWith('/riders/portal/profile');
    expect(result).toEqual({ id: 'u1', name: 'Test' });
  });
});
