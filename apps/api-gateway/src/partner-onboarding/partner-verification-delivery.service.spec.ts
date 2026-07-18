import { ServiceUnavailableException } from '@nestjs/common';
import { PartnerContactChannel } from './partner-onboarding.types';
import { PartnerVerificationDeliveryService } from './partner-verification-delivery.service';

describe('PartnerVerificationDeliveryService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
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

  const input = {
    channel: PartnerContactChannel.EMAIL,
    email: 'partner@example.com',
    phoneE164: '+919999999999',
    code: '123456',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    applicationNumber: 'AAG-RID-2026-ABC123',
  };

  it('keeps automated tests network-free while preserving the delivery contract', async () => {
    process.env.NODE_ENV = 'test';
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;

    await expect(new PartnerVerificationDeliveryService().deliver(input)).resolves.toEqual({
      provider: 'QA',
      deliveryId: 'qa-delivery-suppressed',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('delivers email codes through Resend in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.PARTNER_VERIFICATION_FROM_EMAIL = 'AAGAM <verify@example.com>';
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email_123' }),
    });
    global.fetch = fetchSpy as any;

    await expect(new PartnerVerificationDeliveryService().deliver(input)).resolves.toEqual({
      provider: 'RESEND',
      deliveryId: 'email_123',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetchSpy.mock.calls[0][1];
    expect(request.body).toContain('123456');
    expect(request.body).toContain('partner@example.com');
  });

  it('delivers phone codes through Twilio in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_FROM_PHONE = '+15551234567';
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SM123' }),
    });
    global.fetch = fetchSpy as any;

    await expect(
      new PartnerVerificationDeliveryService().deliver({
        ...input,
        channel: PartnerContactChannel.PHONE,
      }),
    ).resolves.toEqual({ provider: 'TWILIO', deliveryId: 'SM123' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('AC123:secret').toString('base64')}`,
        }),
      }),
    );
    const request = fetchSpy.mock.calls[0][1];
    expect(request.body).toContain('To=%2B919999999999');
    expect(request.body).toContain('123456');
  });

  it('fails closed instead of claiming an unconfigured delivery succeeded', async () => {
    process.env.NODE_ENV = 'production';
    await expect(new PartnerVerificationDeliveryService().deliver(input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
