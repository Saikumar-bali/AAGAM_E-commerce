import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WhatsAppCloudService } from '../whatsapp-webhook/whatsapp-cloud.service';
import { PartnerContactChannel } from './partner-onboarding.types';
import {
  EmailVerificationProvider,
  isVerificationQaMode,
  selectedEmailVerificationProvider,
  VerificationProvider,
} from './verification.types';

export type PartnerVerificationDeliveryInput = {
  applicationId: string;
  channel: PartnerContactChannel;
  email?: string | null;
  phoneE164?: string | null;
  code: string;
  expiresAt: Date;
  applicationNumber: string;
  correlationId?: string;
};

export type PartnerVerificationDeliveryResult = {
  provider:
    | VerificationProvider.QA
    | EmailVerificationProvider
    | VerificationProvider.TWILIO
    | VerificationProvider.WHATSAPP;
  deliveryId: string;
  correlationId: string;
  httpStatus: number;
};

export class PartnerVerificationDeliveryException extends ServiceUnavailableException {
  constructor(
    message: string,
    readonly provider: VerificationProvider,
    readonly safeCode: string,
    readonly correlationId: string,
    readonly httpStatus?: number,
  ) {
    super({ message, code: safeCode, correlationId });
  }
}

@Injectable()
export class PartnerVerificationDeliveryService {
  private readonly logger = new Logger(PartnerVerificationDeliveryService.name);

  constructor(private readonly whatsapp: WhatsAppCloudService) {}

  async deliver(input: PartnerVerificationDeliveryInput): Promise<PartnerVerificationDeliveryResult> {
    const correlationId = input.correlationId || randomUUID();
    if (isVerificationQaMode()) {
      return {
        provider: VerificationProvider.QA,
        deliveryId: `qa-${correlationId}`,
        correlationId,
        httpStatus: 202,
      };
    }
    return input.channel === PartnerContactChannel.EMAIL
      ? this.sendEmail(input, correlationId)
      : this.sendSms(input, correlationId);
  }

  private async sendEmail(
    input: PartnerVerificationDeliveryInput,
    correlationId: string,
  ): Promise<PartnerVerificationDeliveryResult> {
    const provider = selectedEmailVerificationProvider();
    return provider === VerificationProvider.MAILJET
      ? this.sendMailjetEmail(input, correlationId)
      : this.sendResendEmail(input, correlationId);
  }

