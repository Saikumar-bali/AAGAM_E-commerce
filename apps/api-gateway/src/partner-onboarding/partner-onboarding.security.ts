import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class PartnerOnboardingSecurity {
  private readonly pepper: string;
  private readonly encryptionKey: Buffer;

  constructor(config: ConfigService) {
    const jwtSecret = config.get<string>('JWT_SECRET');
    if (!jwtSecret) throw new Error('JWT_SECRET is required for partner onboarding');
    this.pepper = config.get<string>('PARTNER_ONBOARDING_PEPPER') || jwtSecret;
    const encryptionSecret =
      config.get<string>('PARTNER_DATA_ENCRYPTION_KEY') || jwtSecret;
    this.encryptionKey = createHash('sha256').update(encryptionSecret).digest();
  }

  hash(value: string): string {
    return createHash('sha256').update(`${value}:${this.pepper}`).digest('hex');
  }

  verificationHash(applicationId: string, code: string): string {
    return this.hash(`${applicationId}:${code}`);
  }

  issueAccessToken(): string {
    return randomBytes(32).toString('base64url');
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  protectPayload(payload: Record<string, any> = {}): Record<string, any> {
    const next = { ...payload };
    const protect = (rawKey: string, cipherKey: string, last4Key: string) => {
      const raw = String(next[rawKey] || '').trim();
      if (!raw) return;
      next[cipherKey] = this.encrypt(raw);
      next[last4Key] = raw.slice(-4);
      delete next[rawKey];
    };
    protect('bankAccountNumber', 'bankAccountCiphertext', 'bankAccountLast4');
    protect('bankIfsc', 'bankIfscCiphertext', 'bankIfscLast4');
    protect('taxIdentifier', 'taxIdentifierCiphertext', 'taxIdentifierLast4');
    return next;
  }

  sanitizePayload(payload: Record<string, any> | null | undefined) {
    const next = { ...(payload || {}) };
    delete next.bankAccountCiphertext;
    delete next.bankIfscCiphertext;
    delete next.taxIdentifierCiphertext;
    delete next.adminInitialPasswordHash;
    return next;
  }
}
