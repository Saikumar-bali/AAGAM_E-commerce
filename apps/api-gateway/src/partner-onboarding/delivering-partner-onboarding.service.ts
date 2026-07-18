import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { randomBytes, randomInt, randomUUID } from 'crypto';
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
import { PartnerVerificationDeliveryService } from './partner-verification-delivery.service';

@Injectable()
export class DeliveringPartnerOnboardingService extends PartnerOnboardingService {
  constructor(
    private readonly deliveryRepository: PartnerOnboardingRepository,
    private readonly deliverySecurity: PartnerOnboardingSecurity,
    uploads: UploadService,
    private readonly verificationDelivery: PartnerVerificationDeliveryService,
  ) {
    super(deliveryRepository, deliverySecurity, uploads);
  }

  private makeApplicationNumber(type: PartnerApplicationType): string {
    const prefix = type === PartnerApplicationType.RIDER ? 'RID' : 'STR';
    return `AAG-${prefix}-${new Date().getUTCFullYear()}-${randomBytes(5)
      .toString('hex')
      .toUpperCase()}`;
  }

  private makeVerificationCode(): string {
    return String(randomInt(100000, 1000000));
  }

  private exposeQaCode(code: string): string | undefined {
    return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true'
      ? code
      : undefined;
  }

  override async createApplication(dto: CreatePartnerApplicationDto) {
    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phoneE164?.trim() || null;
    if (!email && !phone) {
      throw new BadRequestException('Email or phone number is required');
    }
    if (email) {
      const duplicate = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "PartnerApplication"
         WHERE LOWER("email") = $1
           AND "status" NOT IN ('REJECTED', 'WITHDRAWN', 'EXPIRED') LIMIT 1`,
        email,
      );
      if (duplicate[0]) {
        throw new ConflictException('An active application already uses this email');
      }
    }
    if (phone) {
      const duplicate = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "PartnerApplication"
         WHERE "phoneE164" = $1
           AND "status" NOT IN ('REJECTED', 'WITHDRAWN', 'EXPIRED') LIMIT 1`,
        phone,
      );
      if (duplicate[0]) {
        throw new ConflictException('An active application already uses this phone');
      }
    }

    const id = randomUUID();
    const accessToken = this.deliverySecurity.issueAccessToken();
    const code = this.makeVerificationCode();
    const channel =
      dto.verificationChannel ||
      (email ? PartnerContactChannel.EMAIL : PartnerContactChannel.PHONE);
    if (channel === PartnerContactChannel.EMAIL && !email) {
      throw new BadRequestException('Email is required for email verification');
    }
    if (channel === PartnerContactChannel.PHONE && !phone) {
      throw new BadRequestException('Phone is required for phone verification');
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const applicationNumber = this.makeApplicationNumber(dto.type);

    const delivery = await this.verificationDelivery.deliver({
      channel,
      email,
      phoneE164: phone,
      code,
      expiresAt,
      applicationNumber,
    });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerApplication" (
          "id", "applicationNumber", "type", "applicantName", "email",
          "phoneE164", "accessSecretHash", "verificationChannel",
          "verificationCodeHash", "verificationExpiresAt"
        ) VALUES ($1, $2, $3::"PartnerApplicationType", $4, $5, $6, $7, $8, $9, $10)`,
        id,
        applicationNumber,
        dto.type,
        dto.applicantName.trim(),
        email,
        phone,
        this.deliverySecurity.hash(accessToken),
        channel,
        this.deliverySecurity.verificationHash(id, code),
        expiresAt,
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
      await this.deliveryRepository.writeEvent(
        tx,
        id,
        'CONTACT_CODE_SENT',
        'SYSTEM',
        {
          message: `Verification code sent to ${channel.toLowerCase()}.`,
          metadata: {
            channel,
            provider: delivery.provider,
            deliveryId: delivery.deliveryId,
            expiresAt: expiresAt.toISOString(),
          },
        },
      );
    });

    return {
      applicationId: id,
      applicationNumber,
      accessToken,
      verification: {
        channel,
        expiresAt,
        code: this.exposeQaCode(code),
      },
    };
  }

  override async requestVerification(
    id: string,
    accessToken: string,
    channel: PartnerContactChannel,
  ) {
    const application = await this.deliveryRepository.requireApplication(
      id,
      accessToken,
    );
    this.deliveryRepository.assertEditable(application);
    if (channel === PartnerContactChannel.EMAIL && !application.email) {
      throw new BadRequestException('Application does not have an email address');
    }
    if (channel === PartnerContactChannel.PHONE && !application.phoneE164) {
      throw new BadRequestException('Application does not have a phone number');
    }

    const code = this.makeVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const delivery = await this.verificationDelivery.deliver({
      channel,
      email: application.email,
      phoneE164: application.phoneE164,
      code,
      expiresAt,
      applicationNumber: application.applicationNumber,
    });

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication"
         SET "verificationChannel" = $2, "verificationCodeHash" = $3,
             "verificationExpiresAt" = $4, "verificationAttempts" = 0,
             "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
        channel,
        this.deliverySecurity.verificationHash(id, code),
        expiresAt,
      );
      await this.deliveryRepository.writeEvent(
        tx,
        id,
        'CONTACT_CODE_SENT',
        'SYSTEM',
        {
          message: `Verification code sent to ${channel.toLowerCase()}.`,
          metadata: {
            channel,
            provider: delivery.provider,
            deliveryId: delivery.deliveryId,
            expiresAt: expiresAt.toISOString(),
          },
        },
      );
    });
    return { channel, expiresAt, code: this.exposeQaCode(code) };
  }
}
