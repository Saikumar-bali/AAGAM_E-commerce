import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

export type PushPayload = {
  title: string;
  body: string;
  deepLink?: string | null;
  data?: Record<string, unknown> | null;
};

export type PushSendResult =
  | { status: 'SENT'; responseId: string }
  | { status: 'SKIPPED'; reason: string };

@Injectable()
export class WebPushService implements OnModuleInit {
  private initializationAttempted = false;

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (this.initializationAttempted || admin.apps.length > 0) return;
    this.initializationAttempted = true;

    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (raw) {
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
        console.log('[WebPushService] Firebase Admin initialized from environment.');
        return;
      }

      const serviceAccountPath = path.resolve(process.cwd(), 'firebase-adminsdk.json');
      if (fs.existsSync(serviceAccountPath)) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))),
        });
        console.log('[WebPushService] Firebase Admin initialized from firebase-adminsdk.json.');
        return;
      }

      console.warn('[WebPushService] Firebase credentials missing. In-app notifications remain available; push attempts will be skipped.');
    } catch (error) {
      console.error('[WebPushService] Firebase initialization failed:', error);
    }
  }

  async send(subscription: any, payload: PushPayload): Promise<PushSendResult> {
    this.initializeFirebase();

    if (!subscription?.token) {
      return { status: 'SKIPPED', reason: 'Subscription has no FCM token' };
    }
    if (admin.apps.length === 0) {
      return { status: 'SKIPPED', reason: 'Firebase push provider is not configured' };
    }

    const data = Object.fromEntries(
      Object.entries(payload.data || {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
    );
    if (payload.deepLink) data.deepLink = payload.deepLink;

    const responseId = await admin.messaging().send({
      token: subscription.token,
      notification: { title: payload.title, body: payload.body },
      data,
      webpush: {
        notification: {
          title: payload.title,
          body: payload.body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: data.notificationId || data.eventType || 'aagam-notification',
          renotify: true,
        },
        ...(payload.deepLink ? { fcmOptions: { link: payload.deepLink } } : {}),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'high_priority_orders',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', contentAvailable: true } },
      },
    });

    return { status: 'SENT', responseId };
  }

  isInvalidSubscriptionError(error: any) {
    const code = String(error?.code || error?.errorInfo?.code || '');
    return [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/invalid-argument',
    ].includes(code);
  }
}
