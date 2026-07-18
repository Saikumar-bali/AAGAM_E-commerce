import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PartnerContactChannel } from './partner-onboarding.types';
import { isVerificationQaMode, VerificationProvider } from './verification.types';

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
  provider: VerificationProvider.QA | VerificationProvider.RESEND | VerificationProvider.TWILIO;
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

    let response: Response | null = null;
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
          subject: `AAGAM verification code for ${input.applicationNumber}`,
          text: this.message(input),
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
    let response: Response | null = null;
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
    const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
    return normalized ? normalized.slice(0, 80) : fallback;
  }

  private message(input: PartnerVerificationDeliveryInput): string {
    const minutes = Math.max(1, Math.ceil((input.expiresAt.getTime() - Date.now()) / 60_000));
    return `Your AAGAM partner verification code is ${input.code}. It expires in ${minutes} minutes. Application: ${input.applicationNumber}. Do not share this code.`;
  }
}
