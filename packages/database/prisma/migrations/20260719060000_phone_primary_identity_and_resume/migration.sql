-- Phone-primary identity and recoverable Partner application access.

ALTER TYPE "PartnerApplicationEventType" ADD VALUE IF NOT EXISTS 'APPLICATION_ACCESS_RECOVERED';
ALTER TYPE "PartnerApplicationEventType" ADD VALUE IF NOT EXISTS 'APPLICATION_REOPENED_FOR_EDIT';

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ContactOtpChallenge" (
  "id" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "destinationHash" TEXT NOT NULL,
  "targetId" TEXT,
  "codeHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "provider" TEXT,
  "providerDeliveryId" TEXT,
  "failureCode" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactOtpChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContactOtpChallenge_purpose_check" CHECK (
    "purpose" IN ('CUSTOMER_LOGIN', 'CUSTOMER_SIGNUP', 'PARTNER_RESUME')
  ),
  CONSTRAINT "ContactOtpChallenge_channel_check" CHECK (
    "channel" IN ('PHONE', 'EMAIL')
  ),
  CONSTRAINT "ContactOtpChallenge_status_check" CHECK (
    "status" IN ('PENDING', 'SENT', 'VERIFIED', 'FAILED', 'EXPIRED', 'SUPERSEDED')
  ),
  CONSTRAINT "ContactOtpChallenge_attempt_check" CHECK (
    "attemptCount" >= 0 AND "attemptCount" <= 20
  )
);

CREATE INDEX IF NOT EXISTS "ContactOtpChallenge_lookup_idx"
  ON "ContactOtpChallenge"("purpose", "channel", "destinationHash", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ContactOtpChallenge_target_idx"
  ON "ContactOtpChallenge"("targetId", "purpose", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ContactOtpChallenge_expiry_idx"
  ON "ContactOtpChallenge"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "User_phoneVerifiedAt_idx"
  ON "User"("phoneVerifiedAt");
