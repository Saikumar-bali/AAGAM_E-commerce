import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { UploadService } from '../upload/upload.service';
import { PartnerApplicationStatus } from './partner-onboarding.types';

const PERMANENTLY_DELETABLE = [
  PartnerApplicationStatus.DRAFT,
  PartnerApplicationStatus.WITHDRAWN,
  PartnerApplicationStatus.EXPIRED,
];

type PurgeApplicationRow = {
  id: string;
  status: PartnerApplicationStatus;
  deletedAt: Date | null;
  provisionedUserId: string | null;
  provisionedStoreId: string | null;
};

type PurgeDocumentRow = { storageKey: string };

@Injectable()
export class PartnerApplicationPurgeService {
  constructor(private readonly uploads: UploadService) {}

  async permanentlyDelete(id: string, adminUserId: string) {
    const applications = await prisma.$queryRawUnsafe<PurgeApplicationRow[]>(
      `SELECT "id", "status", "deletedAt", "provisionedUserId", "provisionedStoreId"
       FROM "PartnerApplication" WHERE "id" = $1 LIMIT 1`,
      id,
    );
    const application = applications[0];
    if (!application) throw new NotFoundException('Application not found');
    if (!application.deletedAt) {
      throw new ConflictException('Move the application to deleted items before permanently deleting it');
    }
    if (!PERMANENTLY_DELETABLE.includes(application.status)) {
      throw new ConflictException('Only deleted Draft, Withdrawn or Expired applications can be permanently deleted');
    }
    if (application.provisionedUserId || application.provisionedStoreId) {
      throw new ConflictException('Provisioned partner applications cannot be permanently deleted');
    }

    const documents = await prisma.$queryRawUnsafe<PurgeDocumentRow[]>(
      `SELECT "storageKey" FROM "PartnerApplicationDocument" WHERE "applicationId" = $1`,
      id,
    );
    const storageKeys = [...new Set(documents.map((document) => document.storageKey).filter(Boolean))];

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.$executeRawUnsafe(
        `DELETE FROM "PartnerApplication"
         WHERE "id" = $1
           AND "deletedAt" IS NOT NULL
           AND "provisionedUserId" IS NULL
           AND "provisionedStoreId" IS NULL`,
        id,
      );
      if (deleted !== 1) {
        throw new ConflictException('Application changed while it was being permanently deleted');
      }
    });

    let storageCleanupComplete = true;
    if (storageKeys.length && process.env.NODE_ENV !== 'test' && process.env.PLAYWRIGHT_QA !== 'true') {
      try {
        await this.uploads.deleteEvidenceMany(storageKeys);
      } catch {
        // The database record is already permanently removed. Do not report the
        // destructive action as failed only because orphaned object cleanup must
        // be retried by operations/storage lifecycle tooling.
        storageCleanupComplete = false;
      }
    }

    return {
      id,
      permanentlyDeleted: true,
      deletedByUserId: adminUserId,
      removedDocumentCount: documents.length,
      storageCleanupComplete,
    };
  }
}
