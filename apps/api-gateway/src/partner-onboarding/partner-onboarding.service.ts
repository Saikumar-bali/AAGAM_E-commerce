import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '@aagam/database';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UploadService } from '../upload/upload.service';
import {
  ActivatePartnerAccountDto,
  CreatePartnerApplicationDto,
  UpdatePartnerApplicationDto,
  UploadPartnerDocumentDto,
} from './dto/partner-onboarding.dto';
import {
  allowedDocumentTypes,
  PartnerApplicationStatus,
  PartnerApplicationType,
  PartnerContactChannel,
} from './partner-onboarding.types';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';
import {
  PartnerApplicationRow,
  PartnerOnboardingRepository,
} from './partner-onboarding.repository';

@Injectable()
export class PartnerOnboardingService {
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

  private verificationCode(): string {
    return String(randomInt(100000, 1000000));
  }

  private exposeTestCode(code: string): string | undefined {
    return process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true'
      ? code
      : undefined;
  }

  async createApplication(dto: CreatePartnerApplicationDto) {
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
    const accessToken = this.security.issueAccessToken();
    const code = this.verificationCode();
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
    const applicationNumber = this.applicationNumber(dto.type);

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
        this.security.hash(accessToken),
        channel,
        this.security.verificationHash(id, code),
        expiresAt,
      );
      await this.repository.writeEvent(
        tx,
        id,
        'APPLICATION_CREATED',
        'APPLICANT',
        {
          toStatus: PartnerApplicationStatus.DRAFT,
          message: 'Partner application started.',
        },
      );
      await this.repository.writeEvent(tx, id, 'CONTACT_CODE_SENT', 'SYSTEM', {
        message: `Verification code sent to ${channel.toLowerCase()}.`,
        metadata: { channel, expiresAt: expiresAt.toISOString() },
      });
    });

    return {
      applicationId: id,
      applicationNumber,
      accessToken,
      verification: {
        channel,
        expiresAt,
        code: this.exposeTestCode(code),
      },
    };
  }

  async requestVerification(
    id: string,
    accessToken: string,
    channel: PartnerContactChannel,
  ) {
    const application = await this.repository.requireApplication(id, accessToken);
    this.repository.assertEditable(application);
    if (channel === PartnerContactChannel.EMAIL && !application.email) {
      throw new BadRequestException('Application does not have an email address');
    }
    if (channel === PartnerContactChannel.PHONE && !application.phoneE164) {
      throw new BadRequestException('Application does not have a phone number');
    }
    const code = this.verificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication"
         SET "verificationChannel" = $2, "verificationCodeHash" = $3,
             "verificationExpiresAt" = $4, "verificationAttempts" = 0,
             "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
        channel,
        this.security.verificationHash(id, code),
        expiresAt,
      );
      await this.repository.writeEvent(tx, id, 'CONTACT_CODE_SENT', 'SYSTEM', {
        message: `Verification code sent to ${channel.toLowerCase()}.`,
        metadata: { channel, expiresAt: expiresAt.toISOString() },
      });
    });
    return { channel, expiresAt, code: this.exposeTestCode(code) };
  }

  async verifyContact(id: string, accessToken: string, code: string) {
    const application = await this.repository.requireApplication(id, accessToken);
    this.repository.assertEditable(application);
    if (!application.verificationCodeHash || !application.verificationExpiresAt) {
      throw new BadRequestException('Request a verification code first');
    }
    if ((application.verificationAttempts || 0) >= 5) {
      throw new BadRequestException('Verification attempt limit reached');
    }
    if (new Date(application.verificationExpiresAt).getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired');
    }
    if (
      application.verificationCodeHash !==
      this.security.verificationHash(id, code.trim())
    ) {
      await prisma.$executeRawUnsafe(
        `UPDATE "PartnerApplication"
         SET "verificationAttempts" = "verificationAttempts" + 1,
             "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
      );
      throw new BadRequestException('Verification code is invalid');
    }
    const channel = application.verificationChannel as PartnerContactChannel;
    const verifiedColumn =
      channel === PartnerContactChannel.PHONE
        ? '"phoneVerifiedAt"'
        : '"emailVerifiedAt"';
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication"
         SET ${verifiedColumn} = CURRENT_TIMESTAMP,
             "verificationCodeHash" = NULL,
             "verificationExpiresAt" = NULL,
             "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
      );
      await this.repository.writeEvent(tx, id, 'CONTACT_VERIFIED', 'APPLICANT', {
        message: `${channel.toLowerCase()} verified.`,
        metadata: { channel },
      });
    });
    return this.getApplication(id, accessToken);
  }

  async getApplication(id: string, accessToken: string) {
    const application = await this.repository.requireApplication(id, accessToken);
    return this.repository.response(application);
  }

  async updateApplication(
    id: string,
    accessToken: string,
    dto: UpdatePartnerApplicationDto,
  ) {
    const application = await this.repository.requireApplication(id, accessToken);
    this.repository.assertEditable(application);
    const payload = this.security.protectPayload({
      ...(application.applicantPayload || {}),
      ...(dto.payload || {}),
    });
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phoneE164?.trim();
    const nextName = dto.applicantName?.trim() || application.applicantName;
    const nextEmail = email === undefined ? application.email : email;
    const nextPhone = phone === undefined ? application.phoneE164 : phone;
    const emailVerifiedAt =
      email && email !== application.email ? null : application.emailVerifiedAt;
    const phoneVerifiedAt =
      phone && phone !== application.phoneE164
        ? null
        : application.phoneVerifiedAt;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication"
         SET "applicantName" = $2, "email" = $3, "phoneE164" = $4,
             "emailVerifiedAt" = $5, "phoneVerifiedAt" = $6,
             "applicantPayload" = $7::jsonb, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        id,
        nextName,
        nextEmail,
        nextPhone,
        emailVerifiedAt,
        phoneVerifiedAt,
        JSON.stringify(payload),
      );
      await this.repository.writeEvent(tx, id, 'DRAFT_UPDATED', 'APPLICANT', {
        message: 'Application details updated.',
        metadata: {
          changedCoreFields: Object.keys(dto).filter((key) => key !== 'payload'),
          changedPayloadFields: Object.keys(dto.payload || {}),
        },
      });
    });
    return this.getApplication(id, accessToken);
  }

  async uploadDocument(
    id: string,
    accessToken: string,
    dto: UploadPartnerDocumentDto,
    file: Express.Multer.File,
  ) {
    const application = await this.repository.requireApplication(id, accessToken);
    this.repository.assertEditable(application);
    const type = dto.type.trim().toUpperCase();
    if (!allowedDocumentTypes(application.type).includes(type)) {
      throw new BadRequestException('Document type is not valid for this application');
    }
    if (!file) throw new BadRequestException('Document file is required');
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    let storageKey: string;
    try {
      storageKey = (
        await this.uploads.uploadEvidence(file, `partner-${application.id}`)
      ).storageKey;
    } catch (error) {
      if (process.env.NODE_ENV !== 'test' && process.env.PLAYWRIGHT_QA !== 'true') {
        throw error;
      }
      const extension = file.mimetype === 'application/pdf' ? 'pdf' : 'bin';
      storageKey = `evidence/partner-${application.id}/test-${randomUUID()}.${extension}`;
    }
    const documentNumber = dto.documentNumber?.replace(/\s+/g, '') || '';
    const last4 = documentNumber ? documentNumber.slice(-4) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Document expiry date is invalid');
    }

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerApplicationDocument" (
          "id", "applicationId", "type", "storageKey", "originalFilename",
          "mimeType", "fileSize", "checksum", "documentNumberLast4", "expiresAt"
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT ("applicationId", "type") DO UPDATE SET
          "storageKey" = EXCLUDED."storageKey",
          "originalFilename" = EXCLUDED."originalFilename",
          "mimeType" = EXCLUDED."mimeType",
          "fileSize" = EXCLUDED."fileSize",
          "checksum" = EXCLUDED."checksum",
          "documentNumberLast4" = EXCLUDED."documentNumberLast4",
          "expiresAt" = EXCLUDED."expiresAt", "status" = 'PENDING',
          "reviewNote" = NULL, "reviewedByUserId" = NULL,
          "reviewedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP`,
        randomUUID(),
        id,
        type,
        storageKey,
        file.originalname,
        file.mimetype,
        file.size,
        checksum,
        last4,
        expiresAt,
      );
      await this.repository.writeEvent(tx, id, 'DOCUMENT_UPLOADED', 'APPLICANT', {
        message: `${type.replaceAll('_', ' ').toLowerCase()} uploaded.`,
        metadata: { type, checksum, mimeType: file.mimetype, fileSize: file.size },
      });
    });
    return this.getApplication(id, accessToken);
  }

  async removeDocument(id: string, documentId: string, accessToken: string) {
    const application = await this.repository.requireApplication(id, accessToken);
    this.repository.assertEditable(application);
    const rows = await prisma.$queryRawUnsafe(
      `DELETE FROM "PartnerApplicationDocument"
       WHERE "id" = $1 AND "applicationId" = $2 RETURNING "type"`,
      documentId,
      id,
    );
    if (!rows[0]) throw new NotFoundException('Document not found');
    await this.repository.writeEvent(prisma, id, 'DOCUMENT_REMOVED', 'APPLICANT', {
      message: `${rows[0].type.replaceAll('_', ' ').toLowerCase()} removed.`,
      metadata: { type: rows[0].type },
    });
    return this.getApplication(id, accessToken);
  }

  async documentUrl(id: string, documentId: string, accessToken: string) {
    await this.repository.requireApplication(id, accessToken);
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "storageKey" FROM "PartnerApplicationDocument"
       WHERE "id" = $1 AND "applicationId" = $2 LIMIT 1`,
      documentId,
      id,
    );
    if (!rows[0]) throw new NotFoundException('Document not found');
    if (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true') {
      return { url: `test://${rows[0].storageKey}`, expiresInSeconds: 300 };
    }
    return this.uploads.signedEvidenceUrl(rows[0].storageKey);
  }

  async submitApplication(
    id: string,
    accessToken: string,
    idempotencyKey: string,
  ) {
    if (!idempotencyKey || idempotencyKey.length < 8) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const application = await this.repository.requireApplication(id, accessToken);
    if (
      [PartnerApplicationStatus.SUBMITTED, PartnerApplicationStatus.UNDER_REVIEW].includes(
        application.status,
      ) &&
      application.submissionIdempotencyKey === idempotencyKey
    ) {
      return this.repository.response(application);
    }
    this.repository.assertEditable(application);
    const documents = await this.repository.documents(id, true);
    this.repository.validateForSubmission(application, documents);
    const previousStatus = application.status;
    const version = application.submissionVersion + 1;
    const eventType =
      application.submissionVersion > 0
        ? 'APPLICATION_RESUBMITTED'
        : 'APPLICATION_SUBMITTED';
    const snapshot = {
      applicationNumber: application.applicationNumber,
      type: application.type,
      applicantName: application.applicantName,
      email: application.email,
      phoneE164: application.phoneE164,
      emailVerifiedAt: application.emailVerifiedAt,
      phoneVerifiedAt: application.phoneVerifiedAt,
      applicantPayload: application.applicantPayload,
      documents: documents.map(({ storageKey, ...document }) => document),
      submissionVersion: version,
      submittedAt: new Date().toISOString(),
    };

    await prisma.$transaction(async (tx) => {
      const updated = await tx.$queryRawUnsafe(
        `UPDATE "PartnerApplication" SET "status" = 'SUBMITTED',
          "submissionVersion" = $2, "submittedSnapshot" = $3::jsonb,
          "submissionIdempotencyKey" = $4, "submittedAt" = CURRENT_TIMESTAMP,
          "actionRequiredAt" = NULL, "actionRequests" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1 AND "status" IN ('DRAFT', 'ACTION_REQUIRED')
         RETURNING "id"`,
        id,
        version,
        JSON.stringify(snapshot),
        idempotencyKey,
      );
      if (!updated[0]) {
        throw new ConflictException('Application changed while being submitted');
      }
      await this.repository.writeEvent(tx, id, eventType, 'APPLICANT', {
        fromStatus: previousStatus,
        toStatus: PartnerApplicationStatus.SUBMITTED,
        message:
          eventType === 'APPLICATION_RESUBMITTED'
            ? 'Corrected application resubmitted for review.'
            : 'Application submitted for review.',
        metadata: { submissionVersion: version },
      });
    });
    return this.repository.response((await this.repository.findApplication(id))!);
  }

  async withdrawApplication(id: string, accessToken: string) {
    const application = await this.repository.requireApplication(id, accessToken);
    if (
      [
        PartnerApplicationStatus.APPROVED,
        PartnerApplicationStatus.REJECTED,
        PartnerApplicationStatus.WITHDRAWN,
      ].includes(application.status)
    ) {
      throw new ConflictException(`Application cannot be withdrawn from ${application.status}`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "status" = 'WITHDRAWN',
         "withdrawnAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        id,
      );
      await this.repository.writeEvent(
        tx,
        id,
        'APPLICATION_WITHDRAWN',
        'APPLICANT',
        {
          fromStatus: application.status,
          toStatus: PartnerApplicationStatus.WITHDRAWN,
          message: 'Application withdrawn by applicant.',
        },
      );
    });
    return this.getApplication(id, accessToken);
  }

  async events(id: string, accessToken: string) {
    await this.repository.requireApplication(id, accessToken);
    return this.repository.events(id, true);
  }

  async claimActivation(id: string, accessToken: string) {
    const application = await this.repository.requireApplication(id, accessToken);
    if (
      application.status !== PartnerApplicationStatus.APPROVED ||
      !application.provisionedUserId
    ) {
      throw new ConflictException('Account activation is not available yet');
    }
    const token = this.security.issueAccessToken();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerActivationToken" SET "revokedAt" = CURRENT_TIMESTAMP
         WHERE "applicationId" = $1 AND "usedAt" IS NULL AND "revokedAt" IS NULL`,
        id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO "PartnerActivationToken" (
          "id", "applicationId", "userId", "tokenHash", "expiresAt"
        ) VALUES ($1,$2,$3,$4,$5)`,
        randomUUID(),
        id,
        application.provisionedUserId,
        this.security.hash(token),
        expiresAt,
      );
      await this.repository.writeEvent(tx, id, 'ACTIVATION_SENT', 'SYSTEM', {
        message: 'Secure account activation started.',
        metadata: { expiresAt: expiresAt.toISOString() },
      });
    });
    return { token, expiresAt };
  }

  async activateAccount(dto: ActivatePartnerAccountDto) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "PartnerActivationToken"
       WHERE "tokenHash" = $1 LIMIT 1`,
      this.security.hash(dto.token),
    );
    const token = rows[0];
    if (
      !token ||
      token.usedAt ||
      token.revokedAt ||
      new Date(token.expiresAt).getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Activation token is invalid or expired');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "User" SET "password" = $2, "accountStatus" = 'ACTIVE',
         "mustChangePassword" = false, "activationExpiresAt" = NULL,
         "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        token.userId,
        passwordHash,
      );
      const application = await this.repository.findApplication(
        token.applicationId,
        tx,
      );
      if (application?.provisionedStoreId) {
        await tx.$executeRawUnsafe(
          `UPDATE "Store" SET "isActive" = true, "partnerStatus" = 'ACTIVE',
           "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          application.provisionedStoreId,
        );
      }
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerActivationToken" SET "usedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        token.id,
      );
      await this.repository.writeEvent(
        tx,
        token.applicationId,
        'ACCOUNT_ACTIVATED',
        'APPLICANT',
        { message: 'Partner account activated successfully.' },
      );
    });
    return { message: 'Partner account activated successfully' };
  }
}
