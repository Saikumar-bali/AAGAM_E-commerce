import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma } from '@aagam/database';
import { randomUUID } from 'crypto';
import {
  allowedDocumentTypes,
  JsonRecord,
  PartnerApplicationStatus,
  PartnerApplicationType,
  PartnerDocumentStatus,
  REQUIRED_PAYLOAD_FIELDS,
  requiredDocumentTypes,
} from './partner-onboarding.types';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';

export interface PartnerApplicationRow {
  id: string;
  applicationNumber: string;
  type: PartnerApplicationType;
  status: PartnerApplicationStatus;
  submissionVersion: number;
  applicantName: string;
  email: string | null;
  phoneE164: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  accessSecretHash?: string;
  verificationChannel?: string | null;
  verificationCodeHash?: string | null;
  verificationExpiresAt?: Date | null;
  verificationAttempts?: number;
  assignedReviewerUserId: string | null;
  applicantPayload: JsonRecord;
  submittedSnapshot: JsonRecord | null;
  actionRequests: JsonRecord | null;
  submissionIdempotencyKey?: string | null;
  submittedAt: Date | null;
  reviewStartedAt: Date | null;
  actionRequiredAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  withdrawnAt: Date | null;
  provisionedUserId: string | null;
  provisionedStoreId: string | null;
  linkedExistingUser?: boolean;
  deletedAt?: Date | null;
  deletedByUserId?: string | null;
  deletionReason?: string | null;
  scheduledPurgeAt?: Date | null;
  contactVerificationMethod?: string | null;
  contactVerifiedByUserId?: string | null;
  contactVerificationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerDocumentRow {
  id: string;
  applicationId: string;
  type: string;
  storageKey?: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  documentNumberLast4: string | null;
  expiresAt: Date | null;
  status: PartnerDocumentStatus;
  reviewNote: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  version?: number;
  uploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EDITABLE = [
  PartnerApplicationStatus.DRAFT,
  PartnerApplicationStatus.SUBMITTED,
  PartnerApplicationStatus.UNDER_REVIEW,
  PartnerApplicationStatus.ACTION_REQUIRED,
];

@Injectable()
export class PartnerOnboardingRepository {
  constructor(private readonly security: PartnerOnboardingSecurity) {}

  async findApplication(id: string, db: any = prisma): Promise<PartnerApplicationRow | null> {
    const rows = await db.$queryRawUnsafe(
      'SELECT * FROM "PartnerApplication" WHERE "id" = $1 LIMIT 1',
      id,
    );
    return rows[0] || null;
  }

  async requireApplication(
    id: string,
    accessToken: string,
    db: any = prisma,
  ): Promise<PartnerApplicationRow> {
    if (!accessToken || accessToken.length < 32) {
      throw new UnauthorizedException('Application access could not be verified');
    }
    const rows = await db.$queryRawUnsafe(
      `SELECT * FROM "PartnerApplication"
       WHERE "id" = $1 AND "accessSecretHash" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      id,
      this.security.hash(accessToken),
    );
    if (!rows[0]) throw new UnauthorizedException('Application access could not be verified');
    return rows[0];
  }

  assertEditable(application: PartnerApplicationRow) {
    if (application.deletedAt) throw new ConflictException('Application has been deleted');
    if (!EDITABLE.includes(application.status)) {
      throw new ConflictException(
        `Application cannot be edited while status is ${application.status}`,
      );
    }
  }

  async reopenForApplicantEdit(application: PartnerApplicationRow, db: any = prisma) {
    if (
      ![
        PartnerApplicationStatus.SUBMITTED,
        PartnerApplicationStatus.UNDER_REVIEW,
      ].includes(application.status)
    ) {
      return false;
    }
    const fromStatus = application.status;
    await db.$executeRawUnsafe(
      `UPDATE "PartnerApplication" SET "status" = 'DRAFT',
        "assignedReviewerUserId" = NULL, "reviewStartedAt" = NULL,
        "submittedSnapshot" = NULL, "submissionIdempotencyKey" = NULL,
        "submittedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      application.id,
    );
    await db.$executeRawUnsafe(
      `UPDATE "PartnerApplicationDocument" SET "status" = 'PENDING',
        "reviewNote" = NULL, "reviewedByUserId" = NULL, "reviewedAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP WHERE "applicationId" = $1`,
      application.id,
    );
    await this.writeEvent(db, application.id, 'APPLICATION_REOPENED_FOR_EDIT', 'APPLICANT', {
      fromStatus,
      toStatus: PartnerApplicationStatus.DRAFT,
      message: 'Application reopened for editing. Submit it again when the updates are complete.',
    });
    application.status = PartnerApplicationStatus.DRAFT;
    return true;
  }

  async documents(
    applicationId: string,
    includeStorageKey = false,
    db: any = prisma,
  ): Promise<PartnerDocumentRow[]> {
    const columns = includeStorageKey
      ? '*'
      : `"id", "applicationId", "type", "originalFilename", "mimeType",
         "fileSize", "checksum", "documentNumberLast4", "expiresAt", "status",
         "reviewNote", "reviewedByUserId", "reviewedAt", "version", "uploadedAt",
         "createdAt", "updatedAt"`;
    return db.$queryRawUnsafe(
      `SELECT ${columns} FROM "PartnerApplicationDocument"
       WHERE "applicationId" = $1 ORDER BY "createdAt" ASC`,
      applicationId,
    );
  }

  async events(applicationId: string, applicantOnly = false, db: any = prisma) {
    return db.$queryRawUnsafe(
      `SELECT "id", "eventType", "actorKind", "actorUserId", "fromStatus",
              "toStatus", "applicantVisible", "message", "metadata", "createdAt"
       FROM "PartnerApplicationEvent"
       WHERE "applicationId" = $1 ${applicantOnly ? 'AND "applicantVisible" = true' : ''}
       ORDER BY "createdAt" ASC`,
      applicationId,
    );
  }

  async writeEvent(
    db: any,
    applicationId: string,
    eventType: string,
    actorKind: 'APPLICANT' | 'ADMIN' | 'SYSTEM',
    options: {
      actorUserId?: string | null;
      fromStatus?: PartnerApplicationStatus | null;
      toStatus?: PartnerApplicationStatus | null;
      applicantVisible?: boolean;
      message?: string | null;
      metadata?: JsonRecord | null;
    } = {},
  ) {
    await db.$executeRawUnsafe(
      `INSERT INTO "PartnerApplicationEvent" (
        "id", "applicationId", "eventType", "actorUserId", "actorKind",
        "fromStatus", "toStatus", "applicantVisible", "message", "metadata"
      ) VALUES ($1, $2, $3::"PartnerApplicationEventType", $4, $5,
                $6::"PartnerApplicationStatus", $7::"PartnerApplicationStatus",
                $8, $9, $10::jsonb)`,
      randomUUID(),
      applicationId,
      eventType,
      options.actorUserId || null,
      actorKind,
      options.fromStatus || null,
      options.toStatus || null,
      options.applicantVisible !== false,
      options.message || null,
      JSON.stringify(options.metadata || {}),
    );
  }

  normalize(row: PartnerApplicationRow) {
    const {
      accessSecretHash,
      verificationCodeHash,
      submissionIdempotencyKey,
      ...safe
    } = row;
    const snapshot = row.submittedSnapshot as any;
    return {
      ...safe,
      applicantPayload: this.security.sanitizePayload(row.applicantPayload),
      submittedSnapshot: snapshot
        ? {
            ...snapshot,
            applicantPayload: this.security.sanitizePayload(snapshot.applicantPayload),
          }
        : null,
    };
  }

  missingPayloadFields(application: PartnerApplicationRow): string[] {
    const payload = application.applicantPayload || {};
    return REQUIRED_PAYLOAD_FIELDS[application.type].filter((field) => {
      const value = payload[field];
      return value === undefined || value === null || value === '';
    });
  }

  validateForSubmission(
    application: PartnerApplicationRow,
    documents: PartnerDocumentRow[],
    requireVerifiedDocuments = false,
  ) {
    if (!application.emailVerifiedAt && !application.phoneVerifiedAt) {
      throw new BadRequestException('Verify at least one contact method before submission');
    }
    const missingFields = this.missingPayloadFields(application);
    if (missingFields.length) {
      throw new BadRequestException({
        message: 'Application details are incomplete',
        missingFields,
      });
    }
    const required = requiredDocumentTypes(application.type, application.applicantPayload);
    const byType = new Map(documents.map((document) => [document.type, document]));
    const missingDocuments = required.filter((type) => !byType.has(type));
    if (missingDocuments.length) {
      throw new BadRequestException({
        message: 'Mandatory documents are missing',
        missingDocuments,
      });
    }
    const blockedDocuments = required.filter((type) => {
      const status = byType.get(type)?.status;
      if (requireVerifiedDocuments) return status !== PartnerDocumentStatus.VERIFIED;
      return [
        PartnerDocumentStatus.REJECTED,
        PartnerDocumentStatus.REPLACEMENT_REQUIRED,
        PartnerDocumentStatus.EXPIRED,
      ].includes(status as PartnerDocumentStatus);
    });
    if (blockedDocuments.length) {
      throw new BadRequestException({
        message: requireVerifiedDocuments
          ? 'All mandatory documents must be verified before approval'
          : 'Replace rejected or expired mandatory documents before submission',
        blockedDocuments,
      });
    }
  }

  async response(application: PartnerApplicationRow) {
    const documents = await this.documents(application.id);
    const required = requiredDocumentTypes(application.type, application.applicantPayload);
    const completedRequired = required.filter((type) =>
      documents.some(
        (document) =>
          document.type === type &&
          ![
            PartnerDocumentStatus.REJECTED,
            PartnerDocumentStatus.REPLACEMENT_REQUIRED,
            PartnerDocumentStatus.EXPIRED,
          ].includes(document.status),
      ),
    );
    return {
      application: this.normalize(application),
      documents,
      requirements: {
        requiredDocuments: required,
        allowedDocuments: allowedDocumentTypes(application.type),
        completedRequired,
        completionPercent: required.length
          ? Math.round((completedRequired.length / required.length) * 100)
          : 100,
      },
    };
  }

  async adminDetail(id: string) {
    const application = await this.findApplication(id);
    if (!application) throw new NotFoundException('Application not found');
    const response = await this.response(application);
    return { ...response, events: await this.events(id) };
  }

  async listAdmin(filters: {
    type?: string;
    status?: string;
    search?: string;
    visibility?: 'active' | 'deleted' | 'all';
    page: number;
    limit: number;
  }) {
    const type = filters.type || '';
    const status = filters.status?.trim().toUpperCase() || '';
    const search = filters.search?.trim() || '';
    const visibility = filters.visibility || 'active';
    const pattern = `%${search}%`;
    const offset = (filters.page - 1) * filters.limit;
    const where = `
      ($1 = '' OR "type"::text = $1)
      AND ($2 = '' OR "status"::text = $2)
      AND ($3 = '' OR "applicationNumber" ILIKE $4 OR "applicantName" ILIKE $4
        OR COALESCE("email", '') ILIKE $4 OR COALESCE("phoneE164", '') ILIKE $4)
      AND ($5 = 'all' OR ($5 = 'deleted' AND "deletedAt" IS NOT NULL)
        OR ($5 = 'active' AND "deletedAt" IS NULL))`;
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "PartnerApplication" WHERE ${where}
       ORDER BY CASE "status"
         WHEN 'SUBMITTED' THEN 1 WHEN 'UNDER_REVIEW' THEN 2
         WHEN 'ACTION_REQUIRED' THEN 3 ELSE 4 END,
         "updatedAt" DESC LIMIT $6 OFFSET $7`,
      type,
      status,
      search,
      pattern,
      visibility,
      filters.limit,
      offset,
    );
    const countRows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS "count" FROM "PartnerApplication" WHERE ${where}`,
      type,
      status,
      search,
      pattern,
      visibility,
    );
    return {
      items: rows.map((row: PartnerApplicationRow) => this.normalize(row)),
      total: Number(countRows[0]?.count || 0),
      page: filters.page,
      limit: filters.limit,
    };
  }
}
