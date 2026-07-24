import { parseFirebaseServiceAccount } from './web-push.service';

describe('Firebase closed-app push readiness', () => {
  const originalProjectId = process.env.FIREBASE_PROJECT_ID;

  afterEach(() => {
    if (originalProjectId === undefined) delete process.env.FIREBASE_PROJECT_ID;
    else process.env.FIREBASE_PROJECT_ID = originalProjectId;
  });

  it('accepts a complete service account for the configured Firebase project', () => {
    process.env.FIREBASE_PROJECT_ID = 'aagam-production';
    const account = parseFirebaseServiceAccount(JSON.stringify({
      project_id: 'aagam-production',
      client_email: 'firebase-adminsdk@aagam-production.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nredacted-test-key\n-----END PRIVATE KEY-----\n',
    }));

    expect(account.project_id).toBe('aagam-production');
  });

  it('rejects malformed JSON instead of silently disabling phone push', () => {
    expect(() => parseFirebaseServiceAccount('{invalid')).toThrow(
      'FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON',
    );
  });

  it.each(['project_id', 'client_email', 'private_key'])('rejects a service account missing %s', (field) => {
    const account: Record<string, string> = {
      project_id: 'aagam-production',
      client_email: 'firebase-adminsdk@aagam-production.iam.gserviceaccount.com',
      private_key: 'test-private-key',
    };
    delete account[field];

    expect(() => parseFirebaseServiceAccount(JSON.stringify(account))).toThrow(
      `Firebase service account is missing ${field}`,
    );
  });

  it('rejects credentials from a different Firebase project', () => {
    process.env.FIREBASE_PROJECT_ID = 'aagam-production';

    expect(() => parseFirebaseServiceAccount(JSON.stringify({
      project_id: 'different-project',
      client_email: 'firebase-adminsdk@different-project.iam.gserviceaccount.com',
      private_key: 'test-private-key',
    }))).toThrow('does not match FIREBASE_PROJECT_ID aagam-production');
  });
});
