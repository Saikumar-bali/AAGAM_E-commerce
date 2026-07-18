import { FirebasePnvVerificationService } from './firebase-pnv-verification.service';

class TestService extends FirebasePnvVerificationService {
  constructor(private readonly result: any, private readonly failure?: Error) {
    super();
  }
  protected override async verifyWithAdmin(): Promise<any> {
    if (this.failure) throw this.failure;
    return this.result;
  }
}

const now = Math.floor(Date.now() / 1000);
const valid = {
  iss: 'https://fpnv.googleapis.com/projects/123456789',
  aud: [
    'https://fpnv.googleapis.com/projects/123456789',
    'https://fpnv.googleapis.com/projects/aagam-test',
  ],
  exp: now + 300,
  iat: now,
  jti: 'jti-1',
  nonce: 'nonce-1',
  sub: '+919999999999',
  phoneNumber: '+919999999999',
};

describe('FirebasePnvVerificationService', () => {
  beforeEach(() => {
    process.env.FIREBASE_PROJECT_ID = 'aagam-test';
    process.env.FIREBASE_PROJECT_NUMBER = '123456789';
  });

  it('PNV valid token', async () => {
    await expect(new TestService(valid).verifySignedToken('x'.repeat(80))).resolves.toEqual(valid);
  });
  it('invalid signature', async () => {
    await expect(
      new TestService(null, new Error('signature verification failed')).verifySignedToken(
        'x'.repeat(80),
      ),
    ).rejects.toMatchObject({ safeCode: 'PNV_INVALID_SIGNATURE' });
  });
  it('wrong issuer', async () => {
    await expect(
      new TestService({ ...valid, iss: 'https://fpnv.googleapis.com/projects/other' }).verifySignedToken(
        'x'.repeat(80),
      ),
    ).rejects.toMatchObject({ safeCode: 'PNV_WRONG_ISSUER' });
  });
  it('wrong audience', async () => {
    await expect(
      new TestService({ ...valid, aud: ['other'] }).verifySignedToken('x'.repeat(80)),
    ).rejects.toMatchObject({ safeCode: 'PNV_WRONG_AUDIENCE' });
  });
  it('expired token', async () => {
    await expect(
      new TestService({ ...valid, exp: now - 1 }).verifySignedToken('x'.repeat(80)),
    ).rejects.toMatchObject({ safeCode: 'PNV_TOKEN_EXPIRED' });
  });
  it('rejects missing nonce', async () => {
    await expect(
      new TestService({ ...valid, nonce: '' }).verifySignedToken('x'.repeat(80)),
    ).rejects.toMatchObject({ safeCode: 'PNV_INVALID_TOKEN' });
  });
  it('rejects missing jti', async () => {
    await expect(
      new TestService({ ...valid, jti: '' }).verifySignedToken('x'.repeat(80)),
    ).rejects.toMatchObject({ safeCode: 'PNV_INVALID_TOKEN' });
  });
});
