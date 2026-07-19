import { Injectable } from '@nestjs/common';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import { PartnerVerificationDeliveryService } from './partner-verification-delivery.service';
import { PartnerVerificationService } from './partner-verification.service';
import { VerificationChallengeRepository } from './verification-challenge.repository';
import { FirebasePnvVerificationService } from './firebase-pnv-verification.service';
import {
  isVerificationQaMode,
  selectedEmailVerificationProvider,
  VerificationProvider,
} from './verification.types';

@Injectable()
export class PhonePrimaryPartnerVerificationService extends PartnerVerificationService {
  constructor(
    applications: PartnerOnboardingRepository,
    security: PartnerOnboardingSecurity,
    delivery: PartnerVerificationDeliveryService,
    challenges: VerificationChallengeRepository,
    firebasePnv: FirebasePnvVerificationService,
  ) {
    super(applications, security, delivery, challenges, firebasePnv);
  }

  override async capabilities() {
    const qaMode = isVerificationQaMode();
    const mode = (process.env.PARTNER_PHONE_VERIFICATION_MODE || 'SMS_ONLY').trim().toUpperCase();
    const phoneAvailable = mode !== 'EMAIL_ONLY';
    const pnvFirst = mode === 'PNV_FIRST';
    const emailProvider = qaMode ? VerificationProvider.QA : selectedEmailVerificationProvider();
    const twilioFrom = (process.env.TWILIO_FROM_PHONE || process.env.WILIO_FROM_PHONE)?.trim();
    return {
      mode,
      qaMode,
      email: {
        method: 'EMAIL_CODE',
        provider: emailProvider,
        configured:
          qaMode ||
          (emailProvider === VerificationProvider.MAILJET
            ? Boolean(process.env.MAILJET_API_KEY?.trim() && process.env.MAILJET_SECRET_KEY?.trim())
            : Boolean(process.env.RESEND_API_KEY?.trim())),
      },
      phone: {
        available: phoneAvailable,
        preferredMethod: pnvFirst ? 'FIREBASE_PNV' : 'SMS_OTP',
        preferredProvider: pnvFirst ? 'FIREBASE_PNV' : 'TWILIO',
        pnvConfigured:
          phoneAvailable &&
          pnvFirst &&
          (qaMode || Boolean(process.env.FIREBASE_PROJECT_ID?.trim() && process.env.FIREBASE_PROJECT_NUMBER?.trim())),
        fallbackMethod: 'SMS_OTP',
        fallbackProvider: 'TWILIO',
        smsConfigured:
          phoneAvailable &&
          (qaMode || Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && twilioFrom)),
      },
    };
  }
}
