import Geolocation from 'react-native-geolocation-service';
import { NativeModules, Platform } from 'react-native';
import { apiClient } from '../api/client';

type NativeOnlineModule = {
  start: (options: { riderName: string }) => Promise<boolean>;
  stop: () => Promise<boolean>;
  getStatus: () => Promise<{
    supported: boolean;
    active: boolean;
    riderName?: string | null;
    batteryOptimisationExempt?: boolean;
  }>;
};

const nativeModule = NativeModules.AagamRiderOnline as
  | NativeOnlineModule
  | undefined;

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
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      reject,
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 30_000,
      },
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
    await apiClient.patch(
      '/riders/me/status',
      { status: 'ONLINE', heartbeat: true, ...location },
      { signal: controller.signal },
    );
  } catch {
    // Best effort. The backend rejects a stale heartbeat after an explicit
    // OFFLINE transition and excludes stale coordinates from dispatch.
  } finally {
    if (generation === heartbeatGeneration) heartbeatController = null;
    heartbeatInFlight = false;
  }
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  const generation = ++heartbeatGeneration;
  void sendAvailabilityHeartbeat(generation);
  heartbeatTimer = setInterval(() => {
    void sendAvailabilityHeartbeat(generation);
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  heartbeatGeneration += 1;
  heartbeatController?.abort();
  heartbeatController = null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  heartbeatInFlight = false;
}

export const RiderOnlineService = {
  async start(riderName: string) {
    startHeartbeat();
    if (!riderOnlineSupported() || !nativeModule) return false;
    try {
      return await nativeModule.start({ riderName });
    } catch (error) {
      stopHeartbeat();
      throw error;
    }
  },

  async stop() {
    stopHeartbeat();
    if (!riderOnlineSupported() || !nativeModule) return false;
    return nativeModule.stop();
  },

  async status() {
    if (!riderOnlineSupported() || !nativeModule) {
      return { supported: false, active: false };
    }
    return nativeModule.getStatus();
  },
};
