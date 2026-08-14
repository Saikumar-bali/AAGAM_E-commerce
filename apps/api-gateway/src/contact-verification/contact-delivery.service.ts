import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { WhatsAppCloudService } from '../whatsapp-webhook/whatsapp-cloud.service';

export type ContactOtpChannel = 'PHONE' | 'EMAIL';
export type ContactOtpPurpose = 'CUSTOMER_LOGIN' | 'CUSTOMER_SIGNUP' | 'PARTNER_RESUME' | 'PASSWORD_RESET';

export type ContactDeliveryInput = {
  channel: ContactOtpChannel;
  destination: string;
  code: string;
  purpose: ContactOtpPurpose;
  expiresAt: Date;
  reference?: string | null;
  correlationId: string;
};

export type ContactDeliveryResult = {
  provider: 'QA' | 'TWILIO' | 'WHATSAPP' | 'MAILJET' | 'RESEND';
  deliveryId: string;
};

@Injectable()
export class ContactDeliveryService {
  constructor(private readonly whatsapp: WhatsAppCloudService) {}

  async deliver(input: ContactDeliveryInput): Promise<ContactDeliveryResult> {
    if (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true') {
      return { provider: 'QA', deliveryId: `qa-${input.correlationId}` };
    }
    return input.channel === 'PHONE' ? this.sendSms(input) : this.sendEmail(input);
  }

  private async sendSms(input: ContactDeliveryInput): Promise<ContactDeliveryResult> {
    const provider = (process.env.PARTNER_SMS_PROVIDER || 'TWILIO').trim().toUpperCase();
    if (provider === 'WHATSAPP') return this.sendWhatsApp(input);
    if (provider !== 'TWILIO') {
      throw new ServiceUnavailableException({
        message: 'Phone verification provider is not supported',
        code: 'PHONE_PROVIDER_INVALID',
        correlationId: input.correlationId,
      });
    }
    return this.sendTwilio(input);
  }

  private async sendWhatsApp(input: ContactDeliveryInput): Promise<ContactDeliveryResult> {
    try {
      const result = await this.whatsapp.sendOtp(input.destination, input.code);
      return { provider: 'WHATSAPP', deliveryId: result.messageId };
    } catch (error: any) {
      const response = typeof error?.getResponse === 'function' ? error.getResponse() : {};
      throw new ServiceUnavailableException({
        message: response?.message || 'WhatsApp verification could not be delivered',
        code: this.safeCode(response?.code, 'WHATSAPP_DELIVERY_FAILED'),
        correlationId: input.correlationId,
      });
    }
  }

  private async sendTwilio(input: ContactDeliveryInput): Promise<ContactDeliveryResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    // WILIO_FROM_PHONE is accepted temporarily because an earlier setup guide contained
    // that typo. TWILIO_FROM_PHONE remains the canonical production variable.
    const from = (process.env.TWILIO_FROM_PHONE || process.env.WILIO_FROM_PHONE)?.trim();
    if (!accountSid || !authToken || !from) {
      throw new ServiceUnavailableException({
        message: 'SMS verification is not configured',
        code: 'TWILIO_UNCONFIGURED',
        correlationId: input.correlationId,
      });
    }

