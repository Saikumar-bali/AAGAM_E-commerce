/* Web mock for react-native-keychain backed by localStorage. */
const PREFIX = 'aagam.keychain.';

const Keychain = {
  ACCESSIBLE: {
    WHEN_UNLOCKED: 'AccessibleWhenUnlocked',
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
    AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock',
    ALWAYS: 'AccessibleAlways',
  },
  ACCESS_CONTROL: {
    BIOMETRY_ANY: 'BiometryAny',
    BIOMETRY_CURRENT_SET: 'BiometryCurrentSet',
    DEVICE_PASSCODE: 'DevicePasscode',
    APPLICATION_PASSWORD: 'ApplicationPassword',
    USER_PRESENCE: 'UserPresence',
  },
  AUTHENTICATION_TYPE: { BIOMETRICS: 'Biometrics', PASSCODE: 'Passcode' },
  SECURITY_LEVEL: { SECURE_SOFTWARE: 'SECURE_SOFTWARE', SECURE_HARDWARE: 'SECURE_HARDWARE' },
  STORAGE_TYPE: { AES_GCM: 'AES_GCM', KC: 'KC' },
  // Both members are opaque strings: the native session is already encoded by
  // the caller before it reaches us. Development-only browser shim.
  setGenericPassword: async (username, value, options = {}) => {
    const service = options.service || 'default';
    localStorage.setItem(PREFIX + service, JSON.stringify({ username, value }));
    return { service, storage: 'localStorage' };
  },
  getGenericPassword: async (options = {}) => {
    const service = options.service || 'default';
    const raw = localStorage.getItem(PREFIX + service);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return { username: parsed.username, password: parsed.value };
    } catch {
      return false;
    }
  },
  resetGenericPassword: async (options = {}) => {
    const service = options?.service || 'default';
    localStorage.removeItem(PREFIX + service);
    return true;
  },
  hasGenericPassword: async (options = {}) => Boolean(localStorage.getItem(PREFIX + (options.service || 'default'))),
};

export default Keychain;

// `authStore` imports the module namespace (`import * as Keychain`), so mirror
// every method as a named export as well.
export const ACCESSIBLE = Keychain.ACCESSIBLE;
export const ACCESS_CONTROL = Keychain.ACCESS_CONTROL;
export const AUTHENTICATION_TYPE = Keychain.AUTHENTICATION_TYPE;
export const SECURITY_LEVEL = Keychain.SECURITY_LEVEL;
export const STORAGE_TYPE = Keychain.STORAGE_TYPE;
export const setGenericPassword = Keychain.setGenericPassword;
export const getGenericPassword = Keychain.getGenericPassword;
export const resetGenericPassword = Keychain.resetGenericPassword;
export const hasGenericPassword = Keychain.hasGenericPassword;

