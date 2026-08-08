import { Injectable } from '@nestjs/common';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import { PartnerVerificationDeliveryService } from './partner-verification-delivery.service';
import { PartnerVerificationService } from './partner-verification.service';
import { VerificationChallengeRepository } from './verification-challenge.repository';
import { FirebasePnvVerificationService } from './firebase-pnv-verification.service';

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
}
