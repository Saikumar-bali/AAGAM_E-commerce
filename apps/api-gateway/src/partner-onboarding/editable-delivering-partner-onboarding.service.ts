import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { UploadService } from '../upload/upload.service';
import { UpdatePartnerApplicationDto } from './dto/partner-onboarding.dto';
import { DeliveringPartnerOnboardingService } from './delivering-partner-onboarding.service';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import { PartnerVerificationService } from './partner-verification.service';

@Injectable()
export class EditableDeliveringPartnerOnboardingService extends DeliveringPartnerOnboardingService {
  constructor(
    private readonly editableRepository: PartnerOnboardingRepository,
    security: PartnerOnboardingSecurity,
    uploads: UploadService,
    verification: PartnerVerificationService,
  ) {
    super(editableRepository, security, uploads, verification);
  }

  override async updateApplication(
    id: string,
    accessToken: string,
    dto: UpdatePartnerApplicationDto,
  ) {
    const application = await this.editableRepository.requireApplication(id, accessToken);
    this.editableRepository.assertEditable(application);
    await prisma.$transaction(async (tx) => {
      await this.editableRepository.reopenForApplicantEdit(application, tx);
    });
    return super.updateApplication(id, accessToken, dto);
  }
}
