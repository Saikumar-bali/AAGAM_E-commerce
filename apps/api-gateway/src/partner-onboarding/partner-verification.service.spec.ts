import { UnauthorizedException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { PartnerVerificationDeliveryException } from './partner-verification-delivery.service';
import { PartnerVerificationService } from './partner-verification.service';
import { PartnerContactChannel } from './partner-onboarding.types';
import {
  VerificationChallengeStatus,
  VerificationMethod,
  VerificationProvider,
} from './verification.types';

jest.mock('@aagam/database', () => ({
  prisma: {
    $transaction: jest.fn(async (callback: any) =>
      callback({ $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn() }),
    ),
    $queryRawUnsafe: jest.fn(),
    $executeRawUnsafe: jest.fn(),
  },
}));

const application = {
  id: 'app-1',
  applicationNumber: 'AAG-RID-2026-TEST',
  status: 'DRAFT',
  email: 'partner@example.com',
  phoneE164: '+919999999999',
  applicantName: 'QA Partner',
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
};

function build(overrides: Record<string, any> = {}) {
  const applications = {
    requireApplication: jest.fn().mockResolvedValue(application),
    assertEditable: jest.fn(),
    writeEvent: jest.fn(),
    response: jest.fn().mockResolvedValue({ application }),
    ...overrides.applications,
  };
  const security = {
    verificationHash: jest.fn((id: string, code: string) => `${id}:${code}`),
    ...overrides.security,
  };
  const delivery = {
    deliver: jest.fn().mockResolvedValue({
      provider: VerificationProvider.QA,
      deliveryId: 'qa-delivery',
      correlationId: 'corr-1',
      httpStatus: 202,
    }),
    ...overrides.delivery,
  };
  const challenges = {
    create: jest.fn().mockResolvedValue({
      id: 'challenge-1',
      applicationId: application.id,
      method: VerificationMethod.EMAIL_CODE,
      provider: VerificationProvider.QA,
      destinationHash: 'hash',
      nonceHash: null,
      tokenJti: null,
      providerDeliveryId: null,
      status: VerificationChallengeStatus.CREATED,
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    setStatus: jest.fn(),
    supersedeActive: jest.fn(),
    latestSentCode: jest.fn(),
    activePnvByNonce: jest.fn(),
    hasTokenJti: jest.fn().mockResolvedValue(false),
    lastSuccessfulProviderCheck: jest.fn().mockResolvedValue(null),
    ...overrides.challenges,
  };
  const firebasePnv = {
    verifySignedToken: jest.fn().mockResolvedValue({
      jti: 'jti-1',
      nonce: 'nonce-1',
      phoneNumber: '+919999999999',
    }),
    ...overrides.firebasePnv,
  };
  const service = new PartnerVerificationService(
    applications as any,
    security as any,
    delivery as any,
    challenges as any,
    firebasePnv as any,
  );
  return { service, applications, delivery, challenges, firebasePnv };
}

describe('PartnerVerificationService regression contracts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      PARTNER_PHONE_VERIFICATION_MODE: 'PNV_FIRST',
      FIREBASE_PROJECT_ID: 'aagam-test',
      FIREBASE_PROJECT_NUMBER: '123',
    };
    delete process.env.PLAYWRIGHT_QA;
    delete process.env.PARTNER_EMAIL_PROVIDER;
    delete process.env.MAILJET_API_KEY;
    delete process.env.MAILJET_SECRET_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.PARTNER_VERIFICATION_FROM_EMAIL;
    delete process.env.PARTNER_VERIFICATION_FROM_NAME;
    (prisma.$queryRawUnsafe as jest.Mock).mockReset();
    (prisma.$executeRawUnsafe as jest.Mock).mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('exposes a deterministic QA code only in QA', async () => {
    process.env.PARTNER_QA_VERIFICATION_CODE = '424242';
    const { service } = build();
    await expect(
      service.requestContactCode('app-1', 'a'.repeat(40), PartnerContactChannel.EMAIL),
    ).resolves.toMatchObject({ code: '424242', provider: VerificationProvider.QA });
  });

  it('creates a Mailjet challenge when Mailjet is the selected production email provider', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PARTNER_EMAIL_PROVIDER = 'MAILJET';
    process.env.MAILJET_API_KEY = 'mailjet-public';
    process.env.MAILJET_SECRET_KEY = 'mailjet-secret';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verified@example.com';
    const { service, challenges } = build({
      delivery: {
        deliver: jest.fn().mockResolvedValue({
          provider: VerificationProvider.MAILJET,
          deliveryId: 'mailjet-message-1',
          correlationId: 'corr-mailjet',
          httpStatus: 200,
        }),
      },
    });

    await expect(
      service.requestContactCode('app-1', 'a'.repeat(40), PartnerContactChannel.EMAIL),
    ).resolves.toMatchObject({ provider: VerificationProvider.MAILJET });
    expect(challenges.create).toHaveBeenCalledWith(
      expect.objectContaining({
        method: VerificationMethod.EMAIL_CODE,
        provider: VerificationProvider.MAILJET,
      }),
    );
  });

  it('does not expose a verification code in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PARTNER_EMAIL_PROVIDER = 'MAILJET';
    process.env.MAILJET_API_KEY = 'mailjet-public';
    process.env.MAILJET_SECRET_KEY = 'mailjet-secret';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verified@example.com';
    const { service } = build({
      delivery: {
        deliver: jest.fn().mockResolvedValue({
          provider: VerificationProvider.MAILJET,
          deliveryId: 'mailjet-message-1',
          correlationId: 'corr-1',
          httpStatus: 200,
        }),
      },
    });
    const result = await service.requestContactCode(
      'app-1',
      'a'.repeat(40),
      PartnerContactChannel.EMAIL,
    );
    expect(result).not.toHaveProperty('code');
  });

  it('failed Mailjet delivery keeps the previous valid challenge active', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PARTNER_EMAIL_PROVIDER = 'MAILJET';
    process.env.MAILJET_API_KEY = 'mailjet-public';
    process.env.MAILJET_SECRET_KEY = 'mailjet-secret';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verified@example.com';
    const failure = new PartnerVerificationDeliveryException(
      'Provider rejected',
      VerificationProvider.MAILJET,
      'MAILJET_REJECTED',
      'corr-1',
      422,
    );
    const { service, challenges } = build({
      delivery: { deliver: jest.fn().mockRejectedValue(failure) },
    });
    await expect(
      service.requestContactCode('app-1', 'a'.repeat(40), PartnerContactChannel.EMAIL),
    ).rejects.toBe(failure);
    expect(challenges.supersedeActive).not.toHaveBeenCalled();
  });

  it('enforces the verification attempt limit', async () => {
    const { service } = build({
      challenges: {
        latestSentCode: jest.fn().mockResolvedValue({
          id: 'challenge-1',
          method: VerificationMethod.EMAIL_CODE,
          provider: VerificationProvider.QA,
          attemptCount: 5,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    });
    await expect(service.verifyContact('app-1', 'a'.repeat(40), '424242')).rejects.toThrow(
      'Verification attempt limit reached',
    );
  });

  it('checks application-token ownership before PNV token verification', async () => {
    const { service, firebasePnv } = build({
      applications: {
        requireApplication: jest
          .fn()
          .mockRejectedValue(new UnauthorizedException('Application access could not be verified')),
      },
    });
    await expect(service.verifyPnv('app-1', 'wrong-token', 'x'.repeat(80))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(firebasePnv.verifySignedToken).not.toHaveBeenCalled();
  });

  it('rejects a nonce mismatch', async () => {
    const { service } = build({
      challenges: { activePnvByNonce: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.verifyPnv('app-1', 'a'.repeat(40), 'x'.repeat(80))).rejects.toMatchObject({
      safeCode: 'PNV_NONCE_MISMATCH',
    });
  });

  it('rejects a replayed jti', async () => {
    const { service } = build({
      challenges: {
        activePnvByNonce: jest.fn().mockResolvedValue({
          id: 'pnv-1',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        hasTokenJti: jest.fn().mockResolvedValue(true),
      },
    });
    await expect(service.verifyPnv('app-1', 'a'.repeat(40), 'x'.repeat(80))).rejects.toMatchObject({
      safeCode: 'PNV_TOKEN_REPLAYED',
    });
  });

  it('rejects a phone mismatch without replacing the application number', async () => {
    const { service } = build({
      challenges: {
        activePnvByNonce: jest.fn().mockResolvedValue({
          id: 'pnv-1',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        hasTokenJti: jest.fn().mockResolvedValue(false),
      },
      firebasePnv: {
        verifySignedToken: jest.fn().mockResolvedValue({
          jti: 'jti-2',
          nonce: 'nonce-1',
          phoneNumber: '+918888888888',
        }),
      },
    });
    await expect(service.verifyPnv('app-1', 'a'.repeat(40), 'x'.repeat(80))).rejects.toMatchObject({
      safeCode: 'PNV_PHONE_MISMATCH',
    });
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalledWith(
      expect.stringContaining('phoneE164'),
      expect.anything(),
    );
  });

  it('readiness reports the active provider without exposing credentials or contacts', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PARTNER_EMAIL_PROVIDER = 'MAILJET';
    process.env.MAILJET_API_KEY = 'mailjet-public-secret-like';
    process.env.MAILJET_SECRET_KEY = 'mailjet-private-super-secret';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verified@example.com';
    process.env.RESEND_API_KEY = 'resend-super-secret';
    process.env.TWILIO_ACCOUNT_SID = 'ACsecret';
    process.env.TWILIO_AUTH_TOKEN = 'twilio-super-secret';
    process.env.TWILIO_FROM_PHONE = '+15551234567';
    const { service } = build();
    const readiness = await service.readiness();
    expect(readiness.activeEmailProvider).toBe(VerificationProvider.MAILJET);
    expect(readiness.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: VerificationProvider.MAILJET, configured: true }),
        expect.objectContaining({ provider: VerificationProvider.RESEND, configured: true }),
      ]),
    );
    const output = JSON.stringify(readiness);
    expect(output).not.toContain('mailjet-public-secret-like');
    expect(output).not.toContain('mailjet-private-super-secret');
    expect(output).not.toContain('resend-super-secret');
    expect(output).not.toContain('twilio-super-secret');
    expect(output).not.toContain('partner@example.com');
    expect(output).not.toContain('+919999999999');
  });
});
