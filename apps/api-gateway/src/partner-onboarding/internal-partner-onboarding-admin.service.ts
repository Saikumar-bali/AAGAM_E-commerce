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
  AdminCreateInternalPartnerDto,
  AdminSubmitInternalPartnerDto,
  AdminUpdateInternalPartnerDto,
} from './dto/admin-internal-partner-onboarding.dto';
import { UploadPartnerDocumentDto } from './dto/partner-onboarding.dto';
import {
  PartnerApplicationRow,
  PartnerOnboardingRepository,
} from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import {
  allowedDocumentTypes,
  PartnerApplicationStatus,
  PartnerApplicationType,
  PartnerContactChannel,
} from './partner-onboarding.types';

const ADMIN_EDITABLE = [
  PartnerApplicationStatus.DRAFT,
  PartnerApplicationStatus.ACTION_REQUIRED,
];

@Injectable()
export class InternalPartnerOnboardingAdminService {
  constructor(
    private readonly repository: PartnerOnboardingRepository,
    private readonly security: PartnerOnboardingSecurity,
    private readonly uploads: UploadService,
  ) {}

  private applicationNumber(type: PartnerApplicationType): string {
    const prefix = type === PartnerApplicationType.RIDER ? 'RID' : 'STR';
    return `AAG-${prefix}-${new Date().getUTCFullYear()}-${randomBytes(5)
      .toString('hex')
      .toUpperCase()}`;
  }

  private async application(id: string): Promise<PartnerApplicationRow> {
    const application = await this.repository.findApplication(id);
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  private assertAdminEditable(application: PartnerApplicationRow) {
    if (application.deletedAt) {
      throw new ConflictException('Deleted applications cannot be edited');
    }
    if (!ADMIN_EDITABLE.includes(application.status)) {
      throw new ConflictException(
        'Internal application details and documents can only be changed while Draft or Action Required',
      );
    }
  }

  private async assertUniqueApplicationContact(
    email: string | null,
    phone: string,
    excludeId?: string,
  ) {
    if (email) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT "id" FROM "PartnerApplication"
         WHERE LOWER("email") = $1 AND "deletedAt" IS NULL
           AND "status" NOT IN ('REJECTED', 'WITHDRAWN', 'EXPIRED')
           AND ($2::text IS NULL OR "id" <> $2) LIMIT 1`,
        email,
        excludeId || null,
      );
      if (rows[0]) {
        throw new ConflictException('An active application already uses this email');
      }
    }

    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id" FROM "PartnerApplication"
       WHERE "phoneE164" = $1 AND "deletedAt" IS NULL
         AND "status" NOT IN ('REJECTED', 'WITHDRAWN', 'EXPIRED')
         AND ($2::text IS NULL OR "id" <> $2) LIMIT 1`,
      phone,
      excludeId || null,
    );
    if (rows[0]) {
      throw new ConflictException('An active application already uses this phone');
    }
  }

