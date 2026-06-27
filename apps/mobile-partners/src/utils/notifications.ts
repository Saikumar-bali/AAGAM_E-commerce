import messaging from '@react-native-firebase/messaging';
import { apiClient } from '@aagam/mobile-shared';

export async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  return enabled;
}

export async function getFCMToken() {
  try {
    const token = await messaging().getToken();
    return token;
  } catch (error) {
    return null;
  }
}

export async function registerDeviceToken() {
  try {
    const hasPermission = await requestUserPermission();
    if (!hasPermission) return;
    const token = await getFCMToken();
    if (token) {
      await apiClient.post('/auth/fcm-token', { token });
    }
  } catch (error) {
    console.error('[FCM] Error registering device token:', error);
  }
}

messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[FCM] Background message:', remoteMessage);
});
