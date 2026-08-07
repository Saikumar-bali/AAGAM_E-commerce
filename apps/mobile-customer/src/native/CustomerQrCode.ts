import { NativeModules, Platform } from 'react-native';

type NativeQr = { render: (value: string, size: number) => Promise<{ dataUrl: string; size: number }> };
const nativeQr = NativeModules.AagamCustomerQrCode as NativeQr | undefined;

export const CustomerQrCode = {
  render: async (value: string, size = 720) => {
    if (Platform.OS !== 'android' || !nativeQr) throw new Error('Trusted Drop QR rendering is unavailable in this build');
    return nativeQr.render(value, size);
  },
};
