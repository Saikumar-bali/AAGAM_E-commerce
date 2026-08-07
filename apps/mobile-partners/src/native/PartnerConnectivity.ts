import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
type NativeConnectivity = { getCurrent: () => Promise<boolean>; addListener: (name: string) => void; removeListeners: (count: number) => void };
const native = NativeModules.AagamPartnerConnectivity as NativeConnectivity | undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.AagamPartnerConnectivity) : null;
export const PartnerConnectivity = {
  getCurrent: async () => Platform.OS === 'android' && native ? native.getCurrent() : true,
  subscribe: (listener: (connected: boolean) => void) => {
    if (!emitter) return () => undefined;
    const sub = emitter.addListener('AagamConnectivityChanged', (event: { connected?: boolean }) => listener(Boolean(event.connected)));
    return () => sub.remove();
  },
};
