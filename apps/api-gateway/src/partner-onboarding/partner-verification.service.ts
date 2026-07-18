import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '@aagam/database';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PartnerContactChannel } from './partner-onboarding.types';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import {
  PartnerVerificationDeliveryException,
  PartnerVerificationDeliveryService,
} from './partner-verification-delivery.service';
import { VerificationChallengeRepository } from './verification-challenge.repository';
import {
  isVerificationQaMode,
  selectedEmailVerificationProvider,
  VerificationChallengeStatus,
  VerificationMethod,
  VerificationProvider,
} from './verification.types';
import {
  FirebasePnvTokenException,
  FirebasePnvVerificationService,
} from './firebase-pnv-verification.service';

@Injectable()
export class PartnerVerificationService {
  constructor(
    private readonly applications: PartnerOnboardingRepository,
    private readonly security: PartnerOnboardingSecurity,
    private readonly delivery: PartnerVerificationDeliveryService,
    private readonly challenges: VerificationChallengeRepository,
    private readonly firebasePnv: FirebasePnvVerificationService,
  ) {}

  private hashDestination(value: string): string {
    return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
  }

  private hashExact(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private code(): string {
    return isVerificationQaMode()
      ? process.env.PARTNER_QA_VERIFICATION_CODE || '424242'
      : String(randomInt(100000, 1000000));
  }

  private phoneMode(): string {
    return (process.env.PARTNER_PHONE_VERIFICATION_MODE || 'PNV_FIRST')
      .trim()
      .toUpperCase();
  }

  private phoneVerificationEnabled(): boolean {
    return this.phoneMode() !== 'EMAIL_ONLY';
  }

  private providerFor(channel: PartnerContactChannel): VerificationProvider {
    if (isVerificationQaMode()) return VerificationProvider.QA;
    return channel === PartnerContactChannel.EMAIL
      ? selectedEmailVerificationProvider()
      : VerificationProvider.TWILIO;
  }

  async capabilities() {
    const qaMode = isVerificationQaMode();
    const mode = this.phoneMode();
    const phoneAvailable = mode !== 'EMAIL_ONLY';
    const emailProvider = qaMode
      ? VerificationProvider.QA
      : selectedEmailVerificationProvider();
    return {
      mode,
      qaMode,
      email: {
        method: 'EMAIL_CODE',
        provider: emailProvider,
        configured: qaMode || this.isConfigured(emailProvider),
      },
      phone: {
        available: phoneAvailable,
        preferredMethod: 'FIREBASE_PNV',
        preferredProvider: 'FIREBASE_PNV',
        pnvConfigured:
          phoneAvailable &&
          (qaMode ||
            Boolean(
              process.env.FIREBASE_PROJECT_ID?.trim() &&
                process.env.FIREBASE_PROJECT_NUMBER?.trim(),
            )),
        fallbackMethod: 'SMS_OTP',
        fallbackProvider: process.env.PARTNER_SMS_PROVIDER || 'TWILIO',
        smsConfigured:
          phoneAvailable &&
          (qaMode ||
            Boolean(
              process.env.TWILIO_ACCOUNT_SID?.trim() &&
                process.env.TWILIO_AUTH_TOKEN?.trim() &&
                process.env.TWILIO_FROM_PHONE?.trim(),
            )),
      },
    };
  }

  async readiness() {
    const qaMode = isVerificationQaMode();
    const phoneMode = this.phoneMode();
    const phoneEnabled = phoneMode !== 'EMAIL_ONLY';
    const activeEmailProvider = qaMode
      ? VerificationProvider.QA
      : selectedEmailVerificationProvider();
    const providers = await Promise.all(
      [
        VerificationProvider.RESEND,
        VerificationProvider.MAILJET,
        VerificationProvider.TWILIO,
        VerificationProvider.FIREBASE_PNV,
      ].map(async (provider) => ({
        provider,
        configured: this.isConfigured(provider),
        active:
          provider === activeEmailProvider ||
          (phoneEnabled &&
            (provider === VerificationProvider.TWILIO ||
              provider === VerificationProvider.FIREBASE_PNV)),
        qaMode,
        lastSuccessfulProviderCheckTimestamp:
          (await this.challenges.lastSuccessfulProviderCheck(provider))?.toISOString() || null,
      })),
    );
    return { activeEmailProvider, phoneMode, providers };
  }

  private isConfigured(provider: VerificationProvider): boolean {
    if (isVerificationQaMode()) return true;
    switch (provider) {
      case VerificationProvider.RESEND:
        return Boolean(
          process.env.RESEND_API_KEY?.trim() &&
            process.env.PARTNER_VERIFICATION_FROM_EMAIL?.trim(),
        );
      case VerificationProvider.MAILJET:
        return Boolean(
          process.env.MAILJET_API_KEY?.trim() &&
            process.env.MAILJET_SECRET_KEY?.trim() &&
            process.env.PARTNER_VERIFICATION_FROM_EMAIL?.trim(),
        );
      case VerificationProvider.TWILIO:
        return (
          this.phoneVerificationEnabled() &&
          Boolean(
            process.env.TWILIO_ACCOUNT_SID?.trim() &&
              process.env.TWILIO_AUTH_TOKEN?.trim() &&
              process.env.TWILIO_FROM_PHONE?.trim(),
          )
        );
      case VerificationProvider.FIREBASE_PNV:
        return (
          this.phoneVerificationEnabled() &&
          Boolean(
            process.env.FIREBASE_PROJECT_ID?.trim() &&
              process.env.FIREBASE_PROJECT_NUMBER?.trim(),
          )
        );
      default:
        return false;
    }
  }

  async requestContactCode(
    id: string,
    accessToken: string,
    channel: PartnerContactChannel,
    fallbackFromPnv = false,
  ) {
    const application = await this.applications.requireApplication(id, accessToken);
    this.applications.assertEditable(application);
    if (channel === PartnerContactChannel.PHONE && !this.phoneVerificationEnabled()) {
      throw new BadRequestException(
        'Phone verification is temporarily unavailable. Use email verification.',
      );
    }
    const destination =
      channel === PartnerContactChannel.EMAIL ? application.email : application.phoneE164;
    if (!destination) {
      throw new BadRequestException(
        channel === PartnerContactChannel.EMAIL
          ? 'Application does not have an email address'
          : 'Application does not have a phone number',
      );
    }

    const method =
      channel === PartnerContactChannel.EMAIL
        ? VerificationMethod.EMAIL_CODE
        : VerificationMethod.SMS_OTP;
    const provider = this.providerFor(channel);
    const code = this.code();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const challenge = await this.challenges.create({
      applicationId: id,
      method,
      provider,
      destinationHash: this.hashDestination(destination),
      expiresAt,
    });

    await prisma.$transaction(async (tx) => {
      await this.challenges.setStatus(
        challenge.id,
        VerificationChallengeStatus.DISPATCHING,
        {},
        tx,
      );
      await this.applications.writeEvent(
        tx,
        id,
        'CONTACT_CODE_DELIVERY_REQUESTED',
        'APPLICANT',
        {
          message: `Verification code delivery requested for ${channel.toLowerCase()}.`,
          metadata: { channel, method, provider, challengeId: challenge.id },
        },
      );
      if (fallbackFromPnv) {
        await this.applications.writeEvent(
          tx,
          id,
          'VERIFICATION_FALLBACK_SELECTED',
          'APPLICANT',
          {
            message: 'SMS fallback selected after Firebase PNV was unavailable.',
            metadata: { from: 'FIREBASE_PNV', to: 'SMS_OTP' },
          },
        );
      }
    });

    try {
      const result = await this.delivery.deliver({
        applicationId: id,
        channel,
        email: application.email,
        phoneE164: application.phoneE164,
        code,
        expiresAt,
        applicationNumber: application.applicationNumber,
      });
      await prisma.$transaction(async (tx) => {
        await this.challenges.supersedeActive(id, method, challenge.id, tx);
        await this.challenges.setStatus(
          challenge.id,
          VerificationChallengeStatus.SENT,
          { providerDeliveryId: result.deliveryId },
          tx,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "PartnerApplication"
           SET "verificationChannel" = $2, "verificationCodeHash" = $3,
               "verificationExpiresAt" = $4, "verificationAttempts" = 0,
               "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          id,
          channel,
          this.security.verificationHash(challenge.id, code),
          expiresAt,
        );
        await this.applications.writeEvent(tx, id, 'CONTACT_CODE_SENT', 'SYSTEM', {
          message: `Verification code accepted by ${result.provider.toLowerCase()}.`,
          metadata: {
            channel,
            method,
            provider: result.provider,
            challengeId: challenge.id,
            providerDeliveryId: result.deliveryId,
            correlationId: result.correlationId,
            expiresAt: expiresAt.toISOString(),
          },
        });
      });
      return {
        channel,
        method,
        provider: result.provider,
        expiresAt,
        ...(isVerificationQaMode() ? { code } : {}),
      };
    } catch (error: any) {
      const failureCode =
        error instanceof PartnerVerificationDeliveryException
          ? error.safeCode
          : 'PROVIDER_DELIVERY_FAILED';
      await prisma.$transaction(async (tx) => {
        await this.challenges.setStatus(
          challenge.id,
          VerificationChallengeStatus.FAILED,
          { failureCode },
          tx,
        );
        await this.applications.writeEvent(
          tx,
          id,
          'CONTACT_CODE_DELIVERY_FAILED',
          'SYSTEM',
          {
            message: 'Verification provider did not accept the delivery.',
            metadata: {
              channel,
              method,
              provider,
              challengeId: challenge.id,
              failureCode,
              correlationId: error?.correlationId || null,
            },
          },
        );
      });
      throw error;
    }
  }

  async verifyContact(id: string, accessToken: string, code: string) {
    const application = await this.applications.requireApplication(id, accessToken);
    this.applications.assertEditable(application);
    const challenge = await this.challenges.latestSentCode(id);
    if (!challenge) throw new BadRequestException('Request a verification code first');
    if (challenge.attemptCount >= 5) {
      throw new BadRequestException('Verification attempt limit reached');
    }
    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
      await this.challenges.setStatus(challenge.id, VerificationChallengeStatus.EXPIRED);
      throw new BadRequestException('Verification code has expired');
    }
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "verificationCodeHash" FROM "PartnerApplication" WHERE "id" = $1`,
      id,
    );
    const expected = rows[0]?.verificationCodeHash;
    if (!expected || expected !== this.security.verificationHash(challenge.id, code.trim())) {
      await this.challenges.setStatus(challenge.id, VerificationChallengeStatus.SENT, {
        failureCode: 'INVALID_CODE',
        incrementAttempt: true,
      });
      throw new BadRequestException('Verification code is invalid');
    }

    const verifiedColumn =
      challenge.method === VerificationMethod.SMS_OTP
        ? '"phoneVerifiedAt"'
        : '"emailVerifiedAt"';
    await prisma.$transaction(async (tx) => {
      await this.challenges.setStatus(
        challenge.id,
        VerificationChallengeStatus.VERIFIED,
        { verifiedAt: new Date(), failureCode: null },
        tx,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication"
         SET ${verifiedColumn} = CURRENT_TIMESTAMP, "verificationCodeHash" = NULL,
             "verificationExpiresAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        id,
      );
      await this.applications.writeEvent(tx, id, 'CONTACT_VERIFIED', 'APPLICANT', {
        message: `${challenge.method === VerificationMethod.SMS_OTP ? 'phone' : 'email'} verified.`,
        metadata: { method: challenge.method, provider: challenge.provider },
      });
    });
    return this.applications.response(await this.applications.requireApplication(id, accessToken));
  }

  async createPnvChallenge(id: string, accessToken: string) {
    const application = await this.applications.requireApplication(id, accessToken);
    this.applications.assertEditable(application);
    if (!this.phoneVerificationEnabled()) {
      throw new BadRequestException(
        'Phone verification is temporarily unavailable. Use email verification.',
      );
    }
    if (!application.phoneE164) {
      throw new BadRequestException('Application does not have a phone number');
    }
    if (!this.isConfigured(VerificationProvider.FIREBASE_PNV)) {
      throw new BadRequestException('Firebase PNV is not configured');
    }
    const nonce = `${randomBytes(24).toString('base64url')}.${Date.now()}`;
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000);
    const challenge = await this.challenges.create({
      applicationId: id,
      method: VerificationMethod.FIREBASE_PNV,
      provider: VerificationProvider.FIREBASE_PNV,
      destinationHash: this.hashDestination(application.phoneE164),
      nonceHash: this.hashExact(nonce),
      expiresAt,
      status: VerificationChallengeStatus.SENT,
    });
    await prisma.$transaction(async (tx) => {
      await this.challenges.supersedeActive(
        id,
        VerificationMethod.FIREBASE_PNV,
        challenge.id,
        tx,
      );
      await this.applications.writeEvent(tx, id, 'PNV_VERIFICATION_STARTED', 'APPLICANT', {
        message: 'Firebase phone number verification started.',
        metadata: { provider: 'FIREBASE_PNV', challengeId: challenge.id, expiresAt },
      });
    });
    return { nonce, expiresAt, provider: 'FIREBASE_PNV' };
  }

  async verifyPnv(id: string, accessToken: string, token: string) {
    if (!accessToken) throw new UnauthorizedException('Application access could not be verified');
    const application = await this.applications.requireApplication(id, accessToken);
    this.applications.assertEditable(application);
    let claims: Awaited<ReturnType<FirebasePnvVerificationService['verifySignedToken']>>;
    try {
      claims = await this.firebasePnv.verifySignedToken(token);
      const challenge = await this.challenges.activePnvByNonce(
        id,
        this.hashExact(claims.nonce),
      );
      if (!challenge) {
        throw new FirebasePnvTokenException('PNV_NONCE_MISMATCH', 'Firebase PNV nonce is invalid');
      }
      if (new Date(challenge.expiresAt).getTime() < Date.now()) {
        await this.challenges.setStatus(challenge.id, VerificationChallengeStatus.EXPIRED);
        throw new FirebasePnvTokenException(
          'PNV_NONCE_EXPIRED',
          'Firebase PNV challenge has expired',
        );
      }
      if (await this.challenges.hasTokenJti(claims.jti)) {
        throw new FirebasePnvTokenException(
          'PNV_TOKEN_REPLAYED',
          'Firebase PNV token was already used',
        );
      }
      if (!application.phoneE164 || claims.phoneNumber !== application.phoneE164) {
        throw new FirebasePnvTokenException(
          'PNV_PHONE_MISMATCH',
          'Verified phone number does not match the application',
        );
      }

      await prisma.$transaction(async (tx) => {
        await this.challenges.setStatus(
          challenge.id,
          VerificationChallengeStatus.VERIFIED,
          { tokenJti: claims.jti, verifiedAt: new Date(), failureCode: null },
          tx,
        );
        await tx.$executeRawUnsafe(
          `UPDATE "PartnerApplication" SET "phoneVerifiedAt" = CURRENT_TIMESTAMP,
           "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          id,
        );
        await this.applications.writeEvent(
          tx,
          id,
          'PNV_VERIFICATION_SUCCEEDED',
          'APPLICANT',
          {
            message: 'Phone number verified by Firebase PNV.',
            metadata: { provider: 'FIREBASE_PNV', challengeId: challenge.id },
          },
        );
      });
      return this.applications.response(await this.applications.requireApplication(id, accessToken));
    } catch (error: any) {
      const failureCode = error?.safeCode || 'PNV_VERIFICATION_FAILED';
      await this.applications.writeEvent(prisma, id, 'PNV_VERIFICATION_FAILED', 'SYSTEM', {
        message: 'Firebase phone number verification failed.',
        metadata: { provider: 'FIREBASE_PNV', failureCode },
      });
      throw error;
    }
  }
}
