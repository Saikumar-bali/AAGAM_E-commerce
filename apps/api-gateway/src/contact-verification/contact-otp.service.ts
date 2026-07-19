import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@aagam/database';
import { createHmac, randomInt, randomUUID } from 'crypto';
import {
  ContactDeliveryService,
  ContactOtpChannel,
  ContactOtpPurpose,
} from './contact-delivery.service';

export type ContactIdentity = {
  channel: ContactOtpChannel;
  destination: string;
  masked: string;
};

export type ContactOtpRequest = ContactIdentity & {
  purpose: ContactOtpPurpose;
  targetId?: string | null;
  reference?: string | null;
  metadata?: Record<string, any>;
};

export function normalizePhoneE164(raw: string): string {
  const input = String(raw || '').trim();
  let compact = input.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = `+${compact.slice(2)}`;
  if (/^\d{10}$/.test(compact)) compact = `+91${compact}`;
  else if (/^91\d{10}$/.test(compact)) compact = `+${compact}`;
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
    throw new BadRequestException('Enter a valid mobile number with country code');
  }
  return compact;
}

export function normalizeEmail(raw: string): string {
  const email = String(raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('Enter a valid email address');
  }
  return email;
}

export function resolveContactIdentifier(raw: string): ContactIdentity {
  const value = String(raw || '').trim();
  if (!value) throw new BadRequestException('Phone number or email is required');
  if (value.includes('@')) {
    const destination = normalizeEmail(value);
    const [local, domain] = destination.split('@');
    const visible = local.length <= 2 ? local[0] : `${local.slice(0, 2)}${'*'.repeat(Math.min(6, local.length - 2))}`;
    return { channel: 'EMAIL', destination, masked: `${visible}@${domain}` };
  }
  const destination = normalizePhoneE164(value);
  return {
    channel: 'PHONE',
    destination,
    masked: `${destination.slice(0, Math.max(3, destination.length - 7))}*****${destination.slice(-2)}`,
  };
}

@Injectable()
export class ContactOtpService {
  private readonly secret: string;

  constructor(
    config: ConfigService,
    private readonly delivery: ContactDeliveryService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET must be configured for OTP protection');
    this.secret = secret;
  }

  async request(input: ContactOtpRequest) {
    const id = randomUUID();
    const correlationId = randomUUID();
    const code = this.code();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const destinationHash = this.destinationHash(input.destination);

    const recent = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "count" FROM "ContactOtpChallenge"
       WHERE "purpose" = $1 AND "destinationHash" = $2
         AND "createdAt" > CURRENT_TIMESTAMP - INTERVAL '10 minutes'`,
      input.purpose,
      destinationHash,
    );
    if (Number(recent[0]?.count || 0) >= 5) {
      throw new HttpException(
        'Too many verification requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "ContactOtpChallenge" SET "status" = 'SUPERSEDED',
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE "purpose" = $1 AND "channel" = $2 AND "destinationHash" = $3
           AND "status" IN ('PENDING','SENT') AND "consumedAt" IS NULL`,
        input.purpose,
        input.channel,
        destinationHash,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "ContactOtpChallenge" (
          "id", "purpose", "channel", "destinationHash", "targetId",
          "codeHash", "status", "expiresAt", "metadata"
        ) VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8::jsonb)`,
        id,
        input.purpose,
        input.channel,
        destinationHash,
        input.targetId || null,
        this.codeHash(id, code),
        expiresAt,
        JSON.stringify({ ...(input.metadata || {}), correlationId }),
      );
    });

    try {
      const result = await this.delivery.deliver({
        channel: input.channel,
        destination: input.destination,
        code,
        purpose: input.purpose,
        expiresAt,
        reference: input.reference,
        correlationId,
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "ContactOtpChallenge" SET "status" = 'SENT', "provider" = $2,
          "providerDeliveryId" = $3, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
        result.provider,
        result.deliveryId,
      );
      return {
        channel: input.channel,
        maskedDestination: input.masked,
        expiresAt,
        correlationId,
        ...(this.qaMode() ? { code } : {}),
      };
    } catch (error: any) {
      const response = typeof error?.getResponse === 'function' ? error.getResponse() : error?.response;
      const failureCode = String(response?.code || 'DELIVERY_FAILED').slice(0, 80);
      await prisma.$executeRawUnsafe(
        `UPDATE "ContactOtpChallenge" SET "status" = 'FAILED', "failureCode" = $2,
          "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
        failureCode,
      );
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        message: 'Verification code could not be delivered',
        code: failureCode,
        correlationId,
      });
    }
  }

  async verify(input: {
    purpose: ContactOtpPurpose;
    channel: ContactOtpChannel;
    destination: string;
    code: string;
  }): Promise<{ targetId: string | null; metadata: Record<string, any> }> {
    const destinationHash = this.destinationHash(input.destination);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "ContactOtpChallenge"
       WHERE "purpose" = $1 AND "channel" = $2 AND "destinationHash" = $3
         AND "status" = 'SENT' AND "consumedAt" IS NULL
       ORDER BY "createdAt" DESC LIMIT 1`,
      input.purpose,
      input.channel,
      destinationHash,
    );
    const challenge = rows[0];
    if (!challenge) throw new BadRequestException('Request a new verification code');
    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ContactOtpChallenge" SET "status" = 'EXPIRED',
          "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        challenge.id,
      );
      throw new BadRequestException('Verification code has expired');
    }
    if (Number(challenge.attemptCount || 0) >= 5) {
      throw new BadRequestException('Verification attempt limit reached');
    }
    if (challenge.codeHash !== this.codeHash(challenge.id, String(input.code || '').trim())) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ContactOtpChallenge" SET "attemptCount" = "attemptCount" + 1,
          "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        challenge.id,
      );
      throw new BadRequestException('Verification code is invalid');
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "ContactOtpChallenge" SET "status" = 'VERIFIED',
        "consumedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "status" = 'SENT' AND "consumedAt" IS NULL`,
      challenge.id,
    );
    return {
      targetId: challenge.targetId || null,
      metadata: (challenge.metadata || {}) as Record<string, any>,
    };
  }

  private qaMode() {
    return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true';
  }

  private code() {
    return this.qaMode()
      ? process.env.PARTNER_QA_VERIFICATION_CODE || '424242'
      : String(randomInt(100000, 1000000));
  }

  private destinationHash(destination: string) {
    return createHmac('sha256', this.secret)
      .update(`destination:${destination.trim().toLowerCase()}`)
      .digest('hex');
  }

  private codeHash(id: string, code: string) {
    return createHmac('sha256', this.secret).update(`code:${id}:${code}`).digest('hex');
  }
}
