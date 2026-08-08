import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { randomUUID } from 'crypto';
import {
  VerificationChallengeRow,
  VerificationChallengeStatus,
  VerificationMethod,
  VerificationProvider,
} from './verification.types';

@Injectable()
export class VerificationChallengeRepository {
  async create(input: {
    applicationId: string;
    method: VerificationMethod;
    provider: VerificationProvider;
    destinationHash: string;
    nonceHash?: string | null;
    expiresAt: Date;
    status?: VerificationChallengeStatus;
  }, db: any = prisma): Promise<VerificationChallengeRow> {
    const id = randomUUID();
    const rows = await db.$queryRawUnsafe(
      `INSERT INTO "VerificationChallenge" (
        "id", "applicationId", "method", "provider", "destinationHash",
        "nonceHash", "status", "expiresAt"
      ) VALUES ($1,$2,$3::"VerificationMethod",$4::"VerificationProvider",$5,$6,
        $7::"VerificationChallengeStatus",$8)
      RETURNING *`,
      id,
      input.applicationId,
      input.method,
      input.provider,
      input.destinationHash,
      input.nonceHash || null,
      input.status || VerificationChallengeStatus.CREATED,
      input.expiresAt,
    );
    return rows[0];
  }

  async setStatus(
    id: string,
    status: VerificationChallengeStatus,
    options: {
      providerDeliveryId?: string | null;
      failureCode?: string | null;
      tokenJti?: string | null;
      verifiedAt?: Date | null;
      incrementAttempt?: boolean;
      provider?: VerificationProvider | null;
    } = {},
    db: any = prisma,
  ) {
    await db.$executeRawUnsafe(
      `UPDATE "VerificationChallenge"
       SET "status" = $2::"VerificationChallengeStatus",
           "providerDeliveryId" = COALESCE($3, "providerDeliveryId"),
           "failureCode" = $4,
           "tokenJti" = COALESCE($5, "tokenJti"),
           "verifiedAt" = COALESCE($6, "verifiedAt"),
           "attemptCount" = "attemptCount" + CASE WHEN $7 THEN 1 ELSE 0 END,
           "provider" = COALESCE($8::"VerificationProvider", "provider"),
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1`,
      id,
      status,
      options.providerDeliveryId ?? null,
      options.failureCode ?? null,
      options.tokenJti ?? null,
      options.verifiedAt ?? null,
      options.incrementAttempt === true,
      options.provider ?? null,
    );
  }

  async supersedeActive(
    applicationId: string,
    method: VerificationMethod,
    exceptId: string,
    db: any = prisma,
  ) {
    await db.$executeRawUnsafe(
      `UPDATE "VerificationChallenge"
       SET "status" = 'SUPERSEDED', "updatedAt" = CURRENT_TIMESTAMP
       WHERE "applicationId" = $1 AND "method" = $2::"VerificationMethod"
         AND "id" <> $3 AND "status" IN ('CREATED','DISPATCHING','SENT')`,
      applicationId,
      method,
      exceptId,
    );
  }

  async latestSentCode(applicationId: string): Promise<VerificationChallengeRow | null> {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "VerificationChallenge"
       WHERE "applicationId" = $1
         AND "method" IN ('EMAIL_CODE','SMS_OTP')
         AND "status" = 'SENT'
       ORDER BY "createdAt" DESC LIMIT 1`,
      applicationId,
    );
    return rows[0] || null;
  }

  async activePnvByNonce(
    applicationId: string,
    nonceHash: string,
  ): Promise<VerificationChallengeRow | null> {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM "VerificationChallenge"
       WHERE "applicationId" = $1 AND "nonceHash" = $2
         AND "method" = 'FIREBASE_PNV' AND "status" = 'SENT'
       LIMIT 1`,
      applicationId,
      nonceHash,
    );
    return rows[0] || null;
  }

  async hasTokenJti(tokenJti: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT 1 FROM "VerificationChallenge" WHERE "tokenJti" = $1 LIMIT 1`,
      tokenJti,
    );
    return Boolean(rows[0]);
  }

  async lastSuccessfulProviderCheck(provider: VerificationProvider): Promise<Date | null> {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COALESCE("verifiedAt", "updatedAt") AS "timestamp"
       FROM "VerificationChallenge"
       WHERE "provider" = $1::"VerificationProvider"
         AND "status" IN ('SENT','VERIFIED')
       ORDER BY COALESCE("verifiedAt", "updatedAt") DESC LIMIT 1`,
      provider,
    );
    return rows[0]?.timestamp || null;
  }
}
