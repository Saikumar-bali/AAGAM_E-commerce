import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { randomUUID } from 'crypto';
import { grantUserRole } from '../auth/user-roles';
import { UploadService } from '../upload/upload.service';
import {
  AdminPartnerListQueryDto,
  AdminVerifyPartnerContactDto,
  ApprovePartnerApplicationDto,
  DeletePartnerDraftDto,
  RejectPartnerApplicationDto,
  RequestPartnerChangesDto,
  ReviewPartnerDocumentDto,
} from './dto/partner-onboarding.dto';
import {
  PartnerApplicationStatus,
  PartnerApplicationType,
  PartnerContactChannel,
} from './partner-onboarding.types';
import {
  PartnerApplicationRow,
  PartnerDocumentRow,
  PartnerOnboardingRepository,
} from './partner-onboarding.repository';

const REVIEWABLE = [
  PartnerApplicationStatus.SUBMITTED,
  PartnerApplicationStatus.UNDER_REVIEW,
  PartnerApplicationStatus.ACTION_REQUIRED,
];
const DELETABLE = [
  PartnerApplicationStatus.DRAFT,
  PartnerApplicationStatus.WITHDRAWN,
  PartnerApplicationStatus.EXPIRED,
];

@Injectable()
export class PartnerOnboardingAdminService {
  constructor(
    private readonly repository: PartnerOnboardingRepository,
    private readonly uploads: UploadService,
  ) {}

  list(query: AdminPartnerListQueryDto) {
    return this.repository.listAdmin(query);
  }

  detail(id: string) {
    return this.repository.adminDetail(id);
  }

