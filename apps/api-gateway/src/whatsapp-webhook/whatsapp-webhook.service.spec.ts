import { ForbiddenException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

describe('WhatsAppWebhookService', () => {
  const originalVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const originalAppSecret = process.env.WHATSAPP_APP_SECRET;
  let service: WhatsAppWebhookService;

  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-verify-token-123456789';
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret-1234567890';
    service = new WhatsAppWebhookService();
  });

  afterAll(() => {
    if (originalVerifyToken === undefined) delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    else process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = originalVerifyToken;
    if (originalAppSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = originalAppSecret;
  });

  it('returns the Meta challenge only for the configured verify token', () => {
    expect(
      service.verifySubscription(
        'subscribe',
        'test-verify-token-123456789',
        '123456',
      ),
    ).toBe('123456');

    expect(() =>
      service.verifySubscription('subscribe', 'wrong-token', '123456'),
    ).toThrow(ForbiddenException);
  });

  it('accepts a valid X-Hub-Signature-256 over the exact raw body', () => {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${createHmac(
      'sha256',
      'test-app-secret-1234567890',
    )
      .update(rawBody)
      .digest('hex')}`;

    expect(() => service.assertSignature(rawBody, signature)).not.toThrow();
    expect(() =>
      service.assertSignature(Buffer.from('{"tampered":true}'), signature),
    ).toThrow(ForbiddenException);
  });

  it('rejects webhook POSTs when signature configuration is missing', () => {
    delete process.env.WHATSAPP_APP_SECRET;
    expect(() =>
      service.assertSignature(Buffer.from('{}'), `sha256=${'0'.repeat(64)}`),
    ).toThrow(ForbiddenException);
  });
});
