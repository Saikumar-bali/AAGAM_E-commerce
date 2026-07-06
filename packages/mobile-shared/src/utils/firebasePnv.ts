import { NativeModules, Platform } from 'react-native';

type FirebasePnvResult = {
  phoneNumber?: string;
  token: string;
};

type FirebasePnvNativeModule = {
  getVerifiedPhoneNumber: () => Promise<FirebasePnvResult>;
  getVerificationSupportInfo?: () => Promise<{ supported: boolean }>;
  enableTestSession?: (token: string) => Promise<{ ok: boolean }>;
};

function getModule(): FirebasePnvNativeModule {
  const module = NativeModules.FirebasePnv as FirebasePnvNativeModule | undefined;
  if (!module || Platform.OS !== 'android') {
    throw new Error('Firebase phone verification is available only in the Android customer app.');
  }
  return module;
}

export async function getFirebasePnvSupport() {
  const module = getModule();
  if (!module.getVerificationSupportInfo) return { supported: true };
  return module.getVerificationSupportInfo();
}

export async function enableFirebasePnvTestSession(token: string) {
  const module = getModule();
  if (!module.enableTestSession) throw new Error('Firebase PNV test sessions are not supported in this build.');
  return module.enableTestSession(token);
}

export async function getFirebasePnvToken() {
  const module = getModule();
  return module.getVerifiedPhoneNumber();
}
