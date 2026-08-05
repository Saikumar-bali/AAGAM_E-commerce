import { NativeModules, Platform } from 'react-native';

export type PartnerQrScanResult = {
  value: string;
  format: 'QR_CODE';
};

type NativeScanner = {
  scan: () => Promise<PartnerQrScanResult>;
};

const nativeScanner = NativeModules.AagamPartnerQrScanner as NativeScanner | undefined;

function requireScanner(): NativeScanner {
  if (Platform.OS !== 'android' || !nativeScanner) {
    throw new Error('QR pickup scanning is unavailable in this build');
  }
  return nativeScanner;
}

export const PartnerQrScanner = {
  scan: () => requireScanner().scan(),
};
