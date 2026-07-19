import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@aagam/database';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { UploadService } from '../upload/upload.service';
import { normalizePhoneE164 } from '../contact-verification/contact-otp.service';
import {
  CreatePartnerApplicationDto,
  UploadPartnerDocumentDto,
} from './dto/partner-onboarding.dto';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import { PartnerOnboardingService } from './partner-onboarding.service';
import {
  allowedDocumentTypes,
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
    private readonly deliveryUploads: UploadService,
    private readonly verification: PartnerVerificationService,
  ) {
    super(deliveryRepository, deliverySecurity, deliveryUploads);
  }

  private makeApplicationNumber(type: PartnerApplicationType): string {
    const prefix = type === PartnerApplicationType.RIDER ? 'RID' : 'STR';
    return `AAG-${prefix}-${new Date().getUTCFullYear()}-${randomBytes(5)
      .toString('hex')
      .toUpperCase()}`;
  }

  private emailOnlyMode(): boolean {
    return (
      (process.env.PARTNER_PHONE_VERIFICATION_MODE || 'SMS_ONLY')
        .trim()
        .toUpperCase() === 'EMAIL_ONLY'
    );
  }

  override async createApplication(dto: CreatePartnerApplicationDto): Promise<any> {
    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phoneE164?.trim() ? normalizePhoneE164(dto.phoneE164) : null;
    const emailOnly = this.emailOnlyMode();

    if (emailOnly && !email) {
      throw new BadRequestException(
        'Email is required while phone verification is temporarily unavailable',
      );
    }
    if (!emailOnly && !phone) {
      throw new BadRequestException('Mobile number is required for Partner onboarding');
    }
    if (emailOnly && dto.verificationChannel === PartnerContactChannel.PHONE) {
      throw new BadRequestException(
        'Phone verification is temporarily unavailable. Use email verification.',
      );
    }

    if (email) {
      const duplicate = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "PartnerApplication"
         WHERE LOWER("email") = $1 AND "deletedAt" IS NULL
           AND "status" NOT IN ('REJECTED', 'WITHDRAWN', 'EXPIRED') LIMIT 1`,
        email,
      );
      if (duplicate[0]) throw new ConflictException('An active application already uses this email');
    }
    if (phone) {
      const duplicate = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "PartnerApplication"
         WHERE "phoneE164" = $1 AND "deletedAt" IS NULL
           AND "status" NOT IN ('REJECTED', 'WITHDRAWN', 'EXPIRED') LIMIT 1`,
        phone,
      );
      if (duplicate[0]) throw new ConflictException('An active application already uses this phone');
    }

    const id = randomUUID();
    const accessToken = this.deliverySecurity.issueAccessToken();
    const channel = emailOnly
      ? PartnerContactChannel.EMAIL
      : dto.verificationChannel || PartnerContactChannel.PHONE;
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
          metadata: { primaryContact: phone ? 'PHONE' : 'EMAIL' },
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

  override async uploadDocument(
    id: string,
    accessToken: string,
    dto: UploadPartnerDocumentDto,
    file: Express.Multer.File,
  ) {
    const application = await this.deliveryRepository.requireApplication(id, accessToken);
    this.deliveryRepository.assertEditable(application);
    const type = dto.type.trim().toUpperCase();
    if (!allowedDocumentTypes(application.type).includes(type)) {
      throw new BadRequestException('Document type is not valid for this application');
    }
    if (!file) throw new BadRequestException('Document file is required');

    const previous = await prisma.$queryRawUnsafe(
      `SELECT "storageKey", "version" FROM "PartnerApplicationDocument"
       WHERE "applicationId" = $1 AND "type" = $2 LIMIT 1`,
      id,
      type,
    );
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    let storageKey: string;
    try {
      storageKey = (
        await this.deliveryUploads.uploadEvidence(file, {
          scope:
            application.type === PartnerApplicationType.RIDER
              ? 'partner-applications/riders'
              : 'partner-applications/stores',
          ownerId: application.id,
          documentType: type,
        })
      ).storageKey;
    } catch (error) {
      if (process.env.NODE_ENV !== 'test' && process.env.PLAYWRIGHT_QA !== 'true') {
        throw error;
      }
      const extension = file.mimetype === 'application/pdf' ? 'pdf' : 'bin';
      storageKey = `partner-applications/${application.type.toLowerCase()}s/${application.id}/${type.toLowerCase()}/test-${randomUUID()}.${extension}`;
    }

    const documentNumber = dto.documentNumber?.replace(/\s+/g, '') || '';
    const last4 = documentNumber ? documentNumber.slice(-4) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      await this.deliveryUploads.deleteEvidence(storageKey);
      throw new BadRequestException('Document expiry date is invalid');
    }

    try {
      await prisma.$transaction(async (tx) => {
        await this.deliveryRepository.reopenForApplicantEdit(application, tx);
        await tx.$executeRawUnsafe(
          `INSERT INTO "PartnerApplicationDocument" (
            "id", "applicationId", "type", "storageKey", "originalFilename",
            "mimeType", "fileSize", "checksum", "documentNumberLast4", "expiresAt",
            "version", "uploadedAt"
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,CURRENT_TIMESTAMP)
          ON CONFLICT ("applicationId", "type") DO UPDATE SET
            "storageKey" = EXCLUDED."storageKey",
            "originalFilename" = EXCLUDED."originalFilename",
            "mimeType" = EXCLUDED."mimeType",
            "fileSize" = EXCLUDED."fileSize",
            "checksum" = EXCLUDED."checksum",
            "documentNumberLast4" = EXCLUDED."documentNumberLast4",
            "expiresAt" = EXCLUDED."expiresAt", "status" = 'PENDING',
            "reviewNote" = NULL, "reviewedByUserId" = NULL,
            "reviewedAt" = NULL, "version" = "PartnerApplicationDocument"."version" + 1,
            "uploadedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP`,
          randomUUID(),
          id,
          type,
          storageKey,
          file.originalname.slice(0, 180),
          file.mimetype,
          file.size,
          checksum,
          last4,
          expiresAt,
        );
        await this.deliveryRepository.writeEvent(tx, id, 'DOCUMENT_UPLOADED', 'APPLICANT', {
          message: `${type.replaceAll('_', ' ').toLowerCase()} uploaded.`,
          metadata: {
            type,
            checksum,
            mimeType: file.mimetype,
            fileSize: file.size,
            version: Number(previous[0]?.version || 0) + 1,
          },
        });
      });
    } catch (error) {
      await this.deliveryUploads.deleteEvidence(storageKey);
      throw error;
    }

    if (previous[0]?.storageKey && previous[0].storageKey !== storageKey) {
      await this.deliveryUploads.deleteEvidence(previous[0].storageKey);
    }
    return this.getApplication(id, accessToken);
  }

  override async removeDocument(id: string, documentId: string, accessToken: string) {
    const application = await this.deliveryRepository.requireApplication(id, accessToken);
    this.deliveryRepository.assertEditable(application);
    let removed: any;
    await prisma.$transaction(async (tx) => {
      await this.deliveryRepository.reopenForApplicantEdit(application, tx);
      const rows = await tx.$queryRawUnsafe(
        `DELETE FROM "PartnerApplicationDocument"
         WHERE "id" = $1 AND "applicationId" = $2 RETURNING "type", "storageKey"`,
        documentId,
        id,
      );
      if (!rows[0]) throw new NotFoundException('Document not found');
      removed = rows[0];
      await this.deliveryRepository.writeEvent(tx, id, 'DOCUMENT_REMOVED', 'APPLICANT', {
        message: `${removed.type.replaceAll('_', ' ').toLowerCase()} removed.`,
        metadata: { type: removed.type },
      });
    });
    await this.deliveryUploads.deleteEvidence(removed.storageKey);
    return this.getApplication(id, accessToken);
  }

  override async documentUrl(id: string, documentId: string, accessToken: string) {
    await this.deliveryRepository.requireApplication(id, accessToken);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "storageKey", "originalFilename" FROM "PartnerApplicationDocument"
       WHERE "id" = $1 AND "applicationId" = $2 LIMIT 1`,
      documentId,
      id,
    );
    if (!rows[0]) throw new NotFoundException('Document not found');
    if (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true') {
      return { url: `test://${rows[0].storageKey}`, expiresInSeconds: 300 };
    }
    return this.deliveryUploads.signedEvidenceUrl(rows[0].storageKey, {
      disposition: 'inline',
      filename: rows[0].originalFilename,
    });
  }

  override async claimActivation(id: string, accessToken: string) {
    const application = await this.deliveryRepository.requireApplication(id, accessToken);
    if (application.linkedExistingUser) {
      throw new ConflictException(
        'Partner access was added to your existing AAGAM account. Sign in with phone, password, or Google.',
      );
    }
    return super.claimActivation(id, accessToken);
  }
}
