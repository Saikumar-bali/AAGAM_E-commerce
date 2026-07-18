import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PartnerContactChannel } from './partner-onboarding.types';

export type PartnerVerificationDeliveryInput = {
  channel: PartnerContactChannel;
  email?: string | null;
  phoneE164?: string | null;
  code: string;
  expiresAt: Date;
  applicationNumber: string;
};

export type PartnerVerificationDeliveryResult = {
  provider: 'QA' | 'RESEND' | 'TWILIO';
  deliveryId: string;
};

@Injectable()
export class PartnerVerificationDeliveryService {
  private isQaEnvironment(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true';
  }

  async deliver(
    input: PartnerVerificationDeliveryInput,
  ): Promise<PartnerVerificationDeliveryResult> {
    if (this.isQaEnvironment()) {
      return { provider: 'QA', deliveryId: 'qa-delivery-suppressed' };
    }

    if (input.channel === PartnerContactChannel.EMAIL) {
      return this.sendEmail(input);
    }
    return this.sendSms(input);
  }

  private async sendEmail(
    input: PartnerVerificationDeliveryInput,
  ): Promise<PartnerVerificationDeliveryResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.PARTNER_VERIFICATION_FROM_EMAIL?.trim();
    const to = input.email?.trim();
    if (!apiKey || !from || !to) {
      throw new ServiceUnavailableException(
        'Partner email verification delivery is not configured',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `AAGAM verification code for ${input.applicationNumber}`,
        text: this.message(input),
      }),
    }).catch(() => null);

    if (!response?.ok) {
      throw new ServiceUnavailableException(
        'Partner email verification could not be delivered',
      );
    }
    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return {
      provider: 'RESEND',
      deliveryId: payload.id || 'resend-accepted',
    };
  }

  private async sendSms(
    input: PartnerVerificationDeliveryInput,
  ): Promise<PartnerVerificationDeliveryResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const from = process.env.TWILIO_FROM_PHONE?.trim();
    const to = input.phoneE164?.trim();
    if (!accountSid || !authToken || !from || !to) {
      throw new ServiceUnavailableException(
        'Partner SMS verification delivery is not configured',
      );
    }

    const form = new URLSearchParams({
      To: to,
      From: from,
      Body: this.message(input),
    });
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    ).catch(() => null);

    if (!response?.ok) {
      throw new ServiceUnavailableException(
        'Partner SMS verification could not be delivered',
      );
    }
    const payload = (await response.json().catch(() => ({}))) as { sid?: string };
    return {
      provider: 'TWILIO',
      deliveryId: payload.sid || 'twilio-accepted',
    };
  }

  private message(input: PartnerVerificationDeliveryInput): string {
    const minutes = Math.max(
      1,
      Math.ceil((input.expiresAt.getTime() - Date.now()) / 60_000),
    );
    return `Your AAGAM partner verification code is ${input.code}. It expires in ${minutes} minutes. Application: ${input.applicationNumber}. Do not share this code.`;
  }
}