  private async application(id: string): Promise<PartnerApplicationRow> {
    const application = await this.repository.findApplication(id);
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  private assertReviewable(application: PartnerApplicationRow) {
    if (application.deletedAt) throw new ConflictException('Deleted applications cannot be reviewed');
    if (!REVIEWABLE.includes(application.status)) {
      throw new ConflictException('Application is not in a reviewable state');
    }
  }

  async startReview(id: string, adminUserId: string, note?: string) {
    const application = await this.application(id);
    if (application.deletedAt) throw new ConflictException('Deleted applications cannot enter review');
    if (application.status !== PartnerApplicationStatus.SUBMITTED) {
      throw new ConflictException('Only submitted applications can enter review');
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "status" = 'UNDER_REVIEW',
         "assignedReviewerUserId" = $2,
         "reviewStartedAt" = COALESCE("reviewStartedAt", CURRENT_TIMESTAMP),
         "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
        adminUserId,
      );
      await this.repository.writeEvent(tx, id, 'REVIEW_STARTED', 'ADMIN', {
        actorUserId: adminUserId,
        fromStatus: application.status,
        toStatus: PartnerApplicationStatus.UNDER_REVIEW,
        message: note?.trim() || 'Application review started.',
      });
    });
    return this.detail(id);
  }

  async reviewDocument(
    applicationId: string,
    documentId: string,
    adminUserId: string,
    dto: ReviewPartnerDocumentDto,
  ) {
    const application = await this.application(applicationId);
    this.assertReviewable(application);
    const decision = dto.decision.toUpperCase();
    if (!['VERIFIED', 'REJECTED', 'REPLACEMENT_REQUIRED'].includes(decision)) {
      throw new BadRequestException('Document review decision is invalid');
    }
    if (decision !== 'VERIFIED' && !dto.note?.trim()) {
      throw new BadRequestException('A review note is required');
    }
    const updated = await prisma.$queryRawUnsafe(
      `UPDATE "PartnerApplicationDocument"
       SET "status" = $3::"PartnerApplicationDocumentStatus",
           "reviewNote" = $4, "reviewedByUserId" = $5,
           "reviewedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "applicationId" = $2 RETURNING "type"`,
      documentId,
      applicationId,
      decision,
      dto.note?.trim() || null,
      adminUserId,
    );
    if (!updated[0]) throw new NotFoundException('Document not found');
    await this.repository.writeEvent(
      prisma,
      applicationId,
      decision === 'VERIFIED' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
      'ADMIN',
      {
        actorUserId: adminUserId,
        message:
          decision === 'VERIFIED'
            ? `${updated[0].type.replaceAll('_', ' ').toLowerCase()} verified.`
            : dto.note,
        metadata: { documentId, type: updated[0].type, decision },
      },
    );
    return this.detail(applicationId);
  }

  async verifyAllDocuments(applicationId: string, adminUserId: string, note?: string) {
    const application = await this.application(applicationId);
    this.assertReviewable(application);
    const documents = await this.repository.documents(applicationId, true);
    if (!documents.length) throw new BadRequestException('No documents are available to verify');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplicationDocument"
         SET "status" = 'VERIFIED', "reviewNote" = $2,
             "reviewedByUserId" = $3, "reviewedAt" = CURRENT_TIMESTAMP,
             "updatedAt" = CURRENT_TIMESTAMP
         WHERE "applicationId" = $1`,
        applicationId,
        note?.trim() || 'Verified by Admin after reviewing submitted evidence.',
        adminUserId,
      );
      await this.repository.writeEvent(tx, applicationId, 'DOCUMENTS_VERIFIED', 'ADMIN', {
        actorUserId: adminUserId,
        message: `${documents.length} submitted document${documents.length === 1 ? '' : 's'} verified by AAGAM Admin.`,
        metadata: { documentIds: documents.map((document) => document.id), note: note?.trim() || null },
      });
    });
    return this.detail(applicationId);
  }

  async documentUrl(
    applicationId: string,
    documentId: string,
    disposition: 'inline' | 'attachment',
  ) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "storageKey", "originalFilename" FROM "PartnerApplicationDocument"
       WHERE "id" = $1 AND "applicationId" = $2 LIMIT 1`,
      documentId,
      applicationId,
    );
    if (!rows[0]) throw new NotFoundException('Document not found');
    await this.repository.writeEvent(prisma, applicationId, 'DOCUMENT_ACCESSED', 'ADMIN', {
      applicantVisible: false,
      message: `Private document opened for ${disposition === 'attachment' ? 'download' : 'review'}.`,
      metadata: { documentId, disposition },
    });
    if (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true') {
      return { url: `test://${rows[0].storageKey}`, expiresInSeconds: 300 };
    }
    return this.uploads.signedEvidenceUrl(rows[0].storageKey, {
      disposition,
      filename: rows[0].originalFilename,
    });
  }

  async adminVerifyContact(
    id: string,
    adminUserId: string,
    dto: AdminVerifyPartnerContactDto,
  ) {
    const application = await this.application(id);
    if (application.deletedAt) throw new ConflictException('Deleted applications cannot be verified');
    const column =
      dto.channel === PartnerContactChannel.EMAIL ? '"emailVerifiedAt"' : '"phoneVerifiedAt"';
    const value =
      dto.channel === PartnerContactChannel.EMAIL ? application.email : application.phoneE164;
    if (!value) throw new BadRequestException(`Application does not contain a ${dto.channel.toLowerCase()}`);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET ${column} = CURRENT_TIMESTAMP,
          "contactVerificationMethod" = $2,
          "contactVerifiedByUserId" = $3,
          "contactVerificationReason" = $4,
          "verificationCodeHash" = NULL, "verificationExpiresAt" = NULL,
          "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
        dto.method,
        adminUserId,
        dto.reason.trim(),
      );
      await this.repository.writeEvent(tx, id, 'CONTACT_VERIFIED_BY_ADMIN', 'ADMIN', {
        actorUserId: adminUserId,
        message: `Your ${dto.channel.toLowerCase()} was verified by AAGAM support.`,
        metadata: { channel: dto.channel, method: dto.method, reason: dto.reason.trim() },
      });
    });
    return this.detail(id);
  }

  async deleteDraft(id: string, adminUserId: string, dto: DeletePartnerDraftDto) {
    const application = await this.application(id);
    if (application.deletedAt) return this.detail(id);
    if (!DELETABLE.includes(application.status)) {
      throw new ConflictException('Only Draft, Withdrawn or Expired applications can be deleted');
    }
    const scheduledPurgeAt = new Date(Date.now() + dto.retentionDays * 24 * 60 * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "deletedAt" = CURRENT_TIMESTAMP,
         "deletedByUserId" = $2, "deletionReason" = $3,
         "scheduledPurgeAt" = $4, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
        adminUserId,
        dto.reason.trim(),
        scheduledPurgeAt,
      );
      await this.repository.writeEvent(tx, id, 'APPLICATION_DELETED', 'ADMIN', {
        actorUserId: adminUserId,
        applicantVisible: false,
        message: 'Draft application moved to deleted items.',
        metadata: { reason: dto.reason.trim(), scheduledPurgeAt: scheduledPurgeAt.toISOString() },
      });
    });
    return this.detail(id);
  }

  async restoreDraft(id: string, adminUserId: string) {
    const application = await this.application(id);
    if (!application.deletedAt) return this.detail(id);
    if (!DELETABLE.includes(application.status)) {
      throw new ConflictException('This application cannot be restored as a draft');
    }
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "deletedAt" = NULL,
         "deletedByUserId" = NULL, "deletionReason" = NULL,
         "scheduledPurgeAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
      );
      await this.repository.writeEvent(tx, id, 'APPLICATION_RESTORED', 'ADMIN', {
        actorUserId: adminUserId,
        applicantVisible: false,
        message: 'Deleted draft restored by Admin.',
      });
    });
    return this.detail(id);
  }

  async requestChanges(
    id: string,
    adminUserId: string,
    dto: RequestPartnerChangesDto,
  ) {
    const application = await this.application(id);
    this.assertReviewable(application);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "status" = 'ACTION_REQUIRED',
         "actionRequests" = $2::jsonb, "actionRequiredAt" = CURRENT_TIMESTAMP,
         "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        id,
        JSON.stringify(dto.requests),
      );
      await this.repository.writeEvent(tx, id, 'CHANGES_REQUESTED', 'ADMIN', {
        actorUserId: adminUserId,
        fromStatus: application.status,
        toStatus: PartnerApplicationStatus.ACTION_REQUIRED,
        message: dto.message.trim(),
        metadata: { requests: dto.requests },
      });
    });
    return this.detail(id);
  }

  async reject(id: string, adminUserId: string, dto: RejectPartnerApplicationDto) {
    const application = await this.application(id);
    this.assertReviewable(application);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "status" = 'REJECTED',
         "rejectedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        id,
      );
      await this.repository.writeEvent(tx, id, 'APPLICATION_REJECTED', 'ADMIN', {
        actorUserId: adminUserId,
        fromStatus: application.status,
        toStatus: PartnerApplicationStatus.REJECTED,
        message: dto.message.trim(),
        metadata: { reasonCode: dto.reasonCode.trim().toUpperCase() },
      });
    });
    return this.detail(id);
  }

  private async existingOperationalUser(application: PartnerApplicationRow, email: string) {
    const byEmail = await prisma.user.findUnique({ where: { email } });
    const byPhone = application.phoneE164
      ? await prisma.user.findUnique({ where: { phone: application.phoneE164 } })
      : null;
    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      throw new ConflictException('Verified email and phone belong to different accounts');
    }
    return byEmail || byPhone || null;
  }

  private async promoteDocuments(
    application: PartnerApplicationRow,
    documents: PartnerDocumentRow[],
    ownerId: string,
  ) {
    const promoted = new Map<string, string>();
    const createdKeys: string[] = [];
    if (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true') {
      documents.forEach((document) => promoted.set(document.id, document.storageKey || ''));
      return { promoted, createdKeys };
    }
    try {
      for (const document of documents) {
        if (!document.storageKey) continue;
        const key = await this.uploads.promoteEvidence(document.storageKey, {
          scope: application.type === PartnerApplicationType.RIDER ? 'riders' : 'stores',
          ownerId,
          documentType: document.type,
        });
        promoted.set(document.id, key);
        createdKeys.push(key);
      }
      return { promoted, createdKeys };
    } catch (error) {
      await this.uploads.deleteEvidenceMany(createdKeys);
      throw error;
    }
  }

  async approveAndProvision(
    id: string,
    adminUserId: string,
    dto: ApprovePartnerApplicationDto,
  ) {
    const application = await this.application(id);
    if (application.status === PartnerApplicationStatus.APPROVED) return this.detail(id);
    this.assertReviewable(application);
    const documents = await this.repository.documents(id, true);
    this.repository.validateForSubmission(application, documents, true);
    const email = (dto.ownerEmail || application.email || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('A verified operational email is required');

    const existingUser = await this.existingOperationalUser(application, email);
    const targetRole =
      application.type === PartnerApplicationType.RIDER ? Role.RIDER : Role.STORE_OWNER;
    if (existingUser && application.type === PartnerApplicationType.RIDER) {
      const existingRider = await prisma.riderProfile.findUnique({ where: { userId: existingUser.id } });
      if (existingRider) throw new ConflictException('This account already has a Rider profile');
    }
    if (application.provisionedUserId || application.provisionedStoreId) {
      throw new ConflictException('Application has already been provisioned');
    }

    const userId = existingUser?.id || randomUUID();
    const riderProfileId = application.type === PartnerApplicationType.RIDER ? randomUUID() : null;
    const storeId = application.type === PartnerApplicationType.STORE ? randomUUID() : null;
    const finalOwnerId = riderProfileId || storeId!;
    const { promoted, createdKeys } = await this.promoteDocuments(application, documents, finalOwnerId);
    const payload = application.applicantPayload || {};
    const operationalCode =
      application.type === PartnerApplicationType.RIDER
        ? application.applicationNumber.replace('AAG-', '')
        : `OWN-${application.applicationNumber.replace('AAG-STR-', '')}`;

    try {
      await prisma.$transaction(async (tx) => {
        if (!existingUser) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "User" (
              "id", "email", "phone", "name", "role", "emailVerified",
              "accountStatus", "mustChangePassword", "operationalCode",
              "createdAt", "updatedAt"
            ) VALUES ($1,$2,$3,$4,$5::"Role",$6,'PENDING_ACTIVATION',true,$7,
                      CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
            userId,
            email,
            application.phoneE164,
            dto.operationalName?.trim() || application.applicantName,
            targetRole,
            Boolean(application.emailVerifiedAt),
            operationalCode,
          );
        } else {
          await tx.user.update({
            where: { id: userId },
            data: {
              name: existingUser.name || dto.operationalName?.trim() || application.applicantName,
              emailVerified: existingUser.emailVerified || Boolean(application.emailVerifiedAt),
              phone: existingUser.phone || application.phoneE164 || undefined,
            },
          });
        }
        await grantUserRole(tx as any, userId, Role.CUSTOMER, 'PARTNER_APPROVAL', adminUserId);
        await grantUserRole(tx as any, userId, targetRole, 'PARTNER_APPROVAL', adminUserId);

        if (application.type === PartnerApplicationType.RIDER) {
          const rider = await tx.riderProfile.create({
            data: {
              id: riderProfileId!,
              userId,
              status: 'OFFLINE',
              vehicleType: String(payload.vehicleType || ''),
              vehicleNumber: payload.vehicleNumber ? String(payload.vehicleNumber) : null,
              emergencyContactName: String(payload.emergencyContactName || ''),
              emergencyContactPhone: String(payload.emergencyContactPhone || ''),
              bankAccountCiphertext: String(payload.bankAccountCiphertext || ''),
              bankIfscCiphertext: String(payload.bankIfscCiphertext || ''),
              bankAccountLast4: String(payload.bankAccountLast4 || ''),
              bankStatus: 'APPROVED',
              approvalStatus: 'APPROVED',
              bankReviewedByUserId: adminUserId,
              bankReviewedAt: new Date(),
              approvalReviewedByUserId: adminUserId,
              approvalReviewedAt: new Date(),
            },
          });
          const typeMap: Record<string, string> = {
            IDENTITY: 'IDENTITY',
            DRIVING_LICENSE: 'DRIVING_LICENSE',
            VEHICLE_REGISTRATION: 'VEHICLE_REGISTRATION',
            VEHICLE_INSURANCE: 'VEHICLE_INSURANCE',
            PROFILE_PHOTO: 'OTHER',
            BANK_PROOF: 'OTHER',
          };
          for (const document of documents) {
            const mappedType = typeMap[document.type];
            const storageKey = promoted.get(document.id) || document.storageKey;
            if (!mappedType || !storageKey) continue;
            await tx.riderDocument.create({
              data: {
                riderProfileId: rider.id,
                type: mappedType as any,
                documentNumberLast4: document.documentNumberLast4,
                storageKey,
                expiresAt: document.expiresAt,
                status: 'APPROVED',
                reviewNote: document.reviewNote,
                reviewedByUserId: adminUserId,
                reviewedAt: new Date(),
              },
            });
            await tx.$executeRawUnsafe(
              `UPDATE "PartnerApplicationDocument" SET "storageKey" = $2,
               "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
              document.id,
              storageKey,
            );
          }
        } else {
          const latitude = Number(dto.latitude ?? payload.latitude);
          const longitude = Number(dto.longitude ?? payload.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new BadRequestException('Approved store coordinates are required');
          }
          await tx.$executeRawUnsafe(
            `INSERT INTO "Store" (
              "id", "name", "address", "latitude", "longitude", "isActive",
              "ownerId", "storeCode", "partnerStatus", "createdAt", "updatedAt"
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
            storeId,
            dto.operationalName?.trim() || String(payload.displayName || application.applicantName),
            String(payload.storeAddress || ''),
            latitude,
            longitude,
            existingUser ? true : false,
            userId,
            application.applicationNumber.replace('AAG-', ''),
            existingUser ? 'ACTIVE' : 'PENDING_ACTIVATION',
          );
          for (const document of documents) {
            const storageKey = promoted.get(document.id) || document.storageKey;
            if (!storageKey) continue;
            await tx.$executeRawUnsafe(
              `UPDATE "PartnerApplicationDocument" SET "storageKey" = $2,
               "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
              document.id,
              storageKey,
            );
          }
        }

        await tx.$executeRawUnsafe(
          `UPDATE "PartnerApplication" SET "status" = 'APPROVED',
           "approvedAt" = CURRENT_TIMESTAMP, "provisionedUserId" = $2,
           "provisionedStoreId" = $3, "linkedExistingUser" = $4,
           "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
          id,
          userId,
          storeId,
          Boolean(existingUser),
        );
        await this.repository.writeEvent(tx, id, 'APPLICATION_APPROVED', 'ADMIN', {
          actorUserId: adminUserId,
          fromStatus: application.status,
          toStatus: PartnerApplicationStatus.APPROVED,
          message: existingUser
            ? 'Application approved. Rider/Store access was added to your existing AAGAM account.'
            : 'Application approved. Account activation is available.',
        });
        await this.repository.writeEvent(
          tx,
          id,
          existingUser ? 'ACCOUNT_LINKED' : 'ACCOUNT_PROVISIONED',
          'SYSTEM',
          {
            message: existingUser
              ? 'Existing Customer account linked to approved Partner access.'
              : 'Operational account provisioned securely.',
            metadata: { userId, storeId, role: targetRole, operationalCode },
          },
        );
        await this.repository.writeEvent(tx, id, 'DOCUMENT_PROMOTED', 'SYSTEM', {
          applicantVisible: false,
          message: 'Approved private documents promoted to the final operational folder.',
          metadata: { ownerId: finalOwnerId, documentCount: documents.length },
        });
      });
    } catch (error) {
      await this.uploads.deleteEvidenceMany(createdKeys);
      throw error;
    }

    const originalKeys = documents
      .map((document) => document.storageKey)
      .filter((key) => key && ![...promoted.values()].includes(key));
    await this.uploads.deleteEvidenceMany(originalKeys);
    return this.detail(id);
  }
}
