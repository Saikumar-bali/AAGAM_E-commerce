-- Backward-compatible production hardening for scheduled subscriptions and regional routing.
ALTER TABLE "DeliveryZone" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weightGrams" INTEGER;
ALTER TABLE "SubscriptionDelivery"
  ADD COLUMN IF NOT EXISTS "deferredReason" TEXT,
  ADD COLUMN IF NOT EXISTS "generationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastGenerationAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAttemptCorrelationId" TEXT;
ALTER TABLE "DeliveryRun" ADD COLUMN IF NOT EXISTS "expectedWeightGrams" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryRunStop" ADD COLUMN IF NOT EXISTS "expectedWeightGrams" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SubscriptionPlan" DROP CONSTRAINT IF EXISTS "SubscriptionPlan_window_check";
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_window_check" CHECK ("defaultWindowStartMinute" BETWEEN 0 AND 1439 AND "defaultWindowEndMinute" BETWEEN 1 AND 1440 AND "defaultWindowEndMinute" <> "defaultWindowStartMinute");
ALTER TABLE "CustomerSubscription" DROP CONSTRAINT IF EXISTS "CustomerSubscription_window_check";
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_window_check" CHECK ("deliveryWindowStartMinute" BETWEEN 0 AND 1439 AND "deliveryWindowEndMinute" BETWEEN 1 AND 1440 AND "deliveryWindowEndMinute" <> "deliveryWindowStartMinute");

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_weightGrams_nonnegative" CHECK ("weightGrams" IS NULL OR "weightGrams" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_expectedWeightGrams_nonnegative" CHECK ("expectedWeightGrams" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRunStop" ADD CONSTRAINT "DeliveryRunStop_expectedWeightGrams_nonnegative" CHECK ("expectedWeightGrams" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'ROUTE_ASSIGNED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'ROUTE_REMOVED';
ALTER TYPE "NotificationEventType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_WORKER_FAILED';

DO $$ BEGIN CREATE TYPE "TrustedDropCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "GeofencePhase" AS ENUM ('ARRIVAL', 'COMPLETION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "GeofenceDecision" AS ENUM ('PASS', 'FAIL_DISTANCE', 'FAIL_ACCURACY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SubscriptionGenerationAttemptStatus" AS ENUM ('STARTED', 'GENERATED', 'DEFERRED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TrustedDropCredential" (
  "id" TEXT NOT NULL, "subscriptionId" TEXT NOT NULL, "customerId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, "status" "TrustedDropCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "rotatedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
  CONSTRAINT "TrustedDropCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDropCredential_subscriptionId_key" ON "TrustedDropCredential"("subscriptionId");
CREATE INDEX IF NOT EXISTS "TrustedDropCredential_customer_status_idx" ON "TrustedDropCredential"("customerId", "status");

CREATE TABLE IF NOT EXISTS "TrustedDropChallenge" (
  "id" TEXT NOT NULL, "credentialId" TEXT NOT NULL, "subscriptionId" TEXT NOT NULL, "subscriptionDeliveryId" TEXT, "customerId" TEXT NOT NULL,
  "version" INTEGER NOT NULL, "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrustedDropChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDropChallenge_tokenHash_key" ON "TrustedDropChallenge"("tokenHash");
CREATE INDEX IF NOT EXISTS "TrustedDropChallenge_subscription_version_expiry_idx" ON "TrustedDropChallenge"("subscriptionId", "version", "expiresAt");
CREATE INDEX IF NOT EXISTS "TrustedDropChallenge_subscriptionDeliveryId_idx" ON "TrustedDropChallenge"("subscriptionDeliveryId");
CREATE INDEX IF NOT EXISTS "TrustedDropChallenge_customer_created_idx" ON "TrustedDropChallenge"("customerId", "createdAt");

CREATE TABLE IF NOT EXISTS "TrustedDropEvidence" (
  "id" TEXT NOT NULL, "deliveryRunStopId" TEXT NOT NULL, "deliveryJobId" TEXT NOT NULL,
  "subscriptionDeliveryId" TEXT NOT NULL, "riderId" TEXT NOT NULL, "challengeId" TEXT NOT NULL,
  "credentialVersion" INTEGER NOT NULL, "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL, "sha256" TEXT NOT NULL, "capturedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrustedDropEvidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDropEvidence_deliveryRunStopId_key" ON "TrustedDropEvidence"("deliveryRunStopId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDropEvidence_deliveryJobId_key" ON "TrustedDropEvidence"("deliveryJobId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDropEvidence_subscriptionDeliveryId_key" ON "TrustedDropEvidence"("subscriptionDeliveryId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDropEvidence_challengeId_key" ON "TrustedDropEvidence"("challengeId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDropEvidence_storageKey_key" ON "TrustedDropEvidence"("storageKey");
CREATE INDEX IF NOT EXISTS "TrustedDropEvidence_rider_captured_idx" ON "TrustedDropEvidence"("riderId", "capturedAt");

CREATE TABLE IF NOT EXISTS "RunStopGeofenceProof" (
  "id" TEXT NOT NULL, "deliveryRunStopId" TEXT NOT NULL, "riderId" TEXT NOT NULL, "phase" "GeofencePhase" NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL, "longitude" DOUBLE PRECISION NOT NULL, "accuracyMetres" DOUBLE PRECISION NOT NULL,
  "distanceToStopMetres" DOUBLE PRECISION NOT NULL, "allowedRadiusMetres" DOUBLE PRECISION NOT NULL,
  "decision" "GeofenceDecision" NOT NULL, "measuredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RunStopGeofenceProof_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RunStopGeofenceProof_stop_phase_measured_idx" ON "RunStopGeofenceProof"("deliveryRunStopId", "phase", "measuredAt");
CREATE INDEX IF NOT EXISTS "RunStopGeofenceProof_rider_measured_idx" ON "RunStopGeofenceProof"("riderId", "measuredAt");

CREATE TABLE IF NOT EXISTS "SubscriptionGenerationAttempt" (
  "id" TEXT NOT NULL, "subscriptionDeliveryId" TEXT NOT NULL, "attemptNumber" INTEGER NOT NULL,
  "correlationId" TEXT NOT NULL, "status" "SubscriptionGenerationAttemptStatus" NOT NULL,
  "deferredReason" TEXT, "message" TEXT, "metadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
  CONSTRAINT "SubscriptionGenerationAttempt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionGenerationAttempt_delivery_attempt_key" ON "SubscriptionGenerationAttempt"("subscriptionDeliveryId", "attemptNumber");
CREATE INDEX IF NOT EXISTS "SubscriptionGenerationAttempt_status_started_idx" ON "SubscriptionGenerationAttempt"("status", "startedAt");
CREATE INDEX IF NOT EXISTS "SubscriptionGenerationAttempt_correlation_idx" ON "SubscriptionGenerationAttempt"("correlationId");

CREATE TABLE IF NOT EXISTS "SubscriptionWorkerFailure" (
  "id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "correlationId" TEXT NOT NULL, "attempts" INTEGER NOT NULL,
  "lastError" TEXT NOT NULL, "payload" JSONB, "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "SubscriptionWorkerFailure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionWorkerFailure_jobId_key" ON "SubscriptionWorkerFailure"("jobId");
CREATE INDEX IF NOT EXISTS "SubscriptionWorkerFailure_failedAt_idx" ON "SubscriptionWorkerFailure"("failedAt");

DO $$ BEGIN ALTER TABLE "TrustedDropCredential" ADD CONSTRAINT "TrustedDropCredential_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropCredential" ADD CONSTRAINT "TrustedDropCredential_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropChallenge" ADD CONSTRAINT "TrustedDropChallenge_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "TrustedDropCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropChallenge" ADD CONSTRAINT "TrustedDropChallenge_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropChallenge" ADD CONSTRAINT "TrustedDropChallenge_subscriptionDeliveryId_fkey" FOREIGN KEY ("subscriptionDeliveryId") REFERENCES "SubscriptionDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropChallenge" ADD CONSTRAINT "TrustedDropChallenge_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropEvidence" ADD CONSTRAINT "TrustedDropEvidence_deliveryRunStopId_fkey" FOREIGN KEY ("deliveryRunStopId") REFERENCES "DeliveryRunStop"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropEvidence" ADD CONSTRAINT "TrustedDropEvidence_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropEvidence" ADD CONSTRAINT "TrustedDropEvidence_subscriptionDeliveryId_fkey" FOREIGN KEY ("subscriptionDeliveryId") REFERENCES "SubscriptionDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropEvidence" ADD CONSTRAINT "TrustedDropEvidence_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "TrustedDropEvidence" ADD CONSTRAINT "TrustedDropEvidence_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "TrustedDropChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RunStopGeofenceProof" ADD CONSTRAINT "RunStopGeofenceProof_deliveryRunStopId_fkey" FOREIGN KEY ("deliveryRunStopId") REFERENCES "DeliveryRunStop"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RunStopGeofenceProof" ADD CONSTRAINT "RunStopGeofenceProof_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SubscriptionGenerationAttempt" ADD CONSTRAINT "SubscriptionGenerationAttempt_deliveryId_fkey" FOREIGN KEY ("subscriptionDeliveryId") REFERENCES "SubscriptionDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
