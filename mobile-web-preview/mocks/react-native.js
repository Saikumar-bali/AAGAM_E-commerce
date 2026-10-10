/* Web mock for `react-native`.
 *
 * Re-exports react-native-web and fills the few gaps the app relies on that the
 * web build does not ship (PermissionsAndroid, a NativeModules bag, __DEV__).
 * Putting __DEV__ on the module keeps it a free variable inside app bundles.
 */
import * as RNW from 'react-native-web';

const PermissionsAndroid = {
  PERMISSIONS: {
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
    POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
  },
  RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
  request: async () => 'granted',
  requestMultiple: async () => ({}),
  check: async () => true,
};

const NativeModules = {};

const NativeEventEmitter = class {
  addListener() {
    return { remove() {} };
  }
  removeAllListeners() {}
  removeSubscription() {}
};

const base = RNW;

const merged = {
  ...base,
  PermissionsAndroid,
  NativeModules,
  NativeEventEmitter,
  __DEV__: true,
};

export * from 'react-native-web';
export { PermissionsAndroid, NativeModules, NativeEventEmitter };
export default merged;
