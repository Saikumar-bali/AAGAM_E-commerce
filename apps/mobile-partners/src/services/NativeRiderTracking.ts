import { NativeModules, Platform } from 'react-native';
import { DeliveryJobStatus, trackingIntervalForStatus } from '../domain/riderWorkspace';

export type NativeTrackingStatus = {
  supported: boolean;
  active: boolean;
  orderId?: string | null;
  deliveryJobId?: string | null;
  deliveryStatus?: DeliveryJobStatus | null;
  lastSentAt?: string | null;
  lastAccuracy?: number | null;
  queuedCount: number;
  error?: string | null;
  stopReason?: string | null;
  sequence?: number;
  androidApiLevel?: number;
};

type NativeModuleShape = {
  start: (options: {
    apiUrl: string;
    authToken: string;
    orderId: string;
    deliveryJobId: string;
    deliveryStatus: DeliveryJobStatus;
    intervalMs: number;
  }) => Promise<boolean>;
  stop: (reason?: string) => Promise<boolean>;
  getStatus: () => Promise<NativeTrackingStatus>;
};

const nativeModule = NativeModules.AagamRiderTracking as NativeModuleShape | undefined;

export function nativeRiderTrackingSupported() {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

export const NativeRiderTracking = {
  async start(input: {
    apiUrl: string;
    authToken: string;
    orderId: string;
    deliveryJobId: string;
    deliveryStatus: DeliveryJobStatus;
  }) {
    if (!nativeRiderTrackingSupported() || !nativeModule) return false;
    return nativeModule.start({
      ...input,
      intervalMs: trackingIntervalForStatus(input.deliveryStatus),
    });
  },

  async stop(reason = 'CLIENT_STOPPED') {
    if (!nativeRiderTrackingSupported() || !nativeModule) return false;
    return nativeModule.stop(reason);
  },

  async status(): Promise<NativeTrackingStatus> {
    if (!nativeRiderTrackingSupported() || !nativeModule) {
      return {
        supported: false,
        active: false,
        queuedCount: 0,
        error: null,
      };
    }
    return nativeModule.getStatus();
  },
};
