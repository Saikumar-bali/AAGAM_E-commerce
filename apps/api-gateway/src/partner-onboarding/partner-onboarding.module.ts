import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { ContactVerificationModule } from '../contact-verification/contact-verification.module';
import { PartnerOnboardingAdminController } from './partner-onboarding-admin.controller';
import { PartnerOnboardingAdminService } from './partner-onboarding-admin.service';
import { PhonePrimaryPartnerOnboardingAdminService } from './phone-primary-partner-onboarding-admin.service';
import { PartnerOnboardingController } from './partner-onboarding.controller';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import { PartnerOnboardingService } from './partner-onboarding.service';
import { EditableDeliveringPartnerOnboardingService } from './editable-delivering-partner-onboarding.service';
import { PartnerVerificationDeliveryService } from './partner-verification-delivery.service';
import { PartnerVerificationService } from './partner-verification.service';
import { PhonePrimaryPartnerVerificationService } from './phone-primary-partner-verification.service';
import { VerificationChallengeRepository } from './verification-challenge.repository';
import { FirebasePnvVerificationService } from './firebase-pnv-verification.service';
import { VerificationReadinessController } from './verification-readiness.controller';
import { PartnerApplicationRecoveryController } from './partner-application-recovery.controller';
import { PartnerApplicationRecoveryService } from './partner-application-recovery.service';

@Module({
  imports: [UploadModule, ContactVerificationModule],
  controllers: [
    PartnerOnboardingController,
    PartnerApplicationRecoveryController,
    PartnerOnboardingAdminController,
    VerificationReadinessController,
  ],
  providers: [
    PartnerOnboardingSecurity,
    PartnerOnboardingRepository,
    PartnerApplicationRecoveryService,
    VerificationChallengeRepository,
    PartnerVerificationDeliveryService,
    FirebasePnvVerificationService,
    {
      provide: PartnerVerificationService,
      useClass: PhonePrimaryPartnerVerificationService,
    },
    {
      provide: PartnerOnboardingService,
      useClass: EditableDeliveringPartnerOnboardingService,
    },
    {
      provide: PartnerOnboardingAdminService,
      useClass: PhonePrimaryPartnerOnboardingAdminService,
    },
  ],
  exports: [
    PartnerOnboardingService,
    PartnerOnboardingAdminService,
    PartnerVerificationService,
  ],
})
export class PartnerOnboardingModule {}