    let response: Response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: input.destination,
            From: from,
            Body: this.text(input),
          }).toString(),
        },
      );
    } catch {
      throw new ServiceUnavailableException({
        message: 'SMS verification could not be delivered',
        code: 'TWILIO_NETWORK_ERROR',
        correlationId: input.correlationId,
      });
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new ServiceUnavailableException({
        message: 'SMS verification could not be delivered',
        code: this.safeCode(payload.code, 'TWILIO_REJECTED'),
        correlationId: input.correlationId,
      });
    }
    return {
      provider: 'TWILIO',
      deliveryId: String(payload.sid || `twilio-${input.correlationId}`),
    };
  }

  private async sendEmail(input: ContactDeliveryInput): Promise<ContactDeliveryResult> {
    const configured = (process.env.PARTNER_EMAIL_PROVIDER || '').trim().toUpperCase();
    const provider = configured || (process.env.MAILJET_API_KEY ? 'MAILJET' : 'RESEND');
    return provider === 'MAILJET' ? this.sendMailjet(input) : this.sendResend(input);
  }

  private async sendMailjet(input: ContactDeliveryInput): Promise<ContactDeliveryResult> {
    const apiKey = process.env.MAILJET_API_KEY?.trim();
    const secretKey = process.env.MAILJET_SECRET_KEY?.trim();
    const sender = this.sender();
    if (!apiKey || !secretKey || !sender) {
      throw new ServiceUnavailableException({
        message: 'Email verification is not configured',
        code: 'MAILJET_UNCONFIGURED',
        correlationId: input.correlationId,
      });
    }
    let response: Response;
    try {
      response = await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Messages: [
            {
              From: sender,
              To: [{ Email: input.destination }],
              Subject: 'Your AAGAM verification code',
              TextPart: this.text(input),
              HTMLPart: this.html(input),
              CustomID: input.correlationId,
            },
          ],
        }),
      });
    } catch {
      throw new ServiceUnavailableException({
        message: 'Email verification could not be delivered',
        code: 'MAILJET_NETWORK_ERROR',
        correlationId: input.correlationId,
      });
    }
    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    const message = Array.isArray(payload.Messages) ? payload.Messages[0] : undefined;
    if (!response.ok || String(message?.Status || '').toLowerCase() !== 'success') {
      const error = Array.isArray(message?.Errors) ? message.Errors[0] : undefined;
      throw new ServiceUnavailableException({
        message: 'Email verification could not be delivered',
        code: this.safeCode(error?.ErrorIdentifier || error?.ErrorCode, 'MAILJET_REJECTED'),
        correlationId: input.correlationId,
      });
    }
    const recipient = Array.isArray(message?.To) ? message.To[0] : undefined;
    return {
      provider: 'MAILJET',
      deliveryId: String(recipient?.MessageUUID || recipient?.MessageID || `mailjet-${input.correlationId}`),
    };
  }

  private async sendResend(input: ContactDeliveryInput): Promise<ContactDeliveryResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const sender = this.sender();
    if (!apiKey || !sender) {
      throw new ServiceUnavailableException({
        message: 'Email verification is not configured',
        code: 'RESEND_UNCONFIGURED',
        correlationId: input.correlationId,
      });
    }
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.correlationId,
        },
        body: JSON.stringify({
          from: sender.Name ? `${sender.Name} <${sender.Email}>` : sender.Email,
          to: [input.destination],
          subject: input.purpose === 'PASSWORD_RESET' ? 'Reset your AAGAM password' : 'Your AAGAM verification code',
          text: this.text(input),
          html: this.html(input),
        }),
      });
    } catch {
      throw new ServiceUnavailableException({
        message: 'Email verification could not be delivered',
        code: 'RESEND_NETWORK_ERROR',
        correlationId: input.correlationId,
      });
    }
    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      console.error('[ContactDeliveryService] Resend rejected email', {
        status: response.status,
        code: payload.code || payload.name,
        message: payload.message,
        correlationId: input.correlationId,
      });
      throw new ServiceUnavailableException({
        message: 'Email verification could not be delivered',
        code: this.safeCode(payload.code || payload.name, 'RESEND_REJECTED'),
        correlationId: input.correlationId,
      });
    }
    return { provider: 'RESEND', deliveryId: String(payload.id || `resend-${input.correlationId}`) };
  }

  private text(input: ContactDeliveryInput) {
    const minutes = Math.max(1, Math.ceil((input.expiresAt.getTime() - Date.now()) / 60_000));
    const action =
      input.purpose === 'PASSWORD_RESET'
        ? 'reset your AAGAM password'
        : input.purpose === 'PARTNER_RESUME'
        ? 'resume your Partner application'
        : input.purpose === 'CUSTOMER_SIGNUP'
          ? 'create your Customer account'
          : 'sign in to AAGAM';
    const reference = input.reference ? ` Reference: ${input.reference}.` : '';
    return `Your AAGAM code is ${input.code}. Use it to ${action}. It expires in ${minutes} minutes.${reference} Do not share this code.`;
  }

  private html(input: ContactDeliveryInput) {
    const text = this.escape(this.text(input));
    const code = this.escape(input.code);
    return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:32px"><div style="font-size:23px;font-weight:800">AAGAM verification</div><p style="color:#475569;line-height:1.6">${text}</p><div style="font-size:34px;font-weight:900;letter-spacing:8px;text-align:center;padding:20px;background:#f0fdfa;border-radius:12px;color:#0f766e">${code}</div><p style="font-size:12px;color:#94a3b8">AAGAM support will never ask for this code.</p></div></body></html>`;
  }

  private sender(): { Email: string; Name: string } | null {
    const raw = process.env.PARTNER_VERIFICATION_FROM_EMAIL?.trim();
    if (!raw) return null;
    const match = raw.match(/^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
    const email = (match?.[2] || raw).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    return {
      Email: email,
      Name:
        process.env.PARTNER_VERIFICATION_FROM_NAME?.trim() ||
        match?.[1]?.replace(/^['"]|['"]$/g, '').trim() ||
        'AAGAM Verification',
    };
  }

  private safeCode(value: unknown, fallback: string) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_');
    return normalized ? normalized.slice(0, 80) : fallback;
  }

  private escape(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
