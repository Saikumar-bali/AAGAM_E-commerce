import { PartnerContactChannel } from './partner-onboarding.types';
import {
  PartnerVerificationDeliveryException,
  PartnerVerificationDeliveryService,
} from './partner-verification-delivery.service';

const input = {
  applicationId: 'app-1',
  channel: PartnerContactChannel.EMAIL,
  email: 'partner@example.com',
  phoneE164: '+919999999999',
  code: '123456',
  expiresAt: new Date(Date.now() + 600_000),
  applicationNumber: 'AAG-RID-2026-ABC123',
};

describe('PartnerVerificationDeliveryService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.PLAYWRIGHT_QA;
    delete process.env.RESEND_API_KEY;
    delete process.env.PARTNER_VERIFICATION_FROM_EMAIL;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_PHONE;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('Resend accepted', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verify@example.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ id: 'email-1' }),
    }) as any;
    await expect(new PartnerVerificationDeliveryService().deliver(input)).resolves.toEqual(
      expect.objectContaining({ provider: 'RESEND', deliveryId: 'email-1', httpStatus: 202 }),
    );
  });

  it('Resend rejected with a sanitized code', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verify@example.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ name: 'invalid from address!' }),
    }) as any;
    await expect(new PartnerVerificationDeliveryService().deliver(input)).rejects.toMatchObject({
      safeCode: 'INVALID_FROM_ADDRESS_',
      httpStatus: 422,
    });
  });

  it('Resend unconfigured', async () => {
    await expect(new PartnerVerificationDeliveryService().deliver(input)).rejects.toMatchObject({
      safeCode: 'RESEND_UNCONFIGURED',
    });
  });

  it('Twilio accepted', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_FROM_PHONE = '+15551234567';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: 'SM123' }),
    }) as any;
    await expect(
      new PartnerVerificationDeliveryService().deliver({
        ...input,
        channel: PartnerContactChannel.PHONE,
      }),
    ).resolves.toEqual(expect.objectContaining({ provider: 'TWILIO', deliveryId: 'SM123' }));
  });

  it('Twilio rejected', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_FROM_PHONE = '+15551234567';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 21608 }),
    }) as any;
    await expect(
      new PartnerVerificationDeliveryService().deliver({
        ...input,
        channel: PartnerContactChannel.PHONE,
      }),
    ).rejects.toMatchObject({ safeCode: '21608', httpStatus: 400 });
  });

  it('Twilio unconfigured', async () => {
    await expect(
      new PartnerVerificationDeliveryService().deliver({
        ...input,
        channel: PartnerContactChannel.PHONE,
      }),
    ).rejects.toBeInstanceOf(PartnerVerificationDeliveryException);
  });
});
