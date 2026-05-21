import messaging from '@react-native-firebase/messaging';
import { Alert, Platform } from 'react-native';
import { apiClient } from '../api/client';

export async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('[FCM] Authorization status:', authStatus);
    return true;
  }
  return false;
}

export async function getFCMToken() {
  try {
    const token = await messaging().getToken();
    console.log('[FCM] Token:', token);
    return token;
  } catch (error) {
    console.error('[FCM] Error getting token:', error);
    return null;
  }
}

export async function registerDeviceToken() {
  try {
    const hasPermission = await requestUserPermission();
    if (!hasPermission) {
      console.warn('[FCM] Notification permission denied');
      return;
    }

    const token = await getFCMToken();
    if (token) {
      // Send token to our backend
      await apiClient.post('/auth/fcm-token', { token });
      console.log('[FCM] Token registered with backend');
    }
  } catch (error) {
    console.error('[FCM] Error registering device token:', error);
  }
}

// Background handler for headless notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[FCM] Message handled in the background!', remoteMessage);
});
