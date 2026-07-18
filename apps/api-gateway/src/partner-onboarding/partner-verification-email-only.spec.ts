import { PartnerContactChannel } from './partner-onboarding.types';
import { PartnerVerificationService } from './partner-verification.service';
import { VerificationProvider } from './verification.types';

function build() {
  const applications = {
    requireApplication: jest.fn().mockResolvedValue({
      id: 'app-1',
      status: 'DRAFT',
      email: 'partner@example.com',
      phoneE164: '+919999999999',
      applicationNumber: 'AAG-RID-2026-TEST',
    }),
    assertEditable: jest.fn(),
    writeEvent: jest.fn(),
    response: jest.fn(),
  };
  const delivery = { deliver: jest.fn() };
  const challenges = {
    create: jest.fn(),
    lastSuccessfulProviderCheck: jest.fn().mockResolvedValue(null),
  };
  const service = new PartnerVerificationService(
    applications as any,
    { verificationHash: jest.fn() } as any,
    delivery as any,
    challenges as any,
    { verifySignedToken: jest.fn() } as any,
  );
  return { service, delivery, challenges };
}

describe('temporary email-only partner verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      PARTNER_EMAIL_PROVIDER: 'MAILJET',
      MAILJET_API_KEY: 'mailjet-public',
      MAILJET_SECRET_KEY: 'mailjet-private',
      PARTNER_VERIFICATION_FROM_EMAIL: 'verified@example.com',
      PARTNER_PHONE_VERIFICATION_MODE: 'EMAIL_ONLY',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('reports Mailjet as active and phone verification as unavailable', async () => {
    const { service } = build();
    await expect(service.capabilities()).resolves.toMatchObject({
      mode: 'EMAIL_ONLY',
      email: { provider: VerificationProvider.MAILJET, configured: true },
      phone: { available: false, pnvConfigured: false, smsConfigured: false },
    });
  });

  it('rejects phone OTP and PNV before creating a challenge or calling a provider', async () => {
    const { service, delivery, challenges } = build();
    await expect(
      service.requestContactCode('app-1', 'a'.repeat(40), PartnerContactChannel.PHONE),
    ).rejects.toThrow('Phone verification is temporarily unavailable');
    await expect(service.createPnvChallenge('app-1', 'a'.repeat(40))).rejects.toThrow(
      'Phone verification is temporarily unavailable',
    );
    expect(challenges.create).not.toHaveBeenCalled();
    expect(delivery.deliver).not.toHaveBeenCalled();
  });
});
