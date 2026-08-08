import { WhatsAppCloudService } from '../whatsapp-webhook/whatsapp-cloud.service';
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
  let whatsapp: { sendOtp: jest.Mock };

  const delivery = () =>
    new PartnerVerificationDeliveryService(
      whatsapp as unknown as WhatsAppCloudService,
    );

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.PLAYWRIGHT_QA;
    delete process.env.PARTNER_EMAIL_PROVIDER;
    delete process.env.PARTNER_SMS_PROVIDER;
    delete process.env.MAILJET_API_KEY;
    delete process.env.MAILJET_SECRET_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.PARTNER_VERIFICATION_FROM_EMAIL;
    delete process.env.PARTNER_VERIFICATION_FROM_NAME;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_PHONE;
    whatsapp = { sendOtp: jest.fn() };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('Mailjet accepted with a validated sender and persists its message UUID', async () => {
    process.env.PARTNER_EMAIL_PROVIDER = 'MAILJET';
    process.env.MAILJET_API_KEY = 'mailjet-public';
    process.env.MAILJET_SECRET_KEY = 'mailjet-secret';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'AAGAM Team <verified@example.com>';
    process.env.PARTNER_VERIFICATION_FROM_NAME = 'AAGAM Verification';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Messages: [
          {
            Status: 'success',
            To: [{ MessageID: 123, MessageUUID: 'mailjet-message-uuid' }],
          },
        ],
      }),
    }) as any;

    await expect(delivery().deliver(input)).resolves.toEqual(
      expect.objectContaining({
        provider: 'MAILJET',
        deliveryId: 'mailjet-message-uuid',
        httpStatus: 200,
      }),
    );

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.mailjet.com/v3.1/send');
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from('mailjet-public:mailjet-secret').toString('base64')}`,
    );
    const body = JSON.parse(options.body);
    expect(body.Messages[0]).toMatchObject({
      From: { Email: 'verified@example.com', Name: 'AAGAM Verification' },
      To: [{ Email: 'partner@example.com' }],
      Subject: 'AAGAM verification code for AAG-RID-2026-ABC123',
    });
    expect(body.Messages[0].TextPart).toContain('123456');
    expect(body.Messages[0].HTMLPart).toContain('123456');
    expect(options.body).not.toContain('mailjet-secret');
  });

  it('Mailjet treats an HTTP 200 message-level error as rejected', async () => {
    process.env.PARTNER_EMAIL_PROVIDER = 'MAILJET';
    process.env.MAILJET_API_KEY = 'mailjet-public';
    process.env.MAILJET_SECRET_KEY = 'mailjet-secret';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verified@example.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Messages: [
          {
            Status: 'error',
            Errors: [{ ErrorIdentifier: 'mj-001 bad sender!' }],
          },
        ],
      }),
    }) as any;

    await expect(delivery().deliver(input)).rejects.toMatchObject({
      provider: 'MAILJET',
      safeCode: 'MJ-001_BAD_SENDER_',
      httpStatus: 200,
    });
  });

  it('Mailjet maps an HTTP rejection to a safe provider code', async () => {
    process.env.PARTNER_EMAIL_PROVIDER = 'MAILJET';
    process.env.MAILJET_API_KEY = 'mailjet-public';
    process.env.MAILJET_SECRET_KEY = 'mailjet-secret';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verified@example.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ ErrorIdentifier: 'unauthorized credentials' }),
    }) as any;

    await expect(delivery().deliver(input)).rejects.toMatchObject({
      safeCode: 'UNAUTHORIZED_CREDENTIALS',
      httpStatus: 401,
    });
  });

  it('Mailjet rejects missing credentials or an invalid sender without making a request', async () => {
    process.env.PARTNER_EMAIL_PROVIDER = 'MAILJET';
    process.env.MAILJET_API_KEY = 'mailjet-public';
    process.env.MAILJET_SECRET_KEY = 'mailjet-secret';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'not-an-email';
    global.fetch = jest.fn() as any;

    await expect(delivery().deliver(input)).rejects.toMatchObject({
      safeCode: 'MAILJET_INVALID_FROM',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('Resend remains selectable for a future owned domain', async () => {
    process.env.PARTNER_EMAIL_PROVIDER = 'RESEND';
    process.env.RESEND_API_KEY = 're_test';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verify@example.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ id: 'email-1' }),
    }) as any;

    await expect(delivery().deliver(input)).resolves.toEqual(
      expect.objectContaining({ provider: 'RESEND', deliveryId: 'email-1', httpStatus: 202 }),
    );
  });

  it('Resend rejected with a sanitized code', async () => {
    process.env.PARTNER_EMAIL_PROVIDER = 'RESEND';
    process.env.RESEND_API_KEY = 're_test';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'verify@example.com';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ name: 'invalid from address!' }),
    }) as any;
    await expect(delivery().deliver(input)).rejects.toMatchObject({
      safeCode: 'INVALID_FROM_ADDRESS_',
      httpStatus: 422,
    });
  });

  it('Resend unconfigured', async () => {
    process.env.PARTNER_EMAIL_PROVIDER = 'RESEND';
    await expect(delivery().deliver(input)).rejects.toMatchObject({
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
      delivery().deliver({
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
      delivery().deliver({
        ...input,
        channel: PartnerContactChannel.PHONE,
      }),
    ).rejects.toMatchObject({ safeCode: '21608', httpStatus: 400 });
  });

  it('Twilio unconfigured', async () => {
    await expect(
      delivery().deliver({
        ...input,
        channel: PartnerContactChannel.PHONE,
      }),
    ).rejects.toBeInstanceOf(PartnerVerificationDeliveryException);
  });

  it('WhatsApp accepted through the selected phone provider', async () => {
    process.env.PARTNER_SMS_PROVIDER = 'WHATSAPP';
    global.fetch = jest.fn() as any;
    whatsapp.sendOtp.mockResolvedValue({ messageId: 'wamid.test-123' });

    await expect(
      delivery().deliver({
        ...input,
        channel: PartnerContactChannel.PHONE,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        provider: 'WHATSAPP',
        deliveryId: 'wamid.test-123',
        httpStatus: 200,
      }),
    );
    expect(whatsapp.sendOtp).toHaveBeenCalledWith('+919999999999', '123456');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('QA mode never calls Mailjet, Resend, Twilio or WhatsApp', async () => {
    process.env.NODE_ENV = 'test';
    process.env.PARTNER_SMS_PROVIDER = 'WHATSAPP';
    global.fetch = jest.fn() as any;
    await expect(delivery().deliver(input)).resolves.toMatchObject({
      provider: 'QA',
      httpStatus: 202,
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(whatsapp.sendOtp).not.toHaveBeenCalled();
  });
});
