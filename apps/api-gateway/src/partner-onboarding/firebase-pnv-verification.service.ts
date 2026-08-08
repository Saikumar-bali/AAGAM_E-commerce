import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getApps, initializeApp } from 'firebase-admin/app';
import type { PhoneNumberVerificationToken } from 'firebase-admin/phone-number-verification';

export class FirebasePnvTokenException extends BadRequestException {
  constructor(readonly safeCode: string, message: string) {
    super({ message, code: safeCode });
  }
}

@Injectable()
export class FirebasePnvVerificationService {
  protected async verifyWithAdmin(token: string): Promise<PhoneNumberVerificationToken> {
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    if (!projectId) {
      throw new ServiceUnavailableException('Firebase PNV verification is not configured');
    }
    const app =
      getApps().find((candidate) => candidate.name === 'aagam-pnv') ||
      initializeApp({ projectId }, 'aagam-pnv');

    // Firebase Admin v14's PNV verifier reaches an ESM-only JOSE dependency.
    // Keep that runtime boundary lazy so unrelated CommonJS/Jest service tests do
    // not execute the verifier dependency merely by importing application modules.
    const { getPhoneNumberVerification } = await import(
      'firebase-admin/phone-number-verification'
    );
    return getPhoneNumberVerification(app).verifyToken(token);
  }

  async verifySignedToken(token: string): Promise<PhoneNumberVerificationToken> {
    if (!token || token.length < 40) {
      throw new FirebasePnvTokenException('PNV_TOKEN_MISSING', 'Firebase PNV token is required');
    }
    const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
    const projectNumber = process.env.FIREBASE_PROJECT_NUMBER?.trim();
    if (!projectId || !projectNumber) {
      throw new ServiceUnavailableException('Firebase PNV verification is not configured');
    }

    let claims: PhoneNumberVerificationToken;
    try {
      claims = await this.verifyWithAdmin(token);
    } catch (error: any) {
      const code = String(error?.code || error?.errorInfo?.code || '').toLowerCase();
      const text = String(error?.message || '').toLowerCase();
      if (code.includes('expired') || text.includes('expired')) {
        throw new FirebasePnvTokenException('PNV_TOKEN_EXPIRED', 'Firebase PNV token has expired');
      }
      throw new FirebasePnvTokenException(
        'PNV_INVALID_SIGNATURE',
        'Firebase PNV token could not be authenticated',
      );
    }

    const expectedIssuer = `https://fpnv.googleapis.com/projects/${projectNumber}`;
    const expectedAudiences = [
      expectedIssuer,
      `https://fpnv.googleapis.com/projects/${projectId}`,
    ];
    if (claims.iss !== expectedIssuer) {
      throw new FirebasePnvTokenException('PNV_WRONG_ISSUER', 'Firebase PNV token project is invalid');
    }
    if (
      !Array.isArray(claims.aud) ||
      !expectedAudiences.every((audience) => claims.aud.includes(audience))
    ) {
      throw new FirebasePnvTokenException('PNV_WRONG_AUDIENCE', 'Firebase PNV token audience is invalid');
    }
    if (!claims.exp || claims.exp <= Math.floor(Date.now() / 1000)) {
      throw new FirebasePnvTokenException('PNV_TOKEN_EXPIRED', 'Firebase PNV token has expired');
    }
    if (!claims.nonce || !claims.jti || !claims.phoneNumber) {
      throw new FirebasePnvTokenException('PNV_INVALID_TOKEN', 'Firebase PNV token is incomplete');
    }
    return claims;
  }
}
