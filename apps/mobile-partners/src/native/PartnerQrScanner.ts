import { NativeModules, Platform } from 'react-native';

type ScanResult = { rawValue: string; format?: string };
type NativeScanner = { scan: () => Promise<ScanResult> };
const scanner = NativeModules.AagamPartnerQrScanner as NativeScanner | undefined;

export const PartnerQrScanner = {
  scan: async (): Promise<ScanResult> => {
    if (Platform.OS !== 'android' || !scanner) {
      throw new Error('QR scanning is unavailable in this build. Use the manual pickup PIN.');
    }
    return scanner.scan();
  },
};
