import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import { apiClient } from '../api/client';

type RemoteMessage = {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
};

type FirebaseMessaging = {
  requestPermission: () => Promise<number>;
  hasPermission?: () => Promise<number>;
  registerDeviceForRemoteMessages?: () => Promise<void>;
  getToken: () => Promise<string>;
  onTokenRefresh: (handler: (token: string) => void | Promise<void>) => () => void;
  onMessage?: (handler: (remoteMessage: RemoteMessage) => void | Promise<void>) => () => void;
  onNotificationOpenedApp?: (handler: (remoteMessage: RemoteMessage) => void | Promise<void>) => () => void;
  getInitialNotification?: () => Promise<RemoteMessage | null>;
  setBackgroundMessageHandler: (handler: (remoteMessage: RemoteMessage) => Promise<void>) => void;
};

const SUBSCRIPTION_ID_KEY = 'aagam:push:subscription-id';
const PUSH_TOKEN_KEY = 'aagam:push:token';
const PUSH_SYNCED_AT_KEY = 'aagam:push:synced-at';
const PUSH_SERVER_REVERIFY_MS = 24 * 60 * 60 * 1000;

function getMessaging(): FirebaseMessaging | null {
  try {
    // Lazy loading keeps local builds usable when google-services.json is not installed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const messagingModule = require('@react-native-firebase/messaging');
    const messagingFactory = messagingModule.default || messagingModule;
    return messagingFactory();
  } catch {
    if (__DEV__) console.warn('[FCM] Messaging unavailable or Firebase not initialized.');
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

async function requestAndroidNotificationPermission() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    {
      title: 'AAGAM notifications',
      message: 'Allow order, delivery, store, and rider alerts on this device.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function hasExistingNotificationPermission(messaging: FirebaseMessaging) {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) return true;
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }

  if (!messaging.hasPermission) return false;
  try {
    const authStatus = await messaging.hasPermission();
    const status = getAuthorizationStatus();
    if (!status) return Boolean(authStatus);
    return authStatus === status.AUTHORIZED || authStatus === status.PROVISIONAL;
  } catch {
    return false;
  }
}

export async function requestUserPermission() {
  const messaging = getMessaging();
  if (!messaging) return false;

  try {
    const androidAllowed = await requestAndroidNotificationPermission();
    if (!androidAllowed) return false;
    await messaging.registerDeviceForRemoteMessages?.();
    const authStatus = await messaging.requestPermission();
    const status = getAuthorizationStatus();
    if (!status) return Platform.OS === 'android' || Boolean(authStatus);
    return (
      Platform.OS === 'android' ||
      authStatus === status.AUTHORIZED ||
      authStatus === status.PROVISIONAL
    );
  } catch (error) {
    if (__DEV__) console.warn('[FCM] Permission request failed.', error);
    return false;
  }
}

export async function getFCMToken() {
  const messaging = getMessaging();
  if (!messaging) return null;
  try {
    await messaging.registerDeviceForRemoteMessages?.();
    return await messaging.getToken();
  } catch (error) {
    if (__DEV__) console.warn('[FCM] Token fetch failed.', error);
    return null;
  }
}

async function persistSubscription(token: string, deviceName?: string) {
  const response = await apiClient.post('/notifications/push/subscriptions', {
    provider: 'FCM_MOBILE',
    token,
    userAgent: `ReactNative/${Platform.OS}/${String(Platform.Version)}`,
    deviceName: deviceName || `AAGAM ${Platform.OS}`,
  });

  const subscriptionId = response.data?.id || response.data?.subscriptionId;
  if (subscriptionId) await AsyncStorage.setItem(SUBSCRIPTION_ID_KEY, String(subscriptionId));
  await AsyncStorage.multiSet([
    [PUSH_TOKEN_KEY, token],
    [PUSH_SYNCED_AT_KEY, String(Date.now())],
  ]);
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

// Repairs the authenticated account's server binding without ever opening an OS
// permission prompt. This is safe to call from app foreground/timer recovery.
export async function reverifyDeviceTokenBinding(deviceName?: string) {
  const messaging = getMessaging();
  if (!messaging) return { enabled: false, reason: 'MESSAGING_UNAVAILABLE' };
  if (!(await hasExistingNotificationPermission(messaging))) {
    return { enabled: false, reason: 'PERMISSION_NOT_GRANTED' };
  }
  const token = await getFCMToken();
  if (!token) return { enabled: false, reason: 'TOKEN_UNAVAILABLE' };
  const subscription = await persistSubscription(token, deviceName);
  return { enabled: true, token, subscription };
}

export async function registerRefreshedToken(token: string, deviceName?: string) {
  if (!token) return;
  const [[, previousToken], [, syncedAt], [, subscriptionId]] = await AsyncStorage.multiGet([
    PUSH_TOKEN_KEY,
    PUSH_SYNCED_AT_KEY,
    SUBSCRIPTION_ID_KEY,
  ]);
  const lastSync = Number(syncedAt || 0);
  const serverRegistrationIsFresh = Boolean(
    subscriptionId
    && Number.isFinite(lastSync)
    && Date.now() - lastSync < PUSH_SERVER_REVERIFY_MS,
  );

  // FCM may return the same token after the server subscription was pruned or
  // disabled. Re-upsert it periodically instead of trusting local equality forever.
  if (previousToken === token && serverRegistrationIsFresh) return;
  await persistSubscription(token, deviceName);
}

export async function startMobilePushLifecycle(
  deviceName?: string,
  onForegroundMessage?: (remoteMessage: RemoteMessage) => void | Promise<void>,
  onOpenedMessage?: (remoteMessage: RemoteMessage) => void | Promise<void>,
) {
  const messaging = getMessaging();
  if (!messaging) return () => undefined;

  await registerDeviceToken(deviceName).catch((error) => {
    if (__DEV__) console.warn('[FCM] Device registration failed.', error?.message || error);
  });

  const unsubscribeRefresh = messaging.onTokenRefresh((token) =>
    registerRefreshedToken(token, deviceName).catch((error) => {
      if (__DEV__) console.warn('[FCM] Token refresh registration failed.', error?.message || error);
    }),
  );
  const unsubscribeForeground = onForegroundMessage && messaging.onMessage
    ? messaging.onMessage(onForegroundMessage)
    : () => undefined;
  const unsubscribeOpened = onOpenedMessage && messaging.onNotificationOpenedApp
    ? messaging.onNotificationOpenedApp(onOpenedMessage)
    : () => undefined;

  if (onOpenedMessage && messaging.getInitialNotification) {
    void messaging.getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) return onOpenedMessage(remoteMessage);
        return undefined;
      })
      .catch((error) => {
        if (__DEV__) console.warn('[FCM] Initial notification read failed.', error?.message || error);
      });
  }

  return () => {
    unsubscribeRefresh?.();
    unsubscribeForeground?.();
    unsubscribeOpened?.();
  };
}

export async function disableCurrentMobilePushSubscription() {
  const subscriptionId = await AsyncStorage.getItem(SUBSCRIPTION_ID_KEY);
  try {
    if (subscriptionId) {
      await apiClient.delete(`/notifications/push/subscriptions/${encodeURIComponent(subscriptionId)}`);
    }
  } finally {
    await AsyncStorage.multiRemove([SUBSCRIPTION_ID_KEY, PUSH_TOKEN_KEY, PUSH_SYNCED_AT_KEY]);
  }
}

export function setupBackgroundMessageHandler() {
  const messaging = getMessaging();
  if (!messaging) return;
  try {
    messaging.setBackgroundMessageHandler(async () => {
      // FCM displays notification payloads while the app is backgrounded.
      // Data is refreshed by screens when the user opens the notification.
    });
  } catch {
    if (__DEV__) console.warn('[FCM] Background handler setup skipped.');
  }
}
