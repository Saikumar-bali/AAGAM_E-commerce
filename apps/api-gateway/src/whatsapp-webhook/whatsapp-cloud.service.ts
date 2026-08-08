import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type WhatsAppSendResult = {
  messageId: string;
};

@Injectable()
export class WhatsAppCloudService {
  async sendOtp(destination: string, code: string): Promise<WhatsAppSendResult> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const graphVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
    const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME?.trim();
    const languageCode =
      process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE_CODE?.trim() || 'en_US';

    if (!accessToken || !phoneNumberId || !graphVersion || !templateName) {
      throw new ServiceUnavailableException({
        message: 'WhatsApp verification is not configured',
        code: 'WHATSAPP_UNCONFIGURED',
      });
    }
    if (!/^v\d+\.\d+$/.test(graphVersion)) {
      throw new ServiceUnavailableException({
        message: 'WhatsApp Graph API version is invalid',
        code: 'WHATSAPP_GRAPH_VERSION_INVALID',
      });
    }

    const recipient = destination.replace(/^\+/, '');
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: recipient,
            type: 'template',
            template: {
              name: templateName,
              language: { code: languageCode },
              // Authentication COPY_CODE templates use the OTP once in the body and
              // once as the dynamic URL/button parameter behind Meta's Copy Code CTA.
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: code }],
                },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [{ type: 'text', text: code }],
                },
              ],
            },
          }),
        },
      );
    } catch {
      throw new ServiceUnavailableException({
        message: 'WhatsApp verification could not be delivered',
        code: 'WHATSAPP_NETWORK_ERROR',
      });
    }

    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      const metaError = payload?.error || {};
      const code = this.safeCode(
        metaError.error_subcode || metaError.code || metaError.type,
        'WHATSAPP_REJECTED',
      );
      throw new ServiceUnavailableException({
        message: 'WhatsApp verification could not be delivered',
        code,
      });
    }

    const messageId = String(payload?.messages?.[0]?.id || '').trim();
    if (!messageId) {
      throw new ServiceUnavailableException({
        message: 'WhatsApp accepted the request without a message id',
        code: 'WHATSAPP_MISSING_MESSAGE_ID',
      });
    }
    return { messageId };
  }

  async sendText(destination: string, body: string): Promise<WhatsAppSendResult> {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const graphVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
    if (!accessToken || !phoneNumberId || !graphVersion) {
      throw new ServiceUnavailableException({
        message: 'WhatsApp messaging is not configured',
        code: 'WHATSAPP_UNCONFIGURED',
      });
    }
    if (!/^v\d+\.\d+$/.test(graphVersion)) {
      throw new ServiceUnavailableException({
        message: 'WhatsApp Graph API version is invalid',
        code: 'WHATSAPP_GRAPH_VERSION_INVALID',
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: destination.replace(/^\+/, ''),
          type: 'text',
          text: { preview_url: false, body },
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
    if (!response.ok) {
      throw new ServiceUnavailableException({
        message: 'WhatsApp message could not be delivered',
        code: this.safeCode(payload?.error?.code, 'WHATSAPP_REJECTED'),
      });
    }
    const messageId = String(payload?.messages?.[0]?.id || '').trim();
    if (!messageId) {
      throw new ServiceUnavailableException({
        message: 'WhatsApp accepted the request without a message id',
        code: 'WHATSAPP_MISSING_MESSAGE_ID',
      });
    }
    return { messageId };
  }

  private safeCode(value: unknown, fallback: string) {
    const normalized = String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_');
    return normalized ? `WHATSAPP_${normalized.slice(0, 64)}` : fallback;
  }
}
