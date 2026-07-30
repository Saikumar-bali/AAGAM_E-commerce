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

async function sendAvailabilityHeartbeat() {
  if (heartbeatInFlight) return;
  heartbeatInFlight = true;
  try {
    const location = await currentPosition();
    await apiClient.patch('/riders/me/status', {
      status: 'ONLINE',
      ...location,
    });
  } catch {
    // Best effort. Workspace polling and FCM still deliver offers, while the
    // backend excludes a Rider after the configured location freshness window.
  } finally {
    heartbeatInFlight = false;
  }
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  void sendAvailabilityHeartbeat();
  heartbeatTimer = setInterval(() => {
    void sendAvailabilityHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
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
