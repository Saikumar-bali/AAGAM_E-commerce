import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { createHash, randomUUID } from 'crypto';
import { grantUserRole } from '../auth/user-roles';
import { UploadService } from '../upload/upload.service';
import { ApprovePartnerApplicationDto } from './dto/partner-onboarding.dto';
import { PartnerOnboardingAdminService } from './partner-onboarding-admin.service';
import {
  PartnerApplicationRow,
  PartnerDocumentRow,
  PartnerOnboardingRepository,
} from './partner-onboarding.repository';
import {
  PartnerApplicationStatus,
  PartnerApplicationType,
} from './partner-onboarding.types';

@Injectable()
export class PhonePrimaryPartnerOnboardingAdminService extends PartnerOnboardingAdminService {
  constructor(
    private readonly phoneRepository: PartnerOnboardingRepository,
    private readonly phoneUploads: UploadService,
  ) {
    super(phoneRepository, phoneUploads);
  }

  private syntheticEmail(phone: string) {
    const digest = createHash('sha256').update(phone).digest('hex').slice(0, 28);
    return `phone-${digest}@phone.aagam.local`;
  }

  private async findExistingOperationalUser(
    application: PartnerApplicationRow,
    email?: string | null,
  ) {
    const byPhone = application.phoneE164
      ? await prisma.user.findUnique({ where: { phone: application.phoneE164 } })
      : null;
    const byEmail = email
      ? await prisma.user.findUnique({ where: { email } })
      : null;
    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      throw new ConflictException(
        'Verified phone and email belong to different AAGAM accounts',
      );
    }
    return byPhone || byEmail || null;
  }

  private async promotePhoneDocuments(
    application: PartnerApplicationRow,
    documents: PartnerDocumentRow[],
    ownerId: string,
  ) {
    const promoted = new Map<string, string>();
    const createdKeys: string[] = [];
    if (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_QA === 'true') {
      documents.forEach((document) =>
        promoted.set(document.id, document.storageKey || ''),
      );
      return { promoted, createdKeys };
    }
    try {
      for (const document of documents) {
        if (!document.storageKey) continue;
        const key = await this.phoneUploads.promoteEvidence(document.storageKey, {
          scope:
            application.type === PartnerApplicationType.RIDER ? 'riders' : 'stores',
          ownerId,
          documentType: document.type,
        });
        promoted.set(document.id, key);
        createdKeys.push(key);
      }
      return { promoted, createdKeys };
    } catch (error) {
      await this.phoneUploads.deleteEvidenceMany(createdKeys);
      throw error;
    }
  }

  override async approveAndProvision(
    id: string,
    adminUserId: string,
    dto: ApprovePartnerApplicationDto,
  ) {
    const application = await this.phoneRepository.findApplication(id);
    if (!application) throw new BadRequestException('Application not found');
    if (application.status === PartnerApplicationStatus.APPROVED) {
      return this.detail(id);
    }
    if (
      ![
        PartnerApplicationStatus.SUBMITTED,
        PartnerApplicationStatus.UNDER_REVIEW,
        PartnerApplicationStatus.ACTION_REQUIRED,
      ].includes(application.status)
    ) {
      throw new ConflictException('Application is not in a reviewable state');
    }
    const documents = await this.phoneRepository.documents(id, true);
    this.phoneRepository.validateForSubmission(application, documents, true);

    const emailOnly =
      (process.env.PARTNER_PHONE_VERIFICATION_MODE || 'SMS_ONLY')
        .trim()
        .toUpperCase() === 'EMAIL_ONLY';
    if (!emailOnly && (!application.phoneE164 || !application.phoneVerifiedAt)) {
      throw new BadRequestException(
        'Verified primary phone is required before approval',
      );
    }
    const requestedEmail =
      (dto.ownerEmail || application.email || '').trim().toLowerCase() || null;
    if (emailOnly && (!requestedEmail || !application.emailVerifiedAt)) {
      throw new BadRequestException(
        'Verified email is required while phone verification is disabled',
      );
    }
    const accountEmail =
      requestedEmail || this.syntheticEmail(application.phoneE164!);
    const existingUser = await this.findExistingOperationalUser(
      application,
      requestedEmail,
    );
    const targetRole =
      application.type === PartnerApplicationType.RIDER
        ? Role.RIDER
        : Role.STORE_OWNER;
    if (existingUser && application.type === PartnerApplicationType.RIDER) {
      const existingRider = await prisma.riderProfile.findUnique({
        where: { userId: existingUser.id },
      });
      if (existingRider) {
        throw new ConflictException('This account already has a Rider profile');
      }
    }
    if (application.provisionedUserId || application.provisionedStoreId) {
      throw new ConflictException('Application has already been provisioned');
    }

    const userId = existingUser?.id || randomUUID();
    const riderProfileId =
      application.type === PartnerApplicationType.RIDER ? randomUUID() : null;
    const storeId =
      application.type === PartnerApplicationType.STORE ? randomUUID() : null;
    const finalOwnerId = riderProfileId || storeId!;
    const { promoted, createdKeys } = await this.promotePhoneDocuments(
      application,
      documents,
      finalOwnerId,
    );
    const payload = application.applicantPayload || {};
    const operationalCode =
      application.type === PartnerApplicationType.RIDER
        ? application.applicationNumber.replace('AAG-', '')
        : `OWN-${application.applicationNumber.replace('AAG-STR-', '')}`;
    const directPhoneLogin = Boolean(
      application.phoneE164 && application.phoneVerifiedAt,
    );

    try {
      await prisma.$transaction(async (tx) => {
        if (!existingUser) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "User" (
              "id", "email", "phone", "name", "role", "emailVerified",
              "phoneVerifiedAt", "accountStatus", "mustChangePassword", "operationalCode",
              "createdAt", "updatedAt"
            ) VALUES ($1,$2,$3,$4,$5::"Role",$6,$7,$8::"PartnerAccountStatus",false,$9,
                      CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
            userId,
            accountEmail,
            application.phoneE164,
            dto.operationalName?.trim() || application.applicantName,
            targetRole,
            Boolean(requestedEmail && application.emailVerifiedAt),
            application.phoneVerifiedAt,
            directPhoneLogin ? 'ACTIVE' : 'PENDING_ACTIVATION',
            operationalCode,
          );
        } else {
          await tx.$executeRawUnsafe(
            `UPDATE "User" SET
              "name" = COALESCE("name", $2),
              "phone" = COALESCE("phone", $3),
              "phoneVerifiedAt" = COALESCE("phoneVerifiedAt", $4),
              "emailVerified" = "emailVerified" OR $5,
              "accountStatus" = CASE WHEN $6 THEN 'ACTIVE'::"PartnerAccountStatus" ELSE "accountStatus" END,
              "mustChangePassword" = CASE WHEN $6 THEN false ELSE "mustChangePassword" END,
              "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
            userId,
            dto.operationalName?.trim() || application.applicantName,
            application.phoneE164,
            application.phoneVerifiedAt,
            Boolean(requestedEmail && application.emailVerifiedAt),
            directPhoneLogin,
          );
        }
        await grantUserRole(
          tx as any,
          userId,
          Role.CUSTOMER,
          'PARTNER_APPROVAL',
          adminUserId,
        );
        await grantUserRole(
          tx as any,
          userId,
          targetRole,
          'PARTNER_APPROVAL',
          adminUserId,
        );

        if (application.type === PartnerApplicationType.RIDER) {
          const rider = await tx.riderProfile.create({
            data: {
              id: riderProfileId!,
              userId,
              status: 'OFFLINE',
              vehicleType: String(payload.vehicleType || ''),
              vehicleNumber: payload.vehicleNumber
                ? String(payload.vehicleNumber)
                : null,
              emergencyContactName: String(
                payload.emergencyContactName || '',
              ),
              emergencyContactPhone: String(
                payload.emergencyContactPhone || '',
              ),
              bankAccountCiphertext: String(
                payload.bankAccountCiphertext || '',
              ),
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
            throw new BadRequestException(
              'Approved store coordinates are required',
            );
          }
          await tx.$executeRawUnsafe(
            `INSERT INTO "Store" (
              "id", "name", "address", "latitude", "longitude", "isActive",
              "ownerId", "storeCode", "partnerStatus", "createdAt", "updatedAt"
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::"StorePartnerStatus",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
            storeId,
            dto.operationalName?.trim() ||
              String(payload.displayName || application.applicantName),
            String(payload.storeAddress || ''),
            latitude,
            longitude,
            directPhoneLogin || Boolean(existingUser),
            userId,
            application.applicationNumber.replace('AAG-', ''),
            directPhoneLogin || Boolean(existingUser)
              ? 'ACTIVE'
              : 'PENDING_ACTIVATION',
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
        await this.phoneRepository.writeEvent(
          tx,
          id,
          'APPLICATION_APPROVED',
          'ADMIN',
          {
            actorUserId: adminUserId,
            fromStatus: application.status,
            toStatus: PartnerApplicationStatus.APPROVED,
            message: directPhoneLogin
              ? 'Application approved. Sign in directly with your verified phone number.'
              : 'Application approved. Account activation is available.',
          },
        );
        await this.phoneRepository.writeEvent(
          tx,
          id,
          existingUser ? 'ACCOUNT_LINKED' : 'ACCOUNT_PROVISIONED',
          'SYSTEM',
          {
            message: directPhoneLogin
              ? 'Operational access is active for phone OTP login.'
              : 'Operational account provisioned securely.',
            metadata: {
              userId,
              storeId,
              role: targetRole,
              operationalCode,
              directPhoneLogin,
            },
          },
        );
        await this.phoneRepository.writeEvent(
          tx,
          id,
          'DOCUMENT_PROMOTED',
          'SYSTEM',
          {
            applicantVisible: false,
            message:
              'Approved private documents promoted to the final operational folder.',
            metadata: { ownerId: finalOwnerId, documentCount: documents.length },
          },
        );
      });
    } catch (error) {
      await this.phoneUploads.deleteEvidenceMany(createdKeys);
      throw error;
    }

    const originalKeys = documents
      .map((document) => document.storageKey)
      .filter((key) => key && ![...promoted.values()].includes(key));
    await this.phoneUploads.deleteEvidenceMany(originalKeys);
    return this.detail(id);
  }
}
