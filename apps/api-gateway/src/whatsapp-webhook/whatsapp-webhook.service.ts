import { ForbiddenException, Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class WhatsAppWebhookService {
  verifySubscription(mode?: string, token?: string, challenge?: string): number {
    const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
    if (!expectedToken) {
      throw new ForbiddenException('WhatsApp webhook verification is not configured');
    }
    if (mode !== 'subscribe' || !token || !this.safeEqual(token, expectedToken)) {
      throw new ForbiddenException('WhatsApp webhook verification failed');
    }
    if (!challenge || !/^\d{1,15}$/.test(challenge)) {
      throw new ForbiddenException('WhatsApp webhook challenge is invalid');
    }
    const verifiedChallenge = Number.parseInt(challenge, 10);
    if (!Number.isSafeInteger(verifiedChallenge) || verifiedChallenge < 0) {
      throw new ForbiddenException('WhatsApp webhook challenge is invalid');
    }
    return verifiedChallenge;
  }

  assertSignature(rawBody: Buffer | undefined, signature?: string) {
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    if (!appSecret) {
      throw new ForbiddenException('WhatsApp webhook signature validation is not configured');
    }
    if (!rawBody?.length || !signature?.startsWith('sha256=')) {
      throw new ForbiddenException('WhatsApp webhook signature is missing');
    }

    const supplied = signature.slice('sha256='.length).trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(supplied)) {
      throw new ForbiddenException('WhatsApp webhook signature is invalid');
    }
    const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
    if (!this.safeEqual(supplied, expected)) {
      throw new ForbiddenException('WhatsApp webhook signature is invalid');
    }
  }

  async handleEvent(payload: Record<string, any>) {
    const statuses: Record<string, any>[] = [];
    let inboundMessages = 0;

    for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        if (change?.field !== 'messages') continue;
        const value = change?.value || {};
        if (Array.isArray(value.messages)) inboundMessages += value.messages.length;
        if (Array.isArray(value.statuses)) statuses.push(...value.statuses);
      }
    }

    for (const status of statuses) {
      await this.recordDeliveryStatus(status);
    }

    // Inbound message bodies are intentionally not persisted here. The webhook is
    // ready for a future support-chat consumer without creating an unreviewed PII store.
    return { statusUpdates: statuses.length, inboundMessages };
  }

  private async recordDeliveryStatus(status: Record<string, any>) {
    const messageId = String(status?.id || '').trim();
    const providerStatus = String(status?.status || '').trim().toLowerCase();
    if (!messageId || !providerStatus) return;

    const statusAt = /^\d+$/.test(String(status?.timestamp || ''))
      ? new Date(Number(status.timestamp) * 1000).toISOString()
      : new Date().toISOString();
    const firstError = Array.isArray(status?.errors) ? status.errors[0] : undefined;
    const failureCode = firstError?.code
      ? `WHATSAPP_${String(firstError.code).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)}`
      : 'WHATSAPP_DELIVERY_FAILED';
    const metadata = JSON.stringify({
      whatsappStatus: providerStatus,
      whatsappStatusAt: statusAt,
      ...(status?.recipient_id ? { whatsappRecipientId: String(status.recipient_id) } : {}),
    });

    if (providerStatus === 'failed') {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "ContactOtpChallenge" SET
            "status" = CASE WHEN "status" IN ('PENDING','SENT') THEN 'FAILED' ELSE "status" END,
            "failureCode" = CASE WHEN "status" IN ('PENDING','SENT') THEN $2 ELSE "failureCode" END,
            "metadata" = COALESCE("metadata", '{}'::jsonb) || $3::jsonb,
            "updatedAt" = CURRENT_TIMESTAMP
           WHERE "provider" = 'WHATSAPP' AND "providerDeliveryId" = $1`,
          messageId,
          failureCode,
          metadata,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "VerificationChallenge" SET
            "status" = CASE
              WHEN "status" IN ('CREATED','DISPATCHING','SENT') THEN 'FAILED'::"VerificationChallengeStatus"
              ELSE "status"
            END,
            "failureCode" = CASE
              WHEN "status" IN ('CREATED','DISPATCHING','SENT') THEN $2
              ELSE "failureCode"
            END,
            "updatedAt" = CURRENT_TIMESTAMP
           WHERE "provider" = 'WHATSAPP'::"VerificationProvider" AND "providerDeliveryId" = $1`,
          messageId,
          failureCode,
        );
      });
      return;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "ContactOtpChallenge" SET
        "metadata" = COALESCE("metadata", '{}'::jsonb) || $2::jsonb,
        "updatedAt" = CURRENT_TIMESTAMP
       WHERE "provider" = 'WHATSAPP' AND "providerDeliveryId" = $1`,
      messageId,
      metadata,
    );
  }

  private safeEqual(left: string, right: string) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
