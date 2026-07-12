import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiClient } from '../api/client';

type FirebaseMessaging = {
  requestPermission: () => Promise<number>;
  getToken: () => Promise<string>;
  onTokenRefresh: (handler: (token: string) => void | Promise<void>) => () => void;
  setBackgroundMessageHandler: (handler: (remoteMessage: unknown) => Promise<void>) => void;
};

const SUBSCRIPTION_ID_KEY = 'aagam:push:subscription-id';
const PUSH_TOKEN_KEY = 'aagam:push:token';

function getMessaging(): FirebaseMessaging | null {
  try {
    // Lazy require keeps apps bootable when Firebase is not configured locally.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const messagingModule = require('@react-native-firebase/messaging');
    const messagingFactory = messagingModule.default || messagingModule;
    return messagingFactory();
  } catch {
    if (__DEV__) {
      console.warn('[FCM] Messaging unavailable or Firebase not initialized.');
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
  } catch {
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
  } catch {
    if (__DEV__) console.warn('[FCM] Permission request failed.');
    return false;
  }
}

export async function getFCMToken() {
  const messaging = getMessaging();
  if (!messaging) return null;
  try {
    return await messaging.getToken();
  } catch {
    if (__DEV__) console.warn('[FCM] Token fetch failed.');
    return null;
  }
}

async function persistSubscription(token: string, deviceName?: string) {
  const response = await apiClient.post('/notifications/push/subscriptions', {
    provider: 'FCM_MOBILE',
    token,
    userAgent: `ReactNative/${Platform.OS}`,
    deviceName: deviceName || `AAGAM ${Platform.OS}`,
  });

  const subscriptionId = response.data?.id || response.data?.subscriptionId;
  if (subscriptionId) await AsyncStorage.setItem(SUBSCRIPTION_ID_KEY, String(subscriptionId));
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  return response.data;
}

export async function registerDeviceToken(deviceName?: string) {
  const hasPermission = await requestUserPermission();
  if (!hasPermission) return { enabled: false, reason: 'PERMISSION_NOT_GRANTED' };

  const token = await getFCMToken();
  if (!token) return { enabled: false, reason: 'TOKEN_UNAVAILABLE' };

  const subscription = await persistSubscription(token, deviceName);
  return { enabled: true, token, subscription };
}

export async function registerRefreshedToken(token: string, deviceName?: string) {
  if (!token) return;
  const previousToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  if (previousToken === token) return;
  await persistSubscription(token, deviceName);
}

export async function startMobilePushLifecycle(deviceName?: string) {
  const messaging = getMessaging();
  if (!messaging) return () => undefined;

  await registerDeviceToken(deviceName).catch((error) => {
    if (__DEV__) console.warn('[FCM] Device registration failed.', error?.message || error);
  });

  return messaging.onTokenRefresh((token) =>
    registerRefreshedToken(token, deviceName).catch((error) => {
      if (__DEV__) console.warn('[FCM] Token refresh registration failed.', error?.message || error);
    }),
  );
}

export async function disableCurrentMobilePushSubscription() {
  const subscriptionId = await AsyncStorage.getItem(SUBSCRIPTION_ID_KEY);
  try {
    if (subscriptionId) {
      await apiClient.delete(`/notifications/push/subscriptions/${encodeURIComponent(subscriptionId)}`);
    }
  } finally {
    await AsyncStorage.multiRemove([SUBSCRIPTION_ID_KEY, PUSH_TOKEN_KEY]);
  }
}

export function setupBackgroundMessageHandler() {
  const messaging = getMessaging();
  if (!messaging) return;
  try {
    messaging.setBackgroundMessageHandler(async () => {
      // Firebase displays addressed notification payloads. Application state is
      // refreshed after the user opens the notification.
    });
  } catch {
    if (__DEV__) console.warn('[FCM] Background handler setup skipped.');
  }
}
