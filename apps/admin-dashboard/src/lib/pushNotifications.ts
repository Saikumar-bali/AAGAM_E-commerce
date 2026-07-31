'use client';

import { apiClient } from '@aagam/utils';

declare global {
  interface Window {
    firebase?: any;
  }
}

type FirebaseWebConfig = {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId: string;
  appId: string;
};

type PushSetupResult = {
  enabled: boolean;
  permission: NotificationPermission;
  subscriptionId?: string;
  token?: string;
  reason?: string;
};

let firebaseLoadPromise: Promise<any> | null = null;
let foregroundHandlerRegistered = false;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).dataset.loaded === 'true') resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function loadFirebaseCompat() {
  if (typeof window === 'undefined') throw new Error('Push notifications require a browser');
  if (window.firebase?.messaging) return window.firebase;
  if (!firebaseLoadPromise) {
    firebaseLoadPromise = (async () => {
      await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');
      if (!window.firebase?.messaging) throw new Error('Firebase Messaging did not initialize');
      return window.firebase;
    })();
  }
  return firebaseLoadPromise;
}

function notificationTarget(deepLink?: string, recipientId?: string) {
  const target = new URL(deepLink || '/', window.location.origin);
  if (recipientId) target.searchParams.set('aagamNotificationRecipient', recipientId);
  return target.href;
}

function workerScriptUrl(firebaseConfig: FirebaseWebConfig) {
  const url = new URL('/firebase-messaging-sw.js', window.location.origin);
  Object.entries(firebaseConfig).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return `${url.pathname}${url.search}`;
}

export function pushNotificationsSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function enablePushNotifications(): Promise<PushSetupResult> {
  if (!pushNotificationsSupported()) {
    return { enabled: false, permission: 'denied', reason: 'This browser does not support push notifications.' };
  }

  const configResponse = await apiClient.get('/notifications/push/config');
  const config = configResponse.data || {};
  if (!config.enabled || !config.firebaseConfig || !config.vapidKey) {
    return {
      enabled: false,
      permission: Notification.permission,
      reason: 'Firebase web push is not configured on the server.',
    };
  }

  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== 'granted') {
    return { enabled: false, permission, reason: 'Notification permission was not granted.' };
  }

  const registration = await navigator.serviceWorker.register(
    workerScriptUrl(config.firebaseConfig as FirebaseWebConfig),
    { scope: '/', updateViaCache: 'none' },
  );
  await navigator.serviceWorker.ready;

  const firebase = await loadFirebaseCompat();
  const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config.firebaseConfig);
  const messaging = firebase.messaging(app);
  const token = await messaging.getToken({
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error('Firebase did not return a web push token');

  const response = await apiClient.post('/notifications/push/subscriptions', {
    provider: 'FCM_WEB',
    token,
    userAgent: navigator.userAgent,
    deviceName: `${navigator.platform || 'Browser'} web`,
  });

  localStorage.setItem('aagam_push_enabled', 'true');
  localStorage.setItem('aagam_push_subscription_id', response.data?.id || '');

  if (!foregroundHandlerRegistered) {
    foregroundHandlerRegistered = true;
    messaging.onMessage((payload: any) => {
      const title = payload?.notification?.title || payload?.data?.title || 'AAGAAM update';
      const body = payload?.notification?.body || payload?.data?.body || 'You have a new notification.';
      const deepLink = payload?.data?.deepLink;
      const recipientId = payload?.data?.recipientId;
      window.dispatchEvent(new CustomEvent('aagam:push-message', { detail: payload }));
      if (document.visibilityState === 'visible' && Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body,
          icon: '/icons/icon-192.png',
          tag: payload?.data?.notificationId || payload?.data?.eventType || 'aagam-update',
          data: { deepLink, recipientId },
        });
        notification.onclick = () => {
          window.focus();
          window.location.assign(notificationTarget(deepLink, recipientId));
        };
      }
    });
  }

  return { enabled: true, permission, subscriptionId: response.data?.id, token };
}

export async function disablePushSubscription(subscriptionId: string) {
  await apiClient.delete(`/notifications/push/subscriptions/${subscriptionId}`);
  localStorage.removeItem('aagam_push_enabled');
  localStorage.removeItem('aagam_push_subscription_id');
}
