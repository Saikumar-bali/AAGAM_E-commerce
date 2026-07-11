import { getFirebaseWebPushConfig } from './notifications/notifications.controller';

const KEYS = [
  'FIREBASE_WEB_API_KEY',
  'FIREBASE_WEB_AUTH_DOMAIN',
  'FIREBASE_WEB_PROJECT_ID',
  'FIREBASE_WEB_STORAGE_BUCKET',
  'FIREBASE_WEB_MESSAGING_SENDER_ID',
  'FIREBASE_WEB_APP_ID',
  'FIREBASE_WEB_VAPID_KEY',
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function clearConfig() {
  KEYS.forEach((key) => delete process.env[key]);
}

function restoreConfig() {
  KEYS.forEach((key) => {
    const value = original[key];
    if (typeof value === 'string') process.env[key] = value;
    else delete process.env[key];
  });
}

describe('Firebase web push configuration contract', () => {
  beforeEach(clearConfig);
  afterAll(restoreConfig);

  it('is disabled and names every required variable when configuration is absent', () => {
    const result = getFirebaseWebPushConfig();

    expect(result.enabled).toBe(false);
    expect(result.firebaseConfig).toBeNull();
    expect(result.vapidKey).toBeNull();
    expect(result.missing).toEqual([
      'FIREBASE_WEB_API_KEY',
      'FIREBASE_WEB_PROJECT_ID',
      'FIREBASE_WEB_MESSAGING_SENDER_ID',
      'FIREBASE_WEB_APP_ID',
      'FIREBASE_WEB_VAPID_KEY',
    ]);
  });

  it('does not report enabled for a partial configuration', () => {
    process.env.FIREBASE_WEB_API_KEY = 'public-api-key';
    process.env.FIREBASE_WEB_VAPID_KEY = 'public-vapid-key';

    const result = getFirebaseWebPushConfig();

    expect(result.enabled).toBe(false);
    expect(result.missing).toEqual([
      'FIREBASE_WEB_PROJECT_ID',
      'FIREBASE_WEB_MESSAGING_SENDER_ID',
      'FIREBASE_WEB_APP_ID',
    ]);
  });

  it('treats whitespace-only values as missing', () => {
    process.env.FIREBASE_WEB_API_KEY = '   ';
    process.env.FIREBASE_WEB_PROJECT_ID = '\t';
    process.env.FIREBASE_WEB_MESSAGING_SENDER_ID = '\n';
    process.env.FIREBASE_WEB_APP_ID = ' ';
    process.env.FIREBASE_WEB_VAPID_KEY = '  ';

    const result = getFirebaseWebPushConfig();

    expect(result.enabled).toBe(false);
    expect(result.missing).toHaveLength(5);
  });

  it('returns the public Firebase configuration only when every required value exists', () => {
    process.env.FIREBASE_WEB_API_KEY = 'public-api-key';
    process.env.FIREBASE_WEB_AUTH_DOMAIN = 'aagam.firebaseapp.com';
    process.env.FIREBASE_WEB_PROJECT_ID = 'aagam-project';
    process.env.FIREBASE_WEB_STORAGE_BUCKET = 'aagam.appspot.com';
    process.env.FIREBASE_WEB_MESSAGING_SENDER_ID = '123456789';
    process.env.FIREBASE_WEB_APP_ID = '1:123456789:web:abcdef';
    process.env.FIREBASE_WEB_VAPID_KEY = 'public-vapid-key';

    const result = getFirebaseWebPushConfig();

    expect(result.enabled).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.vapidKey).toBe('public-vapid-key');
    expect(result.firebaseConfig).toEqual({
      apiKey: 'public-api-key',
      authDomain: 'aagam.firebaseapp.com',
      projectId: 'aagam-project',
      storageBucket: 'aagam.appspot.com',
      messagingSenderId: '123456789',
      appId: '1:123456789:web:abcdef',
    });
  });
});
