CREATE TYPE "VerificationMethod" AS ENUM (
  'EMAIL_CODE',
  'EMAIL_LINK',
  'FIREBASE_PNV',
  'SMS_OTP'
);

CREATE TYPE "VerificationProvider" AS ENUM (
  'QA',
  'RESEND',
  'MAILJET',
  'TWILIO',
  'FIREBASE_PNV'
);

CREATE TYPE "VerificationChallengeStatus" AS ENUM (
  'CREATED',
  'DISPATCHING',
  'SENT',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
  'SUPERSEDED'
);

ALTER TYPE "PartnerApplicationEventType" ADD VALUE IF NOT EXISTS 'CONTACT_CODE_DELIVERY_REQUESTED';
ALTER TYPE "PartnerApplicationEventType" ADD VALUE IF NOT EXISTS 'CONTACT_CODE_DELIVERY_FAILED';
ALTER TYPE "PartnerApplicationEventType" ADD VALUE IF NOT EXISTS 'PNV_VERIFICATION_STARTED';
ALTER TYPE "PartnerApplicationEventType" ADD VALUE IF NOT EXISTS 'PNV_VERIFICATION_SUCCEEDED';
ALTER TYPE "PartnerApplicationEventType" ADD VALUE IF NOT EXISTS 'PNV_VERIFICATION_FAILED';
ALTER TYPE "PartnerApplicationEventType" ADD VALUE IF NOT EXISTS 'VERIFICATION_FALLBACK_SELECTED';

CREATE TABLE "VerificationChallenge" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "method" "VerificationMethod" NOT NULL,
  "provider" "VerificationProvider" NOT NULL,
  "destinationHash" TEXT NOT NULL,
  "nonceHash" TEXT,
  "tokenJti" TEXT,
  "providerDeliveryId" TEXT,
  "status" "VerificationChallengeStatus" NOT NULL DEFAULT 'CREATED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VerificationChallenge_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VerificationChallenge_tokenJti_key"
  ON "VerificationChallenge"("tokenJti")
  WHERE "tokenJti" IS NOT NULL;
CREATE UNIQUE INDEX "VerificationChallenge_nonceHash_key"
  ON "VerificationChallenge"("nonceHash")
  WHERE "nonceHash" IS NOT NULL;
CREATE INDEX "VerificationChallenge_applicationId_status_createdAt_idx"
  ON "VerificationChallenge"("applicationId", "status", "createdAt");
CREATE INDEX "VerificationChallenge_method_provider_status_idx"
  ON "VerificationChallenge"("method", "provider", "status");
CREATE INDEX "VerificationChallenge_status_expiresAt_idx"
  ON "VerificationChallenge"("status", "expiresAt");
