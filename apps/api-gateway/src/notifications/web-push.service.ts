import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger('WebPushService');

export type PushPayload = {
  title: string;
  body: string;
  deepLink?: string | null;
  data?: Record<string, unknown> | null;
};

export type PushSendResult =
  | { status: 'SENT'; responseId: string }
  | { status: 'SKIPPED'; reason: string };

export type FirebasePushReadiness = {
  configured: boolean;
  source: 'environment' | 'file' | 'existing_app' | 'missing' | 'invalid';
  projectId?: string;
  reason?: string;
};

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export function parseFirebaseServiceAccount(raw: string): FirebaseServiceAccount {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON');
  }

  for (const key of ['project_id', 'client_email', 'private_key']) {
    if (typeof parsed?.[key] !== 'string' || !parsed[key].trim()) {
      throw new Error(`Firebase service account is missing ${key}`);
    }
  }

  const expectedProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (expectedProjectId && parsed.project_id !== expectedProjectId) {
    throw new Error(
      `Firebase service account project_id ${parsed.project_id} does not match FIREBASE_PROJECT_ID ${expectedProjectId}`,
    );
  }

  return parsed as FirebaseServiceAccount;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private initializationAttempted = false;
  private readiness: FirebasePushReadiness = {
    configured: false,
    source: 'missing',
    reason: 'Firebase initialization has not run',
  };

  onModuleInit() {
    this.initializeFirebase();
  }

  getReadiness(): FirebasePushReadiness {
    this.initializeFirebase();
    return { ...this.readiness };
  }

  private initializeFirebase() {
    if (admin.apps.length > 0) {
      this.readiness = {
        configured: true,
        source: this.readiness.configured ? this.readiness.source : 'existing_app',
        projectId: this.readiness.projectId || admin.app().options.projectId,
      };
      return;
    }
    if (this.initializationAttempted) return;
    this.initializationAttempted = true;

    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (raw) {
        const serviceAccount = parseFirebaseServiceAccount(raw);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount as admin.ServiceAccount) });
        this.readiness = {
          configured: true,
          source: 'environment',
          projectId: serviceAccount.project_id,
        };
        logger.log('Firebase Admin initialized from environment.');
        return;
      }

      const serviceAccountPath = path.resolve(process.cwd(), 'firebase-adminsdk.json');
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = parseFirebaseServiceAccount(fs.readFileSync(serviceAccountPath, 'utf8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        });
        this.readiness = {
          configured: true,
          source: 'file',
          projectId: serviceAccount.project_id,
        };
        logger.log('Firebase Admin initialized from firebase-adminsdk.json.');
        return;
      }

      this.readiness = {
        configured: false,
        source: 'missing',
        reason: 'FIREBASE_SERVICE_ACCOUNT_JSON is not configured',
      };
      logger.warn('Firebase credentials missing. In-app notifications remain available; phone push attempts will be skipped.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.readiness = { configured: false, source: 'invalid', reason };
      logger.error(`Firebase initialization failed: ${reason}`);
    }
  }

  async send(subscription: any, payload: PushPayload): Promise<PushSendResult> {
    this.initializeFirebase();

    // The pre-Phase-0 checkout path broadcast every new order to every rider.
    // Keep the compatibility method callable, but explicitly block that unsafe
    // fan-out. Riders now receive only ASSIGNMENT_OFFERED events addressed to
    // their user ID through the durable outbox.
    if ((payload.data as any)?.type === 'NEW_ORDER') {
      return { status: 'SKIPPED', reason: 'Legacy all-rider order broadcast is disabled' };
    }

    if (!subscription?.token) {
      return { status: 'SKIPPED', reason: 'Subscription has no FCM token' };
    }
    if (!this.readiness.configured || admin.apps.length === 0) {
      return {
        status: 'SKIPPED',
        reason: this.readiness.reason || 'Firebase push provider is not configured',
      };
    }

    const data: Record<string, string> = Object.fromEntries(
      Object.entries(payload.data || {}).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
    );
    data.title = payload.title;
    data.body = payload.body;
    if (payload.deepLink) data.deepLink = payload.deepLink;

    // Android receives a native notification payload. Firebase displays it when
    // the app is backgrounded, swiped away, or the process is not running. The
    // data payload is retained so tapping it can open the Store/Rider workspace.
    const responseId = await admin.messaging().send({
      token: subscription.token,
      data,
      webpush: {
        headers: { Urgency: 'high' },
        ...(payload.deepLink ? { fcmOptions: { link: payload.deepLink } } : {}),
      },
      android: {
        priority: 'high',
        ttl: 5 * 60 * 1000,
        collapseKey: data.recipientId || data.notificationId || data.eventType || 'aagam-operations',
        notification: {
          title: payload.title,
          body: payload.body,
          sound: 'default',
          channelId: 'high_priority_orders',
          tag: data.recipientId || data.notificationId || data.eventType || 'aagam-notification',
          visibility: 'public',
          defaultVibrateTimings: true,
          defaultSound: true,
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: { title: payload.title, body: payload.body },
            sound: 'default',
            contentAvailable: true,
          },
        },
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
