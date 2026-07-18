CREATE TYPE "PartnerApplicationType" AS ENUM ('RIDER', 'STORE');
CREATE TYPE "PartnerApplicationStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACTION_REQUIRED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED'
);
CREATE TYPE "PartnerApplicationDocumentStatus" AS ENUM (
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'REPLACEMENT_REQUIRED'
);
CREATE TYPE "PartnerApplicationEventType" AS ENUM (
  'APPLICATION_CREATED',
  'CONTACT_CODE_SENT',
  'CONTACT_VERIFIED',
  'DRAFT_UPDATED',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_REMOVED',
  'APPLICATION_SUBMITTED',
  'REVIEW_STARTED',
  'DOCUMENT_VERIFIED',
  'DOCUMENT_REJECTED',
  'CHANGES_REQUESTED',
  'APPLICATION_RESUBMITTED',
  'APPLICATION_APPROVED',
  'APPLICATION_REJECTED',
  'APPLICATION_WITHDRAWN',
  'ACCOUNT_PROVISIONED',
  'ACTIVATION_SENT',
  'ACCOUNT_ACTIVATED'
);
CREATE TYPE "PartnerAccountStatus" AS ENUM (
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED'
);
CREATE TYPE "StorePartnerStatus" AS ENUM (
  'PENDING_ACTIVATION',
  'SETUP_IN_PROGRESS',
  'READY_FOR_REVIEW',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED'
);

ALTER TABLE "User"
  ADD COLUMN "accountStatus" "PartnerAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "activationExpiresAt" TIMESTAMP(3);

ALTER TABLE "Store"
  ADD COLUMN "storeCode" TEXT,
  ADD COLUMN "partnerStatus" "StorePartnerStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX "Store_storeCode_key" ON "Store"("storeCode");
CREATE INDEX "User_accountStatus_role_idx" ON "User"("accountStatus", "role");
CREATE INDEX "Store_partnerStatus_idx" ON "Store"("partnerStatus");

CREATE TABLE "PartnerApplication" (
  "id" TEXT NOT NULL,
  "applicationNumber" TEXT NOT NULL,
  "type" "PartnerApplicationType" NOT NULL,
  "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "submissionVersion" INTEGER NOT NULL DEFAULT 0,
  "applicantName" TEXT NOT NULL,
  "email" TEXT,
  "phoneE164" TEXT,
  "emailVerifiedAt" TIMESTAMP(3),
  "phoneVerifiedAt" TIMESTAMP(3),
  "accessSecretHash" TEXT NOT NULL,
  "verificationChannel" TEXT,
  "verificationCodeHash" TEXT,
  "verificationExpiresAt" TIMESTAMP(3),
  "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
  "assignedReviewerUserId" TEXT,
  "applicantPayload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "submittedSnapshot" JSONB,
  "actionRequests" JSONB,
  "submissionIdempotencyKey" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewStartedAt" TIMESTAMP(3),
  "actionRequiredAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "provisionedUserId" TEXT,
  "provisionedStoreId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerApplicationDocument" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "documentNumberLast4" TEXT,
  "expiresAt" TIMESTAMP(3),
  "status" "PartnerApplicationDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerApplicationDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerApplicationDocument_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PartnerApplicationEvent" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "eventType" "PartnerApplicationEventType" NOT NULL,
  "actorUserId" TEXT,
  "actorKind" TEXT NOT NULL,
  "fromStatus" "PartnerApplicationStatus",
  "toStatus" "PartnerApplicationStatus",
  "applicantVisible" BOOLEAN NOT NULL DEFAULT true,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerApplicationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerApplicationEvent_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PartnerActivationToken" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerActivationToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerActivationToken_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "PartnerApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartnerActivationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PartnerApplication_applicationNumber_key"
  ON "PartnerApplication"("applicationNumber");
CREATE UNIQUE INDEX "PartnerApplication_submissionIdempotencyKey_key"
  ON "PartnerApplication"("submissionIdempotencyKey")
  WHERE "submissionIdempotencyKey" IS NOT NULL;
CREATE INDEX "PartnerApplication_type_status_createdAt_idx"
  ON "PartnerApplication"("type", "status", "createdAt");
CREATE INDEX "PartnerApplication_email_idx"
  ON "PartnerApplication"(LOWER("email"));
CREATE INDEX "PartnerApplication_phoneE164_idx"
  ON "PartnerApplication"("phoneE164");
CREATE INDEX "PartnerApplication_assignedReviewerUserId_status_idx"
  ON "PartnerApplication"("assignedReviewerUserId", "status");

CREATE UNIQUE INDEX "PartnerApplicationDocument_applicationId_type_key"
  ON "PartnerApplicationDocument"("applicationId", "type");
CREATE INDEX "PartnerApplicationDocument_status_expiresAt_idx"
  ON "PartnerApplicationDocument"("status", "expiresAt");
CREATE INDEX "PartnerApplicationDocument_applicationId_status_idx"
  ON "PartnerApplicationDocument"("applicationId", "status");

CREATE INDEX "PartnerApplicationEvent_applicationId_createdAt_idx"
  ON "PartnerApplicationEvent"("applicationId", "createdAt");
CREATE INDEX "PartnerApplicationEvent_eventType_createdAt_idx"
  ON "PartnerApplicationEvent"("eventType", "createdAt");

CREATE UNIQUE INDEX "PartnerActivationToken_tokenHash_key"
  ON "PartnerActivationToken"("tokenHash");
CREATE INDEX "PartnerActivationToken_applicationId_createdAt_idx"
  ON "PartnerActivationToken"("applicationId", "createdAt");
CREATE INDEX "PartnerActivationToken_userId_expiresAt_idx"
  ON "PartnerActivationToken"("userId", "expiresAt");
