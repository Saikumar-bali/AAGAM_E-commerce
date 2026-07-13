-- Phase 5: professional pickup/delivery proof, independent COD ledger, and
-- controlled failed-delivery resolution decisions.

CREATE TYPE "PickupVerificationMethod" AS ENUM ('STORE_PICKUP_PIN', 'QR_CODE', 'STORE_CONFIRMED_HANDOFF');
CREATE TYPE "PickupChallengeStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'SUPERSEDED', 'FAILED');
CREATE TYPE "DeliveryVerificationMethod" AS ENUM ('CUSTOMER_OTP_PIN');
CREATE TYPE "CodSettlementStatus" AS ENUM ('AWAITING_COLLECTION', 'HELD_BY_RIDER', 'PARTIALLY_DEPOSITED', 'SETTLED', 'VARIANCE_REVIEW');
CREATE TYPE "CodLedgerEntryType" AS ENUM ('EXPECTED', 'COLLECTED', 'DEPOSITED', 'VARIANCE_RECORDED');
CREATE TYPE "DeliveryFailureReasonCode" AS ENUM (
  'CUSTOMER_UNREACHABLE', 'CUSTOMER_REFUSED', 'ADDRESS_NOT_FOUND', 'WRONG_ADDRESS',
  'PAYMENT_NOT_AVAILABLE', 'VEHICLE_BREAKDOWN', 'PACKAGE_DAMAGED', 'SAFETY_CONCERN', 'OTHER'
);
CREATE TYPE "DeliveryResolutionAction" AS ENUM ('RETRY_DELIVERY', 'REASSIGN_RIDER', 'RETURN_TO_STORE', 'CANCEL_AND_REFUND', 'ESCALATE_TO_ADMIN');
CREATE TYPE "DeliveryResolutionStatus" AS ENUM ('DECIDED', 'IN_PROGRESS', 'COMPLETED', 'SUPERSEDED');

ALTER TYPE "DeliveryOperationType" ADD VALUE IF NOT EXISTS 'PICKUP_CHALLENGE_ISSUED';
ALTER TYPE "DeliveryOperationType" ADD VALUE IF NOT EXISTS 'PICKUP_VERIFIED';
ALTER TYPE "DeliveryOperationType" ADD VALUE IF NOT EXISTS 'DELIVERY_PROOF_RECORDED';
ALTER TYPE "DeliveryOperationType" ADD VALUE IF NOT EXISTS 'FAILURE_RESOLUTION_DECIDED';
ALTER TYPE "DeliveryOperationType" ADD VALUE IF NOT EXISTS 'FAILURE_RESOLUTION_APPLIED';
ALTER TYPE "DeliveryOperationType" ADD VALUE IF NOT EXISTS 'COD_VARIANCE_RECORDED';

CREATE TABLE "PickupChallenge" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "method" "PickupVerificationMethod" NOT NULL,
  "codeHash" TEXT NOT NULL,
  "salt" TEXT NOT NULL,
  "issuedByStoreUserId" TEXT NOT NULL,
  "parcelCount" INTEGER NOT NULL,
  "status" "PickupChallengeStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PickupChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PickupChallenge_parcelCount_check" CHECK ("parcelCount" > 0),
  CONSTRAINT "PickupChallenge_attempts_check" CHECK ("attempts" >= 0)
);

CREATE TABLE "PickupProof" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "storeUserId" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyMetres" DOUBLE PRECISION,
  "parcelCount" INTEGER NOT NULL,
  "verificationMethod" "PickupVerificationMethod" NOT NULL,
  "challengeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PickupProof_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PickupProof_parcelCount_check" CHECK ("parcelCount" > 0),
  CONSTRAINT "PickupProof_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  CONSTRAINT "PickupProof_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "PickupProof_accuracy_check" CHECK ("accuracyMetres" IS NULL OR "accuracyMetres" >= 0)
);

CREATE TABLE "DeliveryProof" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "verificationMethod" "DeliveryVerificationMethod" NOT NULL DEFAULT 'CUSTOMER_OTP_PIN',
  "otpOperationId" TEXT NOT NULL,
  "riderConfirmedAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyMetres" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryProof_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  CONSTRAINT "DeliveryProof_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "DeliveryProof_accuracy_check" CHECK ("accuracyMetres" IS NULL OR "accuracyMetres" >= 0)
);

CREATE TABLE "CodLedger" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "riderId" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "expectedAmountPaise" INTEGER NOT NULL,
  "collectedAmountPaise" INTEGER NOT NULL DEFAULT 0,
  "collectionTimestamp" TIMESTAMP(3),
  "riderHoldingBalancePaise" INTEGER NOT NULL DEFAULT 0,
  "depositedAmountPaise" INTEGER NOT NULL DEFAULT 0,
  "settlementReference" TEXT,
  "variancePaise" INTEGER NOT NULL DEFAULT 0,
  "varianceReason" TEXT,
  "status" "CodSettlementStatus" NOT NULL DEFAULT 'AWAITING_COLLECTION',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CodLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CodLedger_amounts_check" CHECK (
    "expectedAmountPaise" > 0 AND "collectedAmountPaise" >= 0 AND
    "riderHoldingBalancePaise" >= 0 AND "depositedAmountPaise" >= 0
  )
);

