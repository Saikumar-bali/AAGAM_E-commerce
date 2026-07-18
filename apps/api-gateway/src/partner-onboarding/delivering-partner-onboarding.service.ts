import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { randomBytes, randomUUID } from 'crypto';
import { UploadService } from '../upload/upload.service';
import { CreatePartnerApplicationDto } from './dto/partner-onboarding.dto';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import { PartnerOnboardingService } from './partner-onboarding.service';
import {
  PartnerApplicationStatus,
  PartnerApplicationType,
  PartnerContactChannel,
} from './partner-onboarding.types';
import { PartnerVerificationService } from './partner-verification.service';

@Injectable()
export class DeliveringPartnerOnboardingService extends PartnerOnboardingService {
  constructor(
    private readonly deliveryRepository: PartnerOnboardingRepository,
    private readonly deliverySecurity: PartnerOnboardingSecurity,
    uploads: UploadService,
    private readonly verification: PartnerVerificationService,
  ) {
    super(deliveryRepository, deliverySecurity, uploads);
  }

  private makeApplicationNumber(type: PartnerApplicationType): string {
    const prefix = type === PartnerApplicationType.RIDER ? 'RID' : 'STR';
    return `AAG-${prefix}-${new Date().getUTCFullYear()}-${randomBytes(5)
      .toString('hex')
      .toUpperCase()}`;
  }

  override async createApplication(dto: CreatePartnerApplicationDto): Promise<any> {
    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phoneE164?.trim() || null;
    if (!email && !phone) throw new BadRequestException('Email or phone number is required');
    if (email) {
      const duplicate = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "PartnerApplication"
         WHERE LOWER("email") = $1
           AND "status" NOT IN ('REJECTED', 'WITHDRAWN', 'EXPIRED') LIMIT 1`,
        email,
      );
      if (duplicate[0]) throw new ConflictException('An active application already uses this email');
    }
    if (phone) {
      const duplicate = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "PartnerApplication"
         WHERE "phoneE164" = $1
           AND "status" NOT IN ('REJECTED', 'WITHDRAWN', 'EXPIRED') LIMIT 1`,
        phone,
      );
      if (duplicate[0]) throw new ConflictException('An active application already uses this phone');
    }

    const id = randomUUID();
    const accessToken = this.deliverySecurity.issueAccessToken();
    const channel =
      dto.verificationChannel ||
      (email ? PartnerContactChannel.EMAIL : PartnerContactChannel.PHONE);
    if (channel === PartnerContactChannel.EMAIL && !email) {
      throw new BadRequestException('Email is required for email verification');
    }
    if (channel === PartnerContactChannel.PHONE && !phone) {
      throw new BadRequestException('Phone is required for phone verification');
    }
    const applicationNumber = this.makeApplicationNumber(dto.type);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerApplication" (
          "id", "applicationNumber", "type", "applicantName", "email",
          "phoneE164", "accessSecretHash", "verificationChannel"
        ) VALUES ($1, $2, $3::"PartnerApplicationType", $4, $5, $6, $7, $8)`,
        id,
        applicationNumber,
        dto.type,
        dto.applicantName.trim(),
        email,
        phone,
        this.deliverySecurity.hash(accessToken),
        channel,
      );
      await this.deliveryRepository.writeEvent(
        tx,
        id,
        'APPLICATION_CREATED',
        'APPLICANT',
        {
          toStatus: PartnerApplicationStatus.DRAFT,
          message: 'Partner application started.',
        },
      );
    });

    try {
      const verification = await this.verification.requestContactCode(
        id,
        accessToken,
        channel,
      );
      return { applicationId: id, applicationNumber, accessToken, verification };
    } catch (error: any) {
      return {
        applicationId: id,
        applicationNumber,
        accessToken,
        verification: {
          channel,
          status: 'FAILED',
          code: error?.response?.code || error?.safeCode || 'DELIVERY_FAILED',
          correlationId: error?.correlationId || null,
        },
      };
    }
  }

  override requestVerification(
    id: string,
    accessToken: string,
    channel: PartnerContactChannel,
    fallbackFromPnv = false,
  ): Promise<any> {
    return this.verification.requestContactCode(id, accessToken, channel, fallbackFromPnv);
  }

  override verifyContact(id: string, accessToken: string, code: string) {
    return this.verification.verifyContact(id, accessToken, code);
  }
}
