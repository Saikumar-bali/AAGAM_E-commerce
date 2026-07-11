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

type WorkerHealth = {
  type: 'AAGAM_SW_HEALTH';
  version: string;
  status: 'READY' | 'CONFIG_MISSING' | 'INITIALIZING' | 'ERROR';
  error?: string | null;
  firebaseConfigReady: boolean;
};

type PushSetupResult = {
  enabled: boolean;
  permission: NotificationPermission;
  subscriptionId?: string;
  token?: string;
  reason?: string;
  code?: string;
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
      await loadScript('/firebase/firebase-app-compat.js');
      await loadScript('/firebase/firebase-messaging-compat.js');
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

function waitForWorkerActivation(registration: ServiceWorkerRegistration) {
  const worker = registration.installing || registration.waiting || registration.active;
  if (!worker) return Promise.reject(new Error('Service worker instance missing after registration'));
  if (worker.state === 'activated') return Promise.resolve(worker);

  return new Promise<ServiceWorker>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.removeEventListener('statechange', handleStateChange);
      reject(new Error(`Service worker activation timed out in state ${worker.state}`));
    }, 12000);

    const handleStateChange = () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeout);
        worker.removeEventListener('statechange', handleStateChange);
        resolve(worker);
      } else if (worker.state === 'redundant') {
        window.clearTimeout(timeout);
        worker.removeEventListener('statechange', handleStateChange);
        reject(new Error('Service worker became redundant before activation'));
      }
    };

    worker.addEventListener('statechange', handleStateChange);
  });
}

async function waitForWorkerHealth(registration: ServiceWorkerRegistration) {
  const worker = await waitForWorkerActivation(registration);

  return new Promise<WorkerHealth>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error('Service worker health check timed out'));
    }, 8000);

    channel.port1.onmessage = (event: MessageEvent<WorkerHealth>) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };

    worker.postMessage({ type: 'AAGAM_SW_HEALTH_CHECK' }, [channel.port2]);
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function pushNotificationsSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function enablePushNotifications(): Promise<PushSetupResult> {
  if (!pushNotificationsSupported()) {
    return {
      enabled: false,
      permission: 'denied',
      code: 'BROWSER_UNSUPPORTED',
      reason: 'This browser does not support push notifications.',
    };
  }

  let config: any;
  try {
    const configResponse = await apiClient.get('/notifications/push/config');
    config = configResponse.data || {};
  } catch (error) {
    return {
      enabled: false,
      permission: Notification.permission,
      code: 'CONFIG_REQUEST_FAILED',
      reason: `Could not load push configuration: ${errorMessage(error)}`,
    };
  }

  if (!config.enabled || !config.firebaseConfig || !config.vapidKey) {
    const missing = Array.isArray(config.missing) && config.missing.length
      ? ` Missing: ${config.missing.join(', ')}.`
      : '';
    return {
      enabled: false,
      permission: Notification.permission,
      code: 'FIREBASE_CONFIG_MISSING',
      reason: `Firebase web push is not fully configured on the API.${missing}`,
    };
  }

  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== 'granted') {
    return {
      enabled: false,
      permission,
      code: 'PERMISSION_NOT_GRANTED',
      reason: 'Notification permission was not granted.',
    };
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(
      workerScriptUrl(config.firebaseConfig as FirebaseWebConfig),
      { scope: '/', updateViaCache: 'none' },
    );
    await navigator.serviceWorker.ready;
  } catch (error) {
    return {
      enabled: false,
      permission,
      code: 'WORKER_REGISTRATION_FAILED',
      reason: `Background worker registration failed: ${errorMessage(error)}`,
    };
  }

  try {
    const health = await waitForWorkerHealth(registration);
    if (health.status !== 'READY') {
      return {
        enabled: false,
        permission,
        code: `WORKER_${health.status}`,
        reason: health.error
          ? `Background worker could not initialize Firebase: ${health.error}`
          : `Background worker is not ready (${health.status}).`,
      };
    }
  } catch (error) {
    return {
      enabled: false,
      permission,
      code: 'WORKER_HEALTH_FAILED',
      reason: `Background worker health check failed: ${errorMessage(error)}`,
    };
  }

  let firebase: any;
  let messaging: any;
  try {
    firebase = await loadFirebaseCompat();
    const app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(config.firebaseConfig);
    messaging = firebase.messaging(app);
  } catch (error) {
    return {
      enabled: false,
      permission,
      code: 'FIREBASE_BROWSER_INIT_FAILED',
      reason: `Firebase could not initialize in the browser: ${errorMessage(error)}`,
    };
  }

  let token: string;
  try {
    token = await messaging.getToken({
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) throw new Error('Firebase did not return a web push token');
  } catch (error) {
    return {
      enabled: false,
      permission,
      code: 'FCM_TOKEN_FAILED',
      reason: `Firebase token registration failed: ${errorMessage(error)}`,
    };
  }

  let response: any;
  try {
    response = await apiClient.post('/notifications/push/subscriptions', {
      provider: 'FCM_WEB',
      token,
      userAgent: navigator.userAgent,
      deviceName: `${navigator.platform || 'Browser'} web`,
    });
  } catch (error) {
    return {
      enabled: false,
      permission,
      code: 'SUBSCRIPTION_API_FAILED',
      reason: `The browser token could not be saved: ${errorMessage(error)}`,
    };
  }

  localStorage.setItem('aagam_push_enabled', 'true');
  localStorage.setItem('aagam_push_subscription_id', response.data?.id || '');

  if (!foregroundHandlerRegistered) {
    foregroundHandlerRegistered = true;
    messaging.onMessage((payload: any) => {
      const title = payload?.notification?.title || payload?.data?.title || 'AAGAM update';
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