CREATE TABLE "CodLedgerEntry" (
  "id" TEXT NOT NULL,
  "codLedgerId" TEXT NOT NULL,
  "type" "CodLedgerEntryType" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "holdingAfterPaise" INTEGER NOT NULL,
  "depositedAfterPaise" INTEGER NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorRole" "Role" NOT NULL,
  "reference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CodLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CodLedgerEntry_amounts_check" CHECK ("amountPaise" >= 0 AND "holdingAfterPaise" >= 0 AND "depositedAfterPaise" >= 0)
);

CREATE TABLE "DeliveryFailureDecision" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "failureOperationId" TEXT NOT NULL,
  "reason" "DeliveryFailureReasonCode" NOT NULL,
  "recommendedAction" "DeliveryResolutionAction" NOT NULL,
  "decidedAction" "DeliveryResolutionAction" NOT NULL,
  "status" "DeliveryResolutionStatus" NOT NULL DEFAULT 'DECIDED',
  "policyVersion" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "decidedBy" TEXT NOT NULL DEFAULT 'SYSTEM',
  "overriddenByUserId" TEXT,
  "overrideReason" TEXT,
  "appliedByUserId" TEXT,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryFailureDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PickupChallenge_deliveryJobId_status_expiresAt_idx" ON "PickupChallenge"("deliveryJobId", "status", "expiresAt");
CREATE UNIQUE INDEX "PickupProof_deliveryJobId_key" ON "PickupProof"("deliveryJobId");
CREATE UNIQUE INDEX "PickupProof_orderId_key" ON "PickupProof"("orderId");
CREATE UNIQUE INDEX "PickupProof_challengeId_key" ON "PickupProof"("challengeId");
CREATE INDEX "PickupProof_riderId_verifiedAt_idx" ON "PickupProof"("riderId", "verifiedAt");
CREATE INDEX "PickupProof_storeUserId_verifiedAt_idx" ON "PickupProof"("storeUserId", "verifiedAt");
CREATE UNIQUE INDEX "DeliveryProof_deliveryJobId_key" ON "DeliveryProof"("deliveryJobId");
CREATE UNIQUE INDEX "DeliveryProof_orderId_key" ON "DeliveryProof"("orderId");
CREATE INDEX "DeliveryProof_riderId_verifiedAt_idx" ON "DeliveryProof"("riderId", "verifiedAt");
CREATE INDEX "DeliveryProof_customerUserId_verifiedAt_idx" ON "DeliveryProof"("customerUserId", "verifiedAt");
CREATE UNIQUE INDEX "CodLedger_deliveryJobId_key" ON "CodLedger"("deliveryJobId");
CREATE UNIQUE INDEX "CodLedger_orderId_key" ON "CodLedger"("orderId");
CREATE INDEX "CodLedger_riderId_status_idx" ON "CodLedger"("riderId", "status");
CREATE INDEX "CodLedger_status_updatedAt_idx" ON "CodLedger"("status", "updatedAt");
CREATE UNIQUE INDEX "CodLedger_settlementReference_key" ON "CodLedger"("settlementReference") WHERE "settlementReference" IS NOT NULL;
CREATE UNIQUE INDEX "CodLedgerEntry_idempotencyKey_key" ON "CodLedgerEntry"("idempotencyKey");
CREATE INDEX "CodLedgerEntry_codLedgerId_createdAt_idx" ON "CodLedgerEntry"("codLedgerId", "createdAt");
CREATE INDEX "CodLedgerEntry_actorUserId_createdAt_idx" ON "CodLedgerEntry"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "DeliveryFailureDecision_failureOperationId_key" ON "DeliveryFailureDecision"("failureOperationId");
CREATE INDEX "DeliveryFailureDecision_deliveryJobId_createdAt_idx" ON "DeliveryFailureDecision"("deliveryJobId", "createdAt");
CREATE INDEX "DeliveryFailureDecision_status_recommendedAction_createdAt_idx" ON "DeliveryFailureDecision"("status", "recommendedAction", "createdAt");

ALTER TABLE "PickupChallenge" ADD CONSTRAINT "PickupChallenge_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickupChallenge" ADD CONSTRAINT "PickupChallenge_issuedByStoreUserId_fkey" FOREIGN KEY ("issuedByStoreUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupProof" ADD CONSTRAINT "PickupProof_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickupProof" ADD CONSTRAINT "PickupProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PickupProof" ADD CONSTRAINT "PickupProof_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupProof" ADD CONSTRAINT "PickupProof_storeUserId_fkey" FOREIGN KEY ("storeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PickupProof" ADD CONSTRAINT "PickupProof_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "PickupChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CodLedger" ADD CONSTRAINT "CodLedger_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodLedger" ADD CONSTRAINT "CodLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodLedger" ADD CONSTRAINT "CodLedger_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CodLedgerEntry" ADD CONSTRAINT "CodLedgerEntry_codLedgerId_fkey" FOREIGN KEY ("codLedgerId") REFERENCES "CodLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodLedgerEntry" ADD CONSTRAINT "CodLedgerEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryFailureDecision" ADD CONSTRAINT "DeliveryFailureDecision_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryFailureDecision" ADD CONSTRAINT "DeliveryFailureDecision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryFailureDecision" ADD CONSTRAINT "DeliveryFailureDecision_failureOperationId_fkey" FOREIGN KEY ("failureOperationId") REFERENCES "DeliveryOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
