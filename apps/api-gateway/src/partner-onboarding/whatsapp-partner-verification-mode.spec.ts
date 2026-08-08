import { BadRequestException } from '@nestjs/common';
import { PartnerContactChannel } from './partner-onboarding.types';
import { PhonePrimaryPartnerVerificationService } from './phone-primary-partner-verification.service';
import { VerificationProvider } from './verification.types';

function makeService() {
  const challenges = {
    lastSuccessfulProviderCheck: jest.fn().mockResolvedValue(null),
  };
  const service = new PhonePrimaryPartnerVerificationService(
    {} as any,
    {} as any,
    {} as any,
    challenges as any,
    {} as any,
  );
  return { service, challenges };
}

describe('WhatsApp partner verification mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      PARTNER_PHONE_VERIFICATION_MODE: 'SMS_ONLY',
      PARTNER_SMS_PROVIDER: 'WHATSAPP',
      PARTNER_EMAIL_PROVIDER: 'MAILJET',
      MAILJET_API_KEY: 'mailjet-key',
      MAILJET_SECRET_KEY: 'mailjet-secret',
      PARTNER_VERIFICATION_FROM_EMAIL: 'verify@example.com',
      WHATSAPP_ACCESS_TOKEN: 'whatsapp-access-token',
      WHATSAPP_PHONE_NUMBER_ID: '1322702964249664',
      WHATSAPP_BUSINESS_ACCOUNT_ID: '2471999716613292',
      WHATSAPP_GRAPH_API_VERSION: 'v23.0',
      WHATSAPP_OTP_TEMPLATE_NAME: 'authentication_code_copy_code_button',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-token-at-least-16-chars',
      WHATSAPP_APP_SECRET: 'app-secret-at-least-16-chars',
      // Deliberately leave Firebase configured to prove SMS_ONLY disables PNV.
      FIREBASE_PROJECT_ID: 'firebase-project',
      FIREBASE_PROJECT_NUMBER: '123456789',
    };
    delete process.env.PLAYWRIGHT_QA;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('selects WhatsApp as the partner phone-code provider in SMS_ONLY mode', async () => {
    const { service } = makeService();
    const capabilities = await service.capabilities();

    expect(capabilities.phone).toMatchObject({
      available: true,
      preferredMethod: 'SMS_OTP',
      preferredProvider: VerificationProvider.WHATSAPP,
      fallbackProvider: VerificationProvider.WHATSAPP,
      smsConfigured: true,
      pnvConfigured: false,
    });
    expect(
      (service as any).providerFor(PartnerContactChannel.PHONE),
    ).toBe(VerificationProvider.WHATSAPP);
  });

  it('reports WhatsApp active/configured and Firebase inactive in readiness', async () => {
    const { service } = makeService();
    const readiness = await service.readiness();
    const byProvider = Object.fromEntries(
      readiness.providers.map((entry: any) => [entry.provider, entry]),
    );

    expect(readiness.activeSmsProvider).toBe(VerificationProvider.WHATSAPP);
    expect(byProvider.WHATSAPP).toMatchObject({ active: true, configured: true });
    expect(byProvider.TWILIO).toMatchObject({ active: false });
    expect(byProvider.FIREBASE_PNV).toMatchObject({
      active: false,
      configured: false,
    });
  });

  it('blocks Firebase PNV challenge creation and verification in SMS_ONLY mode', async () => {
    const { service } = makeService();

    await expect(service.createPnvChallenge('app-1', 'access-token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.verifyPnv('app-1', 'access-token', 'firebase-token'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
