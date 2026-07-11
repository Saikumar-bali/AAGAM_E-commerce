import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function completeConfig(config: Record<string, string>) {
  return Boolean(
    config.apiKey
      && config.projectId
      && config.messagingSenderId
      && config.appId,
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const healthOnly = requestUrl.searchParams.get('health') === '1';
  const queryConfig = {
    apiKey: requestUrl.searchParams.get('apiKey') || '',
    authDomain: requestUrl.searchParams.get('authDomain') || '',
    projectId: requestUrl.searchParams.get('projectId') || '',
    storageBucket: requestUrl.searchParams.get('storageBucket') || '',
    messagingSenderId: requestUrl.searchParams.get('messagingSenderId') || '',
    appId: requestUrl.searchParams.get('appId') || '',
  };
  const environmentConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_WEB_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_WEB_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_WEB_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_WEB_APP_ID || '',
  };
  const config = healthOnly
    ? { apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' }
    : completeConfig(queryConfig)
      ? queryConfig
      : environmentConfig;

  const script = `
const AAGAM_SW_VERSION = 'phase-1.1-web-push-1';
const firebaseConfig = ${JSON.stringify(config)};
const firebaseConfigReady = Boolean(
  firebaseConfig.apiKey
    && firebaseConfig.projectId
    && firebaseConfig.messagingSenderId
    && firebaseConfig.appId
);
let aagamWorkerStatus = firebaseConfigReady ? 'INITIALIZING' : 'CONFIG_MISSING';
let aagamWorkerError = null;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'AAGAM_SW_HEALTH_CHECK') return;
  const response = {
    type: 'AAGAM_SW_HEALTH',
    version: AAGAM_SW_VERSION,
    status: aagamWorkerStatus,
    error: aagamWorkerError,
    firebaseConfigReady,
  };
  if (event.ports?.[0]) event.ports[0].postMessage(response);
});

if (firebaseConfigReady) {
  try {
    if (typeof window === 'undefined') {
      self.window = self;
    }
    importScripts('/firebase/firebase-app-compat.js');
    importScripts('/firebase/firebase-messaging-compat.js');

    const firebaseNamespace = self.firebase;
    if (!firebaseNamespace?.initializeApp || !firebaseNamespace?.messaging) {
      throw new Error('Firebase compatibility scripts did not expose Messaging');
    }

    const app = firebaseNamespace.apps?.length
      ? firebaseNamespace.app()
      : firebaseNamespace.initializeApp(firebaseConfig);
    const messaging = firebaseNamespace.messaging(app);

    messaging.onBackgroundMessage((payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'AAGAM update';
      const body = payload?.notification?.body || payload?.data?.body || 'You have a new notification.';
      const deepLink = payload?.data?.deepLink || '/';
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: payload?.data?.notificationId || payload?.data?.eventType || 'aagam-notification',
        renotify: true,
        data: {
          deepLink,
          recipientId: payload?.data?.recipientId || null,
        },
      });
    });

    aagamWorkerStatus = 'READY';
  } catch (error) {
    aagamWorkerStatus = 'ERROR';
    aagamWorkerError = error instanceof Error ? error.message : String(error);
    console.error('[AAGAM SW] Firebase initialization failed:', error);
  }
} else {
  console.warn('[AAGAM SW] Firebase config missing. Worker registered in health-only mode.');
}

function notificationTarget(data) {
  const target = new URL(data?.deepLink || '/', self.location.origin);
  if (data?.recipientId) {
    target.searchParams.set('aagamNotificationRecipient', data.recipientId);
  }
  return target.href;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification?.data || {});
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
`;

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Service-Worker-Allowed': '/',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
