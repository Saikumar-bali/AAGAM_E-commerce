import { apiClient } from '../api/client';

type FirebaseMessaging = {
  requestPermission: () => Promise<number>;
  getToken: () => Promise<string>;
  setBackgroundMessageHandler: (handler: (remoteMessage: unknown) => Promise<void>) => void;
  AuthorizationStatus?: {
    AUTHORIZED: number;
    PROVISIONAL: number;
  };
};

function getMessaging(): FirebaseMessaging | null {
  try {
    // Lazy require prevents Firebase from running during module import.
    // This keeps apps bootable even when Firebase is not configured locally.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const messagingModule = require('@react-native-firebase/messaging');
    const messagingFactory = messagingModule.default || messagingModule;
    return messagingFactory();
  } catch (error) {
    if (__DEV__) {
      console.warn('[FCM] Messaging unavailable or Firebase not initialized. Push registration skipped.');
    }
    return null;
  }
}

function getAuthorizationStatus() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const messagingModule = require('@react-native-firebase/messaging');
    const messagingFactory = messagingModule.default || messagingModule;
    return messagingFactory.AuthorizationStatus || messagingModule.AuthorizationStatus;
  } catch (error) {
    return null;
  }
}

export async function requestUserPermission() {
  const messaging = getMessaging();
  if (!messaging) return false;

  try {
    const authStatus = await messaging.requestPermission();
    const status = getAuthorizationStatus();
    if (!status) return Boolean(authStatus);
    return authStatus === status.AUTHORIZED || authStatus === status.PROVISIONAL;
  } catch (error) {
    if (__DEV__) console.warn('[FCM] Permission request failed.');
    return false;
  }
}

export async function getFCMToken() {
  const messaging = getMessaging();
  if (!messaging) return null;

  try {
    return await messaging.getToken();
  } catch (error) {
    if (__DEV__) console.warn('[FCM] Token fetch failed.');
    return null;
  }
}

export async function registerDeviceToken() {
  try {
    const hasPermission = await requestUserPermission();
    if (!hasPermission) return;
    const token = await getFCMToken();
    if (token) await apiClient.post('/auth/fcm-token', { token });
  } catch (error) {
    if (__DEV__) console.warn('[FCM] Error registering device token.');
  }
}

export function setupBackgroundMessageHandler() {
  const messaging = getMessaging();
  if (!messaging) return;

  try {
    messaging.setBackgroundMessageHandler(async (remoteMessage) => {
      if (__DEV__) console.log('[FCM] Background message:', remoteMessage);
    });
  } catch (error) {
    if (__DEV__) console.warn('[FCM] Background handler setup skipped.');
  }
}
