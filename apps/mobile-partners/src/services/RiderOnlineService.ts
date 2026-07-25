import { NativeModules, Platform } from 'react-native';

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

const nativeModule = NativeModules.AagamRiderOnline as NativeOnlineModule | undefined;

export function riderOnlineSupported() {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

export const RiderOnlineService = {
  async start(riderName: string) {
    if (!riderOnlineSupported() || !nativeModule) return false;
    return nativeModule.start({ riderName });
  },

  async stop() {
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