  private async sendMailjetEmail(
    input: PartnerVerificationDeliveryInput,
    correlationId: string,
  ): Promise<PartnerVerificationDeliveryResult> {
    const apiKey = process.env.MAILJET_API_KEY?.trim();
    const secretKey = process.env.MAILJET_SECRET_KEY?.trim();
    const sender = this.mailjetSender();
    const to = input.email?.trim();
    if (!apiKey || !secretKey || !sender || !to) {
      throw this.failure(
        input,
        VerificationProvider.MAILJET,
        !sender && process.env.PARTNER_VERIFICATION_FROM_EMAIL?.trim()
          ? 'MAILJET_INVALID_FROM'
          : 'MAILJET_UNCONFIGURED',
        correlationId,
        undefined,
        'Partner email verification delivery is not configured',
      );
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
              From: { Email: sender.email, Name: sender.name },
              To: [{ Email: to }],
              Subject: this.subject(input),
              TextPart: this.message(input),
              HTMLPart: this.htmlMessage(input),
              CustomID: correlationId,
            },
          ],
        }),
      });
    } catch {
      throw this.failure(
        input,
        VerificationProvider.MAILJET,
        'MAILJET_NETWORK_ERROR',
        correlationId,
        undefined,
        'Partner email verification could not be delivered',
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    const message = Array.isArray(payload.Messages) ? payload.Messages[0] : undefined;
    const accepted = response.ok && String(message?.Status || '').toLowerCase() === 'success';
    if (!accepted) {
      throw this.failure(
        input,
        VerificationProvider.MAILJET,
        this.mailjetFailureCode(payload),
        correlationId,
        response.status,
        'Partner email verification could not be delivered',
      );
    }

    const recipient = Array.isArray(message?.To) ? message.To[0] : undefined;
    return {
      provider: VerificationProvider.MAILJET,
      deliveryId: String(
        recipient?.MessageUUID || recipient?.MessageID || `mailjet-${correlationId}`,
      ),
      correlationId,
      httpStatus: response.status,
    };
  }

  private async sendResendEmail(
    input: PartnerVerificationDeliveryInput,
    correlationId: string,
  ): Promise<PartnerVerificationDeliveryResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.PARTNER_VERIFICATION_FROM_EMAIL?.trim();
    const to = input.email?.trim();
    if (!apiKey || !from || !to) {
      throw this.failure(
        input,
        VerificationProvider.RESEND,
        'RESEND_UNCONFIGURED',
        correlationId,
        undefined,
        'Partner email verification delivery is not configured',
      );
    }

    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': correlationId,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: this.subject(input),
          text: this.message(input),
          html: this.htmlMessage(input),
        }),
      });
    } catch {
      throw this.failure(
        input,
        VerificationProvider.RESEND,
        'RESEND_NETWORK_ERROR',
        correlationId,
        undefined,
        'Partner email verification could not be delivered',
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      const safeCode = this.safeProviderCode(payload.code || payload.name, 'RESEND_REJECTED');
      throw this.failure(
        input,
        VerificationProvider.RESEND,
        safeCode,
        correlationId,
        response.status,
        'Partner email verification could not be delivered',
      );
    }
    return {
      provider: VerificationProvider.RESEND,
      deliveryId: String(payload.id || `resend-${correlationId}`),
      correlationId,
      httpStatus: response.status,
    };
  }

  private async sendSms(
    input: PartnerVerificationDeliveryInput,
    correlationId: string,
  ): Promise<PartnerVerificationDeliveryResult> {
    const provider = (process.env.PARTNER_SMS_PROVIDER || 'TWILIO').trim().toUpperCase();
    if (provider === VerificationProvider.WHATSAPP) {
      return this.sendWhatsApp(input, correlationId);
    }
    if (provider !== VerificationProvider.TWILIO) {
      throw this.failure(
        input,
        VerificationProvider.TWILIO,
        'PHONE_PROVIDER_INVALID',
        correlationId,
        undefined,
        'Partner phone verification provider is not supported',
      );
    }
    return this.sendTwilioSms(input, correlationId);
  }

  private async sendWhatsApp(
    input: PartnerVerificationDeliveryInput,
    correlationId: string,
  ): Promise<PartnerVerificationDeliveryResult> {
    const to = input.phoneE164?.trim();
    if (!to) {
      throw this.failure(
        input,
        VerificationProvider.WHATSAPP,
        'WHATSAPP_DESTINATION_MISSING',
        correlationId,
        undefined,
        'Partner WhatsApp verification destination is missing',
      );
    }

    try {
      const result = await this.whatsapp.sendOtp(to, input.code);
      return {
        provider: VerificationProvider.WHATSAPP,
        deliveryId: result.messageId,
        correlationId,
        httpStatus: 200,
      };
    } catch (error: any) {
      const response = typeof error?.getResponse === 'function' ? error.getResponse() : {};
      throw this.failure(
        input,
        VerificationProvider.WHATSAPP,
        this.safeProviderCode(response?.code, 'WHATSAPP_DELIVERY_FAILED'),
        correlationId,
        undefined,
        response?.message || 'Partner WhatsApp verification could not be delivered',
      );
    }
  }

  private async sendTwilioSms(
    input: PartnerVerificationDeliveryInput,
    correlationId: string,
  ): Promise<PartnerVerificationDeliveryResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_FROM_PHONE?.trim();
    const to = input.phoneE164?.trim();
    if (!accountSid || !authToken || !from || !to) {
      throw this.failure(
        input,
        VerificationProvider.TWILIO,
        'TWILIO_UNCONFIGURED',
        correlationId,
        undefined,
        'Partner SMS verification delivery is not configured',
      );
    }

    const form = new URLSearchParams({ To: to, From: from, Body: this.message(input) });
    let response: Response;
    try {
      response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Twilio-Webhook-Enabled': 'false',
          },
          body: form.toString(),
        },
      );
    } catch {
      throw this.failure(
        input,
        VerificationProvider.TWILIO,
        'TWILIO_NETWORK_ERROR',
        correlationId,
        undefined,
        'Partner SMS verification could not be delivered',
      );
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      const safeCode = this.safeProviderCode(payload.code, 'TWILIO_REJECTED');
      throw this.failure(
        input,
        VerificationProvider.TWILIO,
        safeCode,
        correlationId,
        response.status,
        'Partner SMS verification could not be delivered',
      );
    }
    return {
      provider: VerificationProvider.TWILIO,
      deliveryId: String(payload.sid || `twilio-${correlationId}`),
      correlationId,
      httpStatus: response.status,
    };
  }

  private mailjetSender(): { email: string; name: string } | null {
    const raw = process.env.PARTNER_VERIFICATION_FROM_EMAIL?.trim();
    if (!raw) return null;

    const bracketed = raw.match(/^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
    const email = (bracketed?.[2] || raw).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

    const rawName = bracketed?.[1]?.replace(/^['"]|['"]$/g, '').trim();
    return {
      email,
      name:
        process.env.PARTNER_VERIFICATION_FROM_NAME?.trim() ||
        rawName ||
        'AAGAM Verification',
    };
  }

  private mailjetFailureCode(payload: Record<string, any>): string {
    const message = Array.isArray(payload.Messages) ? payload.Messages[0] : undefined;
    const error = Array.isArray(message?.Errors) ? message.Errors[0] : undefined;
    return this.safeProviderCode(
      error?.ErrorIdentifier ||
        error?.ErrorCode ||
        payload.ErrorIdentifier ||
        payload.ErrorCode ||
        payload.StatusCode,
      'MAILJET_REJECTED',
    );
  }

  private failure(
    input: PartnerVerificationDeliveryInput,
    provider: VerificationProvider,
    code: string,
    correlationId: string,
    httpStatus: number | undefined,
    message: string,
  ) {
    this.logger.error(
      JSON.stringify({
        event: 'verification_provider_failure',
        provider,
        httpStatus: httpStatus || null,
        providerErrorCode: code,
        correlationId,
        applicationId: input.applicationId,
        timestamp: new Date().toISOString(),
      }),
    );
    return new PartnerVerificationDeliveryException(
      message,
      provider,
      code,
      correlationId,
      httpStatus,
    );
  }

  private safeProviderCode(value: unknown, fallback: string): string {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_');
    return normalized ? normalized.slice(0, 80) : fallback;
  }

  private subject(input: PartnerVerificationDeliveryInput): string {
    return `AAGAM verification code for ${input.applicationNumber}`;
  }

  private message(input: PartnerVerificationDeliveryInput): string {
    const minutes = Math.max(1, Math.ceil((input.expiresAt.getTime() - Date.now()) / 60_000));
    return `Your AAGAM partner verification code is ${input.code}. It expires in ${minutes} minutes. Application: ${input.applicationNumber}. Do not share this code.`;
  }

  private htmlMessage(input: PartnerVerificationDeliveryInput): string {
    const minutes = Math.max(1, Math.ceil((input.expiresAt.getTime() - Date.now()) / 60_000));
    const applicationNumber = this.escapeHtml(input.applicationNumber);
    const code = this.escapeHtml(input.code);
    return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px"><div style="font-size:22px;font-weight:800">AAGAM verification</div><p style="color:#475569;line-height:1.6">Enter this code to verify your partner application.</p><div style="font-size:34px;font-weight:900;letter-spacing:8px;text-align:center;padding:20px;background:#f0fdfa;border-radius:12px;color:#0f766e">${code}</div><p style="color:#475569;line-height:1.6">This code expires in ${minutes} minutes.</p><p style="font-size:13px;color:#64748b">Application: ${applicationNumber}</p><p style="font-size:12px;color:#94a3b8">Do not share this code. AAGAM support will never ask for it.</p></div></body></html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
