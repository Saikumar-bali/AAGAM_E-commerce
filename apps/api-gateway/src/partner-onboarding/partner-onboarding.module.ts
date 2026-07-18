import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { PartnerOnboardingAdminController } from './partner-onboarding-admin.controller';
import { PartnerOnboardingAdminService } from './partner-onboarding-admin.service';
import { PartnerOnboardingController } from './partner-onboarding.controller';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import { PartnerOnboardingService } from './partner-onboarding.service';
import { DeliveringPartnerOnboardingService } from './delivering-partner-onboarding.service';
import { PartnerVerificationDeliveryService } from './partner-verification-delivery.service';
import { PartnerVerificationService } from './partner-verification.service';
import { VerificationChallengeRepository } from './verification-challenge.repository';
import { FirebasePnvVerificationService } from './firebase-pnv-verification.service';
import { VerificationReadinessController } from './verification-readiness.controller';

@Module({
  imports: [UploadModule],
  controllers: [
    PartnerOnboardingController,
    PartnerOnboardingAdminController,
    VerificationReadinessController,
  ],
  providers: [
    PartnerOnboardingSecurity,
    PartnerOnboardingRepository,
    VerificationChallengeRepository,
    PartnerVerificationDeliveryService,
    FirebasePnvVerificationService,
    PartnerVerificationService,
    {
      provide: PartnerOnboardingService,
      useClass: DeliveringPartnerOnboardingService,
    },
    PartnerOnboardingAdminService,
  ],
  exports: [
    PartnerOnboardingService,
    PartnerOnboardingAdminService,
    PartnerVerificationService,
  ],
})
export class PartnerOnboardingModule {}