  async create(adminUserId: string, dto: AdminCreateInternalPartnerDto) {
    const phone = normalizePhoneE164(dto.phoneE164);
    const email = dto.email?.trim().toLowerCase() || null;
    await this.assertUniqueApplicationContact(email, phone);

    const id = randomUUID();
    const applicationNumber = this.applicationNumber(dto.type);
    const internalSecret = this.security.issueAccessToken();
    const payload = this.security.protectPayload(dto.payload || {});

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerApplication" (
          "id", "applicationNumber", "type", "applicantName", "email",
          "phoneE164", "accessSecretHash", "verificationChannel", "applicantPayload"
        ) VALUES ($1,$2,$3::"PartnerApplicationType",$4,$5,$6,$7,$8,$9::jsonb)`,
        id,
        applicationNumber,
        dto.type,
        dto.applicantName.trim(),
        email,
        phone,
        this.security.hash(internalSecret),
        PartnerContactChannel.PHONE,
        JSON.stringify(payload),
      );
      await this.repository.writeEvent(tx, id, 'APPLICATION_CREATED', 'ADMIN', {
        actorUserId: adminUserId,
        toStatus: PartnerApplicationStatus.DRAFT,
        applicantVisible: false,
        message: 'Internal partner application created by Admin.',
        metadata: { source: 'ADMIN_INTERNAL', primaryContact: 'PHONE' },
      });
    });

    return this.repository.adminDetail(id);
  }

  async update(
    id: string,
    adminUserId: string,
    dto: AdminUpdateInternalPartnerDto,
  ) {
    const application = await this.application(id);
    this.assertAdminEditable(application);

    const nextPhone = dto.phoneE164
      ? normalizePhoneE164(dto.phoneE164)
      : application.phoneE164!;
    if (!nextPhone) throw new BadRequestException('Primary mobile number is required');
    const nextEmail =
      dto.email === undefined
        ? application.email
        : dto.email.trim().toLowerCase() || null;
    await this.assertUniqueApplicationContact(nextEmail, nextPhone, id);

    const payload = this.security.protectPayload({
      ...(application.applicantPayload || {}),
      ...(dto.payload || {}),
    });
    const phoneChanged = nextPhone !== application.phoneE164;
    const emailChanged = nextEmail !== application.email;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET
          "applicantName" = $2, "email" = $3, "phoneE164" = $4,
          "emailVerifiedAt" = $5, "phoneVerifiedAt" = $6,
          "applicantPayload" = $7::jsonb, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        id,
        dto.applicantName?.trim() || application.applicantName,
        nextEmail,
        nextPhone,
        emailChanged ? null : application.emailVerifiedAt,
        phoneChanged ? null : application.phoneVerifiedAt,
        JSON.stringify(payload),
      );
      await this.repository.writeEvent(tx, id, 'DRAFT_UPDATED', 'ADMIN', {
        actorUserId: adminUserId,
        applicantVisible: false,
        message: 'Internal partner application details updated by Admin.',
        metadata: {
          source: 'ADMIN_INTERNAL',
          changedCoreFields: Object.keys(dto).filter((key) => key !== 'payload'),
          changedPayloadFields: Object.keys(dto.payload || {}),
        },
      });
    });

    return this.repository.adminDetail(id);
  }

  async uploadDocument(
    id: string,
    adminUserId: string,
    dto: UploadPartnerDocumentDto,
    file: Express.Multer.File,
  ) {
    const application = await this.application(id);
    this.assertAdminEditable(application);
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
        await this.uploads.uploadEvidence(file, {
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
      storageKey = `partner-applications/${application.type.toLowerCase()}s/${application.id}/${type.toLowerCase()}/admin-${randomUUID()}.${extension}`;
    }

    const documentNumber = dto.documentNumber?.replace(/\s+/g, '') || '';
    const last4 = documentNumber ? documentNumber.slice(-4) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      await this.uploads.deleteEvidence(storageKey);
      throw new BadRequestException('Document expiry date is invalid');
    }

    try {
      await prisma.$transaction(async (tx) => {
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
        await this.repository.writeEvent(tx, id, 'DOCUMENT_UPLOADED', 'ADMIN', {
          actorUserId: adminUserId,
          applicantVisible: false,
          message: `${type.replaceAll('_', ' ').toLowerCase()} uploaded by Admin.`,
          metadata: {
            source: 'ADMIN_INTERNAL',
            type,
            checksum,
            mimeType: file.mimetype,
            fileSize: file.size,
            version: Number(previous[0]?.version || 0) + 1,
          },
        });
      });
    } catch (error) {
      await this.uploads.deleteEvidence(storageKey);
      throw error;
    }

    if (previous[0]?.storageKey && previous[0].storageKey !== storageKey) {
      await this.uploads.deleteEvidence(previous[0].storageKey);
    }
    return this.repository.adminDetail(id);
  }

  async removeDocument(id: string, documentId: string, adminUserId: string) {
    const application = await this.application(id);
    this.assertAdminEditable(application);
    let removed: any;
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe(
        `DELETE FROM "PartnerApplicationDocument"
         WHERE "id" = $1 AND "applicationId" = $2
         RETURNING "type", "storageKey"`,
        documentId,
        id,
      );
      if (!rows[0]) throw new NotFoundException('Document not found');
      removed = rows[0];
      await this.repository.writeEvent(tx, id, 'DOCUMENT_REMOVED', 'ADMIN', {
        actorUserId: adminUserId,
        applicantVisible: false,
        message: `${removed.type.replaceAll('_', ' ').toLowerCase()} removed by Admin.`,
        metadata: { source: 'ADMIN_INTERNAL', type: removed.type },
      });
    });
    if (removed?.storageKey) await this.uploads.deleteEvidence(removed.storageKey);
    return this.repository.adminDetail(id);
  }

  async submitForReview(
    id: string,
    adminUserId: string,
    dto: AdminSubmitInternalPartnerDto,
  ) {
    const application = await this.application(id);
    if (application.status === PartnerApplicationStatus.UNDER_REVIEW) {
      return this.repository.adminDetail(id);
    }
    this.assertAdminEditable(application);
    const documents = await this.repository.documents(id, true);
    this.repository.validateForSubmission(application, documents);

    const version = application.submissionVersion + 1;
    const snapshot = {
      applicationNumber: application.applicationNumber,
      type: application.type,
      applicantName: application.applicantName,
      email: application.email,
      phoneE164: application.phoneE164,
      emailVerifiedAt: application.emailVerifiedAt,
      phoneVerifiedAt: application.phoneVerifiedAt,
      applicantPayload: application.applicantPayload,
      documents: documents.map(({ storageKey: _storageKey, ...document }) => document),
      submissionVersion: version,
      submittedAt: new Date().toISOString(),
      source: 'ADMIN_INTERNAL',
    };

    await prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRawUnsafe(
        `UPDATE "PartnerApplication" SET
          "status" = 'UNDER_REVIEW', "submissionVersion" = $2,
          "submittedSnapshot" = $3::jsonb, "submissionIdempotencyKey" = NULL,
          "submittedAt" = CURRENT_TIMESTAMP, "assignedReviewerUserId" = $4,
          "reviewStartedAt" = COALESCE("reviewStartedAt", CURRENT_TIMESTAMP),
          "actionRequiredAt" = NULL, "actionRequests" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1 AND "status" IN ('DRAFT', 'ACTION_REQUIRED')
         RETURNING "id"`,
        id,
        version,
        JSON.stringify(snapshot),
        adminUserId,
      );
      if (!updated[0]) {
        throw new ConflictException('Application changed before internal review could start');
      }
      await this.repository.writeEvent(tx, id, 'APPLICATION_SUBMITTED', 'ADMIN', {
        actorUserId: adminUserId,
        fromStatus: application.status,
        toStatus: PartnerApplicationStatus.UNDER_REVIEW,
        applicantVisible: false,
        message: dto.note?.trim() || 'Internal application completed and submitted by Admin.',
        metadata: { source: 'ADMIN_INTERNAL', submissionVersion: version },
      });
      await this.repository.writeEvent(tx, id, 'REVIEW_STARTED', 'ADMIN', {
        actorUserId: adminUserId,
        fromStatus: application.status,
        toStatus: PartnerApplicationStatus.UNDER_REVIEW,
        applicantVisible: false,
        message: 'Internal application assigned to the creating Admin for review.',
        metadata: { source: 'ADMIN_INTERNAL' },
      });
    });

    return this.repository.adminDetail(id);
  }
}
