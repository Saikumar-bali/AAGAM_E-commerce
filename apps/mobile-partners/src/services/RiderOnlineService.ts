import Geolocation from 'react-native-geolocation-service';
import { NativeModules, Platform } from 'react-native';
import { apiClient, useAuthStore } from '@aagam/mobile-shared';

type NativeOnlineModule = {
  start: (options: {
    riderName: string;
    apiUrl: string;
    authToken: string;
  }) => Promise<boolean>;
  stop: () => Promise<boolean>;
  getStatus: () => Promise<{
    supported: boolean;
    active: boolean;
    riderName?: string | null;
    lastSentAt?: string | null;
    lastError?: string | null;
    batteryOptimisationExempt?: boolean;
  }>;
};

const nativeModule = NativeModules.AagamRiderOnline as NativeOnlineModule | undefined;
const HEARTBEAT_INTERVAL_MS = 60_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatGeneration = 0;
let heartbeatController: AbortController | null = null;
let heartbeatInFlight = false;

export function riderOnlineSupported() {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

function currentPosition() {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

async function sendAvailabilityHeartbeat(generation: number) {
  if (heartbeatInFlight || generation !== heartbeatGeneration) return;
  heartbeatInFlight = true;
  try {
    const location = await currentPosition();
    if (generation !== heartbeatGeneration) return;
    const controller = new AbortController();
    heartbeatController = controller;
    await apiClient.post('/riders/me/heartbeat', location, { signal: controller.signal });
  } catch {
    // Non-Android fallback is best effort. Android owns this in the native FGS.
  } finally {
    if (generation === heartbeatGeneration) heartbeatController = null;
    heartbeatInFlight = false;
  }
}

function startHeartbeatFallback() {
  if (heartbeatTimer) return;
  const generation = ++heartbeatGeneration;
  void sendAvailabilityHeartbeat(generation);
  heartbeatTimer = setInterval(() => {
    void sendAvailabilityHeartbeat(generation);
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatFallback() {
  heartbeatGeneration += 1;
  heartbeatController?.abort();
  heartbeatController = null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  heartbeatInFlight = false;
}

export const RiderOnlineService = {
  async start(riderName: string) {
    if (riderOnlineSupported() && nativeModule) {
      stopHeartbeatFallback();
      const authToken = useAuthStore.getState().token;
      const apiUrl = String(apiClient.defaults.baseURL || '').replace(/\/+$/, '');
      if (!authToken || !apiUrl) {
        throw new Error('Rider availability requires an authenticated mobile session');
      }
      return nativeModule.start({ riderName, apiUrl, authToken });
    }
    startHeartbeatFallback();
    return false;
  },

  async stop() {
    stopHeartbeatFallback();
    if (!riderOnlineSupported() || !nativeModule) return false;
    return nativeModule.stop();
  },

  async status() {
    if (!riderOnlineSupported() || !nativeModule) {
      return { supported: false, active: Boolean(heartbeatTimer) };
    }
    return nativeModule.getStatus();
  },
};
