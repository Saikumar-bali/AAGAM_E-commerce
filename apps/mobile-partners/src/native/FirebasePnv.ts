import { NativeModules, Platform } from 'react-native';

type Support = { supported: boolean; simCount?: number; reason?: string };
type Verification = { token: string };

const native = NativeModules.AagamFirebasePnv as
  | {
      isPnvSupported(): Promise<Support>;
      startPnvVerification(nonce: string): Promise<Verification>;
      enablePnvTestSession(testNumberId: string): Promise<boolean>;
    }
  | undefined;

export const FirebasePnv = {
  async isPnvSupported(): Promise<Support> {
    if (Platform.OS !== 'android' || !native) {
      return { supported: false, reason: 'PNV_NATIVE_MODULE_UNAVAILABLE' };
    }
    return native.isPnvSupported();
  },

  async startPnvVerification(nonce: string): Promise<Verification> {
    if (Platform.OS !== 'android' || !native) {
      throw Object.assign(new Error('Firebase PNV is available only on supported Android devices'), {
        code: 'PNV_UNSUPPORTED',
      });
    }
    return native.startPnvVerification(nonce);
  },

  async enablePnvTestSession(testNumberId: string): Promise<boolean> {
    if (!__DEV__) throw new Error('PNV test sessions are disabled in release builds');
    if (!native) throw new Error('Firebase PNV native module is unavailable');
    return native.enablePnvTestSession(testNumberId);
  },
};
