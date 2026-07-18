import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { randomUUID } from 'crypto';
import { UploadService } from '../upload/upload.service';
import {
  AdminPartnerListQueryDto,
  ApprovePartnerApplicationDto,
  RejectPartnerApplicationDto,
  RequestPartnerChangesDto,
  ReviewPartnerDocumentDto,
} from './dto/partner-onboarding.dto';
import {
  PartnerApplicationStatus,
  PartnerApplicationType,
} from './partner-onboarding.types';
import {
  PartnerApplicationRow,
  PartnerOnboardingRepository,
} from './partner-onboarding.repository';

const REVIEWABLE = [
  PartnerApplicationStatus.SUBMITTED,
  PartnerApplicationStatus.UNDER_REVIEW,
  PartnerApplicationStatus.ACTION_REQUIRED,
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
    if (!REVIEWABLE.includes(application.status)) {
      throw new ConflictException('Application is not in a reviewable state');
    }
  }

  async startReview(id: string, adminUserId: string, note?: string) {
    const application = await this.application(id);
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

  async documentUrl(applicationId: string, documentId: string) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "storageKey" FROM "PartnerApplicationDocument"
       WHERE "id" = $1 AND "applicationId" = $2 LIMIT 1`,
      documentId,
      applicationId,
    );
    if (!rows[0]) throw new NotFoundException('Document not found');
    if (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true') {
      return { url: `test://${rows[0].storageKey}`, expiresInSeconds: 300 };
    }
    return this.uploads.signedEvidenceUrl(rows[0].storageKey);
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

  async reject(
    id: string,
    adminUserId: string,
    dto: RejectPartnerApplicationDto,
  ) {
    const application = await this.application(id);
    this.assertReviewable(application);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "status" = 'REJECTED',
         "rejectedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        id,
      );
      await this.repository.writeEvent(
        tx,
        id,
        'APPLICATION_REJECTED',
        'ADMIN',
        {
          actorUserId: adminUserId,
          fromStatus: application.status,
          toStatus: PartnerApplicationStatus.REJECTED,
          message: dto.message.trim(),
          metadata: { reasonCode: dto.reasonCode.trim().toUpperCase() },
        },
      );
    });
    return this.detail(id);
  }

  private async assertUniqueOperationalIdentity(
    application: PartnerApplicationRow,
    email: string,
  ) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new ConflictException(
        'This operational email already belongs to an account. Use a different email or complete an explicit account-linking review.',
      );
    }
    if (application.phoneE164) {
      const existingPhone = await prisma.user.findUnique({
        where: { phone: application.phoneE164 },
      });
      if (existingPhone) {
        throw new ConflictException(
          'This phone number already belongs to an operational account.',
        );
      }
    }
    if (application.provisionedUserId || application.provisionedStoreId) {
      throw new ConflictException('Application has already been provisioned');
    }
  }

  async approveAndProvision(
    id: string,
    adminUserId: string,
    dto: ApprovePartnerApplicationDto,
  ) {
    const application = await this.application(id);
    if (application.status === PartnerApplicationStatus.APPROVED) {
      return this.detail(id);
    }
    this.assertReviewable(application);
    const documents = await this.repository.documents(id, true);
    this.repository.validateForSubmission(application, documents, true);
    const email = (dto.ownerEmail || application.email || '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('A verified operational email is required');
    }
    await this.assertUniqueOperationalIdentity(application, email);

    const payload = application.applicantPayload || {};
    const userId = randomUUID();
    const targetRole =
      application.type === PartnerApplicationType.RIDER
        ? Role.RIDER
        : Role.STORE_OWNER;
    const operationalCode =
      application.type === PartnerApplicationType.RIDER
        ? application.applicationNumber.replace('AAG-', '')
        : `OWN-${application.applicationNumber.replace('AAG-STR-', '')}`;
    let storeId: string | null = null;

    await prisma.$transaction(async (tx) => {
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

      if (application.type === PartnerApplicationType.RIDER) {
        const rider = await tx.riderProfile.create({
          data: {
            userId,
            status: 'OFFLINE',
            vehicleType: String(payload.vehicleType || ''),
            vehicleNumber: payload.vehicleNumber
              ? String(payload.vehicleNumber)
              : null,
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
          if (!mappedType || !document.storageKey) continue;
          await tx.riderDocument.create({
            data: {
              riderProfileId: rider.id,
              type: mappedType as any,
              documentNumberLast4: document.documentNumberLast4,
              storageKey: document.storageKey,
              expiresAt: document.expiresAt,
              status: 'APPROVED',
              reviewNote: document.reviewNote,
              reviewedByUserId: adminUserId,
              reviewedAt: new Date(),
            },
          });
        }
      } else {
        storeId = randomUUID();
        const latitude = Number(dto.latitude ?? payload.latitude);
        const longitude = Number(dto.longitude ?? payload.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new BadRequestException('Approved store coordinates are required');
        }
        await tx.$executeRawUnsafe(
          `INSERT INTO "Store" (
            "id", "name", "address", "latitude", "longitude", "isActive",
            "ownerId", "storeCode", "partnerStatus", "createdAt", "updatedAt"
          ) VALUES ($1,$2,$3,$4,$5,false,$6,$7,'PENDING_ACTIVATION',
                    CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
          storeId,
          dto.operationalName?.trim() ||
            String(payload.displayName || application.applicantName),
          String(payload.storeAddress || ''),
          latitude,
          longitude,
          userId,
          application.applicationNumber.replace('AAG-', ''),
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "status" = 'APPROVED',
         "approvedAt" = CURRENT_TIMESTAMP, "provisionedUserId" = $2,
         "provisionedStoreId" = $3, "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = $1`,
        id,
        userId,
        storeId,
      );
      await this.repository.writeEvent(
        tx,
        id,
        'APPLICATION_APPROVED',
        'ADMIN',
        {
          actorUserId: adminUserId,
          fromStatus: application.status,
          toStatus: PartnerApplicationStatus.APPROVED,
          message: 'Application approved. Account activation is available.',
        },
      );
      await this.repository.writeEvent(tx, id, 'ACCOUNT_PROVISIONED', 'SYSTEM', {
        message: 'Operational account provisioned securely.',
        metadata: { userId, storeId, role: targetRole, operationalCode },
      });
    });
    return this.detail(id);
  }
}
