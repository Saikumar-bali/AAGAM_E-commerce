-- Production-grade customer subscriptions, generated delivery occurrences,
-- rider delivery runs, and route-level physical cash deposits. Existing Order,
-- DeliveryJob, DeliveryProof, Payment, CodLedger and InventoryLedger remain the
-- authoritative operational and financial records.

CREATE TYPE "OrderSource" AS ENUM ('CHECKOUT', 'SUBSCRIPTION', 'ADMIN');
CREATE TYPE "SubscriptionPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "SubscriptionFundingCycle" AS ENUM ('FULL_PLAN', 'WEEKLY');
CREATE TYPE "SubscriptionDeliveryFrequency" AS ENUM ('DAILY', 'ALTERNATE_DAYS', 'WEEKDAYS', 'SELECTED_WEEKDAYS', 'WEEKLY', 'CUSTOM');
CREATE TYPE "SubscriptionSkipPolicy" AS ENUM ('EXTEND_PLAN');
CREATE TYPE "CustomerSubscriptionStatus" AS ENUM ('PENDING_CASH_COLLECTION', 'ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD', 'PAUSED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "SubscriptionDeliveryMethod" AS ENUM ('TRUSTED_DROP', 'PERSONAL_HANDOVER', 'SECURITY_RECEPTION');
CREATE TYPE "SubscriptionDeliveryStatus" AS ENUM ('SCHEDULED', 'GENERATING', 'ORDER_GENERATED', 'PREPARING', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'SKIPPED', 'FAILED', 'RESCHEDULED', 'CANCELLED');
CREATE TYPE "SubscriptionProofMode" AS ENUM ('TRUSTED_DROP_GEOFENCE_TOKEN_PHOTO', 'PERSONAL_OTP_GPS', 'SECURITY_RECEPTION_OTP_GPS');
CREATE TYPE "DeliveryRunStatus" AS ENUM ('PLANNED', 'READY_FOR_PICKUP', 'PICKED_UP', 'IN_PROGRESS', 'RETURNING', 'AWAITING_SETTLEMENT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "DeliveryRunStopStatus" AS ENUM ('PLANNED', 'READY', 'ARRIVED', 'DELIVERED', 'FAILED', 'RETRY_PENDING', 'RETURN_REQUIRED', 'RETURNED', 'CANCELLED');
CREATE TYPE "CashDepositBatchStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'SETTLED', 'VARIANCE_REVIEW', 'CANCELLED');
CREATE TYPE "SubscriptionFundingAllocationStatus" AS ENUM ('ALLOCATED', 'REVERSED');
CREATE TYPE "SubscriptionIssueType" AS ENUM ('MISSING_DELIVERY', 'INCORRECT_ITEMS', 'DAMAGED_ITEMS', 'PROOF_DISPUTE', 'OTHER');
CREATE TYPE "SubscriptionIssueStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_CASH_CREDIT';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_FUNDED';
ALTER TYPE "DeliveryVerificationMethod" ADD VALUE IF NOT EXISTS 'TRUSTED_DROP';
ALTER TYPE "DeliveryVerificationMethod" ADD VALUE IF NOT EXISTS 'SECURITY_RECEPTION';
ALTER TYPE "CodLedgerEntryType" ADD VALUE IF NOT EXISTS 'COMPENSATING_ADJUSTMENT';

ALTER TABLE "DeliveryProof" ALTER COLUMN "otpOperationId" DROP NOT NULL;
ALTER TABLE "DeliveryProof" ADD COLUMN "proofReference" TEXT;

ALTER TABLE "Order"
  ADD COLUMN "orderSource" "OrderSource" NOT NULL DEFAULT 'CHECKOUT',
  ADD COLUMN "subscriptionId" TEXT,
  ADD COLUMN "subscriptionDeliveryId" TEXT,
  ADD COLUMN "scheduledDeliveryDate" TIMESTAMP(3),
  ADD COLUMN "deliveryWindowStart" TIMESTAMP(3),
  ADD COLUMN "deliveryWindowEnd" TIMESTAMP(3),
  ADD COLUMN "subscriptionSequence" INTEGER;

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "internalName" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "imageUrl" TEXT,
  "mobileImageUrl" TEXT,
  "status" "SubscriptionPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "fundingCycle" "SubscriptionFundingCycle" NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "totalDeliveries" INTEGER NOT NULL,
  "deliveryFrequency" "SubscriptionDeliveryFrequency" NOT NULL,
  "selectedWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "customSchedule" JSONB,
  "pricePaise" INTEGER NOT NULL,
  "mrpPaise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "defaultWindowStartMinute" INTEGER NOT NULL,
  "defaultWindowEndMinute" INTEGER NOT NULL,
  "orderGenerationHoursBefore" INTEGER NOT NULL DEFAULT 18,
  "skipCutoffHours" INTEGER NOT NULL DEFAULT 12,
  "allowPause" BOOLEAN NOT NULL DEFAULT true,
  "allowSkip" BOOLEAN NOT NULL DEFAULT true,
  "maximumSkips" INTEGER NOT NULL DEFAULT 3,
  "skipPolicy" "SubscriptionSkipPolicy" NOT NULL DEFAULT 'EXTEND_PLAN',
  "allowTrustedDrop" BOOLEAN NOT NULL DEFAULT true,
  "allowPersonalHandover" BOOLEAN NOT NULL DEFAULT true,
  "allowSecurityHandover" BOOLEAN NOT NULL DEFAULT true,
  "proofPolicy" JSONB NOT NULL,
  "isAutoRenewEnabled" BOOLEAN NOT NULL DEFAULT false,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionPlan_duration_check" CHECK ("durationDays" > 0 AND "totalDeliveries" > 0),
  CONSTRAINT "SubscriptionPlan_money_check" CHECK ("pricePaise" > 0 AND "mrpPaise" >= "pricePaise"),
  CONSTRAINT "SubscriptionPlan_window_check" CHECK ("defaultWindowStartMinute" BETWEEN 0 AND 1439 AND "defaultWindowEndMinute" BETWEEN 1 AND 1440 AND "defaultWindowEndMinute" > "defaultWindowStartMinute"),
  CONSTRAINT "SubscriptionPlan_generation_check" CHECK ("orderGenerationHoursBefore" BETWEEN 1 AND 72 AND "skipCutoffHours" BETWEEN 1 AND 72),
  CONSTRAINT "SubscriptionPlan_skips_check" CHECK ("maximumSkips" >= 0),
  CONSTRAINT "SubscriptionPlan_methods_check" CHECK ("allowTrustedDrop" OR "allowPersonalHandover" OR "allowSecurityHandover")
);

CREATE TABLE "SubscriptionPlanItem" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantityPerDelivery" INTEGER NOT NULL,
  "substituteRules" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlanItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionPlanItem_quantity_check" CHECK ("quantityPerDelivery" > 0)
);

CREATE TABLE "SubscriptionPlanVersion" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "pricePaise" INTEGER NOT NULL,
  "mrpPaise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "totalDeliveries" INTEGER NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "fundingCycle" "SubscriptionFundingCycle" NOT NULL,
  "deliveryFrequency" "SubscriptionDeliveryFrequency" NOT NULL,
  "selectedWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "itemsSnapshot" JSONB NOT NULL,
  "deliveryRulesSnapshot" JSONB NOT NULL,
  "proofPolicySnapshot" JSONB NOT NULL,
  "applicabilitySnapshot" JSONB NOT NULL,
  "fullSnapshot" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPlanVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionPlanVersion_contract_check" CHECK ("version" > 0 AND "pricePaise" > 0 AND "mrpPaise" >= "pricePaise" AND "totalDeliveries" > 0 AND "durationDays" > 0)
);

CREATE TABLE "SubscriptionPlanStore" (
  "planId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  CONSTRAINT "SubscriptionPlanStore_pkey" PRIMARY KEY ("planId", "storeId")
);

CREATE TABLE "SubscriptionPlanZone" (
  "planId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  CONSTRAINT "SubscriptionPlanZone_pkey" PRIMARY KEY ("planId", "zoneId")
);

CREATE TABLE "CustomerSubscription" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "planVersionId" TEXT NOT NULL,
  "addressId" TEXT NOT NULL,
  "homeStoreId" TEXT,
  "status" "CustomerSubscriptionStatus" NOT NULL DEFAULT 'PENDING_CASH_COLLECTION',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "nextDeliveryDate" TIMESTAMP(3),
  "nextCashCollectionDate" TIMESTAMP(3),
  "deliveryWindowStartMinute" INTEGER NOT NULL,
  "deliveryWindowEndMinute" INTEGER NOT NULL,
  "deliveryMethod" "SubscriptionDeliveryMethod" NOT NULL,
  "trustedDropInstructions" TEXT,
  "dropPointTokenHash" TEXT,
  "priceSnapshot" JSONB NOT NULL,
  "itemsSnapshot" JSONB NOT NULL,
  "addressSnapshot" JSONB NOT NULL,
  "policySnapshot" JSONB NOT NULL,
  "fundedDeliveryCount" INTEGER NOT NULL DEFAULT 0,
  "remainingFundedDeliveries" INTEGER NOT NULL DEFAULT 0,
  "completedDeliveries" INTEGER NOT NULL DEFAULT 0,
  "skippedDeliveries" INTEGER NOT NULL DEFAULT 0,
  "failedDeliveries" INTEGER NOT NULL DEFAULT 0,
  "amountDuePaise" INTEGER NOT NULL,
  "amountCollectedPaise" INTEGER NOT NULL DEFAULT 0,
  "fundingCycle" "SubscriptionFundingCycle" NOT NULL,
  "pausedAt" TIMESTAMP(3),
  "pauseEffectiveFrom" TIMESTAMP(3),
  "pauseReason" TEXT,
  "resumedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "cancelledById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerSubscription_date_check" CHECK ("endDate" >= "startDate"),
  CONSTRAINT "CustomerSubscription_window_check" CHECK ("deliveryWindowStartMinute" BETWEEN 0 AND 1439 AND "deliveryWindowEndMinute" BETWEEN 1 AND 1440 AND "deliveryWindowEndMinute" > "deliveryWindowStartMinute"),
  CONSTRAINT "CustomerSubscription_counts_check" CHECK ("fundedDeliveryCount" >= 0 AND "remainingFundedDeliveries" >= 0 AND "completedDeliveries" >= 0 AND "skippedDeliveries" >= 0 AND "failedDeliveries" >= 0),
  CONSTRAINT "CustomerSubscription_money_check" CHECK ("amountDuePaise" >= 0 AND "amountCollectedPaise" >= 0),
  CONSTRAINT "CustomerSubscription_trusted_drop_check" CHECK ("deliveryMethod" <> 'TRUSTED_DROP' OR "dropPointTokenHash" IS NOT NULL)
);

CREATE TABLE "SubscriptionDelivery" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "status" "SubscriptionDeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
  "generationKey" TEXT NOT NULL,
  "deliveryJobId" TEXT,
  "storeId" TEXT,
  "cashDuePaise" INTEGER NOT NULL DEFAULT 0,
  "proofMode" "SubscriptionProofMode" NOT NULL,
  "failureReason" TEXT,
  "skipReason" TEXT,
  "rescheduledFromDate" TIMESTAMP(3),
  "rescheduledToDate" TIMESTAMP(3),
  "generatedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionDelivery_sequence_check" CHECK ("sequenceNumber" > 0),
  CONSTRAINT "SubscriptionDelivery_cash_check" CHECK ("cashDuePaise" >= 0)
);

CREATE TABLE "SubscriptionFundingAllocation" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "codLedgerId" TEXT NOT NULL,
  "startsAtSequence" INTEGER NOT NULL,
  "endsAtSequence" INTEGER NOT NULL,
  "fundedDeliveryCount" INTEGER NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "status" "SubscriptionFundingAllocationStatus" NOT NULL DEFAULT 'ALLOCATED',
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  CONSTRAINT "SubscriptionFundingAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionFundingAllocation_range_check" CHECK ("startsAtSequence" > 0 AND "endsAtSequence" >= "startsAtSequence" AND "fundedDeliveryCount" > 0),
  CONSTRAINT "SubscriptionFundingAllocation_amount_check" CHECK ("amountPaise" > 0)
);

CREATE TABLE "DeliveryRun" (
  "id" TEXT NOT NULL,
  "routeCode" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "riderId" TEXT,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "slotStart" TIMESTAMP(3) NOT NULL,
  "slotEnd" TIMESTAMP(3) NOT NULL,
  "deliveryCluster" TEXT NOT NULL,
  "status" "DeliveryRunStatus" NOT NULL DEFAULT 'PLANNED',
  "totalStopCount" INTEGER NOT NULL DEFAULT 0,
  "completedStopCount" INTEGER NOT NULL DEFAULT 0,
  "failedStopCount" INTEGER NOT NULL DEFAULT 0,
  "retryPendingStopCount" INTEGER NOT NULL DEFAULT 0,
  "expectedCashPaise" INTEGER NOT NULL DEFAULT 0,
  "collectedCashPaise" INTEGER NOT NULL DEFAULT 0,
  "depositedCashPaise" INTEGER NOT NULL DEFAULT 0,
  "varianceCashPaise" INTEGER NOT NULL DEFAULT 0,
  "expectedParcelCount" INTEGER NOT NULL DEFAULT 0,
  "expectedItemCount" INTEGER NOT NULL DEFAULT 0,
  "expectedBagCount" INTEGER NOT NULL DEFAULT 0,
  "packedBagCount" INTEGER NOT NULL DEFAULT 0,
  "crateCode" TEXT,
  "packingConfirmedAt" TIMESTAMP(3),
  "packingConfirmedById" TEXT,
  "storeHandoffConfirmedAt" TIMESTAMP(3),
  "storeHandoffConfirmedById" TEXT,
  "pickupConfirmedAt" TIMESTAMP(3),
  "pickupConfirmedById" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryRun_slot_check" CHECK ("slotEnd" > "slotStart"),
  CONSTRAINT "DeliveryRun_counts_check" CHECK ("totalStopCount" >= 0 AND "completedStopCount" >= 0 AND "failedStopCount" >= 0 AND "retryPendingStopCount" >= 0 AND "expectedParcelCount" >= 0 AND "expectedItemCount" >= 0 AND "expectedBagCount" >= 0 AND "packedBagCount" >= 0),
  CONSTRAINT "DeliveryRun_cash_check" CHECK ("expectedCashPaise" >= 0 AND "collectedCashPaise" >= 0 AND "depositedCashPaise" >= 0),
  CONSTRAINT "DeliveryRun_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "DeliveryRunStop" (
  "id" TEXT NOT NULL,
  "deliveryRunId" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "subscriptionDeliveryId" TEXT NOT NULL,
  "sequenceNumber" INTEGER NOT NULL,
  "status" "DeliveryRunStopStatus" NOT NULL DEFAULT 'PLANNED',
  "proofMode" "SubscriptionProofMode" NOT NULL,
  "cashDuePaise" INTEGER NOT NULL DEFAULT 0,
  "expectedItemCount" INTEGER NOT NULL,
  "expectedParcelCount" INTEGER NOT NULL DEFAULT 1,
  "arrivedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "accuracyMetres" DOUBLE PRECISION,
  "proofReference" TEXT,
  "failureReason" TEXT,
  "routeOrderChangeReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryRunStop_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeliveryRunStop_sequence_check" CHECK ("sequenceNumber" > 0),
  CONSTRAINT "DeliveryRunStop_counts_check" CHECK ("cashDuePaise" >= 0 AND "expectedItemCount" > 0 AND "expectedParcelCount" > 0 AND "retryCount" >= 0 AND "version" >= 0),
  CONSTRAINT "DeliveryRunStop_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  CONSTRAINT "DeliveryRunStop_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  CONSTRAINT "DeliveryRunStop_accuracy_check" CHECK ("accuracyMetres" IS NULL OR "accuracyMetres" >= 0)
);

CREATE TABLE "CashDepositBatch" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "deliveryRunId" TEXT NOT NULL,
  "expectedAmountPaise" INTEGER NOT NULL,
  "submittedAmountPaise" INTEGER NOT NULL DEFAULT 0,
  "verifiedAmountPaise" INTEGER NOT NULL DEFAULT 0,
  "variancePaise" INTEGER NOT NULL DEFAULT 0,
  "status" "CashDepositBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedById" TEXT,
  "verifiedById" TEXT,
  "riderSubmittedAt" TIMESTAMP(3),
  "storeVerifiedAt" TIMESTAMP(3),
  "settlementReference" TEXT,
  "receiptEvidence" JSONB,
  "varianceReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashDepositBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashDepositBatch_amounts_check" CHECK ("expectedAmountPaise" > 0 AND "submittedAmountPaise" >= 0 AND "verifiedAmountPaise" >= 0),
  CONSTRAINT "CashDepositBatch_version_check" CHECK ("version" >= 0)
);

CREATE TABLE "CashDepositBatchEntry" (
  "id" TEXT NOT NULL,
  "cashDepositBatchId" TEXT NOT NULL,
  "codLedgerId" TEXT NOT NULL,
  "allocatedAmountPaise" INTEGER NOT NULL,
  "holdingBeforePaise" INTEGER NOT NULL,
  "holdingAfterPaise" INTEGER NOT NULL,
  "depositedBeforePaise" INTEGER NOT NULL,
  "depositedAfterPaise" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashDepositBatchEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CashDepositBatchEntry_amounts_check" CHECK ("allocatedAmountPaise" >= 0 AND "holdingBeforePaise" >= 0 AND "holdingAfterPaise" >= 0 AND "depositedBeforePaise" >= 0 AND "depositedAfterPaise" >= 0)
);

CREATE TABLE "CashDepositAuditEntry" (
  "id" TEXT NOT NULL,
  "cashDepositBatchId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorRole" "Role" NOT NULL,
  "action" TEXT NOT NULL,
  "amountPaise" INTEGER,
  "reason" TEXT,
  "metadata" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashDepositAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionIssueReport" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "subscriptionDeliveryId" TEXT,
  "customerId" TEXT NOT NULL,
  "type" "SubscriptionIssueType" NOT NULL,
  "status" "SubscriptionIssueStatus" NOT NULL DEFAULT 'OPEN',
  "description" TEXT NOT NULL,
  "evidence" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "resolvedById" TEXT,
  "resolution" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionIssueReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionAuditEntry" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorRole" "Role" NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE INDEX "SubscriptionPlan_status_sortOrder_idx" ON "SubscriptionPlan"("status", "sortOrder");
CREATE INDEX "SubscriptionPlan_startsAt_endsAt_idx" ON "SubscriptionPlan"("startsAt", "endsAt");
CREATE UNIQUE INDEX "SubscriptionPlanItem_planId_productId_key" ON "SubscriptionPlanItem"("planId", "productId");
CREATE INDEX "SubscriptionPlanItem_productId_idx" ON "SubscriptionPlanItem"("productId");
CREATE UNIQUE INDEX "SubscriptionPlanVersion_planId_version_key" ON "SubscriptionPlanVersion"("planId", "version");
CREATE INDEX "SubscriptionPlanVersion_planId_createdAt_idx" ON "SubscriptionPlanVersion"("planId", "createdAt");
CREATE INDEX "SubscriptionPlanStore_storeId_idx" ON "SubscriptionPlanStore"("storeId");
CREATE INDEX "SubscriptionPlanZone_zoneId_idx" ON "SubscriptionPlanZone"("zoneId");
CREATE INDEX "CustomerSubscription_customerId_status_idx" ON "CustomerSubscription"("customerId", "status");
CREATE INDEX "CustomerSubscription_status_nextDeliveryDate_idx" ON "CustomerSubscription"("status", "nextDeliveryDate");
CREATE INDEX "CustomerSubscription_homeStoreId_status_idx" ON "CustomerSubscription"("homeStoreId", "status");
CREATE UNIQUE INDEX "SubscriptionDelivery_generationKey_key" ON "SubscriptionDelivery"("generationKey");
CREATE UNIQUE INDEX "SubscriptionDelivery_deliveryJobId_key" ON "SubscriptionDelivery"("deliveryJobId");
CREATE UNIQUE INDEX "SubscriptionDelivery_subscriptionId_serviceDate_key" ON "SubscriptionDelivery"("subscriptionId", "serviceDate");
CREATE UNIQUE INDEX "SubscriptionDelivery_subscriptionId_sequenceNumber_key" ON "SubscriptionDelivery"("subscriptionId", "sequenceNumber");
CREATE INDEX "SubscriptionDelivery_status_serviceDate_idx" ON "SubscriptionDelivery"("status", "serviceDate");
CREATE INDEX "SubscriptionDelivery_storeId_serviceDate_idx" ON "SubscriptionDelivery"("storeId", "serviceDate");
CREATE UNIQUE INDEX "SubscriptionFundingAllocation_codLedgerId_key" ON "SubscriptionFundingAllocation"("codLedgerId");
CREATE UNIQUE INDEX "SubscriptionFundingAllocation_idempotencyKey_key" ON "SubscriptionFundingAllocation"("idempotencyKey");
CREATE INDEX "SubscriptionFundingAllocation_subscriptionId_status_idx" ON "SubscriptionFundingAllocation"("subscriptionId", "status");
CREATE UNIQUE INDEX "DeliveryRun_routeCode_key" ON "DeliveryRun"("routeCode");
CREATE UNIQUE INDEX "DeliveryRun_crateCode_key" ON "DeliveryRun"("crateCode");
CREATE UNIQUE INDEX "DeliveryRun_storeId_serviceDate_slotStart_deliveryCluster_key" ON "DeliveryRun"("storeId", "serviceDate", "slotStart", "deliveryCluster");
CREATE INDEX "DeliveryRun_riderId_serviceDate_status_idx" ON "DeliveryRun"("riderId", "serviceDate", "status");
CREATE INDEX "DeliveryRun_storeId_serviceDate_status_idx" ON "DeliveryRun"("storeId", "serviceDate", "status");
CREATE UNIQUE INDEX "DeliveryRunStop_deliveryJobId_key" ON "DeliveryRunStop"("deliveryJobId");
CREATE UNIQUE INDEX "DeliveryRunStop_subscriptionDeliveryId_key" ON "DeliveryRunStop"("subscriptionDeliveryId");
CREATE UNIQUE INDEX "DeliveryRunStop_deliveryRunId_sequenceNumber_key" ON "DeliveryRunStop"("deliveryRunId", "sequenceNumber");
CREATE INDEX "DeliveryRunStop_deliveryRunId_status_idx" ON "DeliveryRunStop"("deliveryRunId", "status");
CREATE UNIQUE INDEX "CashDepositBatch_reference_key" ON "CashDepositBatch"("reference");
CREATE UNIQUE INDEX "CashDepositBatch_deliveryRunId_key" ON "CashDepositBatch"("deliveryRunId");
CREATE INDEX "CashDepositBatch_riderId_status_idx" ON "CashDepositBatch"("riderId", "status");
CREATE INDEX "CashDepositBatch_storeId_status_idx" ON "CashDepositBatch"("storeId", "status");
CREATE UNIQUE INDEX "CashDepositBatchEntry_codLedgerId_key" ON "CashDepositBatchEntry"("codLedgerId");
CREATE INDEX "CashDepositBatchEntry_cashDepositBatchId_idx" ON "CashDepositBatchEntry"("cashDepositBatchId");
CREATE UNIQUE INDEX "CashDepositAuditEntry_idempotencyKey_key" ON "CashDepositAuditEntry"("idempotencyKey");
CREATE INDEX "CashDepositAuditEntry_cashDepositBatchId_createdAt_idx" ON "CashDepositAuditEntry"("cashDepositBatchId", "createdAt");
CREATE UNIQUE INDEX "SubscriptionIssueReport_idempotencyKey_key" ON "SubscriptionIssueReport"("idempotencyKey");
CREATE INDEX "SubscriptionIssueReport_subscriptionId_status_idx" ON "SubscriptionIssueReport"("subscriptionId", "status");
CREATE INDEX "SubscriptionIssueReport_subscriptionDeliveryId_idx" ON "SubscriptionIssueReport"("subscriptionDeliveryId");
CREATE INDEX "SubscriptionIssueReport_customerId_createdAt_idx" ON "SubscriptionIssueReport"("customerId", "createdAt");
CREATE UNIQUE INDEX "SubscriptionAuditEntry_idempotencyKey_key" ON "SubscriptionAuditEntry"("idempotencyKey");
CREATE INDEX "SubscriptionAuditEntry_subscriptionId_createdAt_idx" ON "SubscriptionAuditEntry"("subscriptionId", "createdAt");
CREATE UNIQUE INDEX "Order_subscriptionDeliveryId_key" ON "Order"("subscriptionDeliveryId");
CREATE INDEX "Order_orderSource_scheduledDeliveryDate_idx" ON "Order"("orderSource", "scheduledDeliveryDate");
CREATE INDEX "Order_subscriptionId_scheduledDeliveryDate_idx" ON "Order"("subscriptionId", "scheduledDeliveryDate");

ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanItem" ADD CONSTRAINT "SubscriptionPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanItem" ADD CONSTRAINT "SubscriptionPlanItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanVersion" ADD CONSTRAINT "SubscriptionPlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanVersion" ADD CONSTRAINT "SubscriptionPlanVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanStore" ADD CONSTRAINT "SubscriptionPlanStore_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanStore" ADD CONSTRAINT "SubscriptionPlanStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanZone" ADD CONSTRAINT "SubscriptionPlanZone_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionPlanZone" ADD CONSTRAINT "SubscriptionPlanZone_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "SubscriptionPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "CustomerAddress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_homeStoreId_fkey" FOREIGN KEY ("homeStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionDelivery" ADD CONSTRAINT "SubscriptionDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionDelivery" ADD CONSTRAINT "SubscriptionDelivery_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionDelivery" ADD CONSTRAINT "SubscriptionDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionFundingAllocation" ADD CONSTRAINT "SubscriptionFundingAllocation_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionFundingAllocation" ADD CONSTRAINT "SubscriptionFundingAllocation_codLedgerId_fkey" FOREIGN KEY ("codLedgerId") REFERENCES "CodLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryRunStop" ADD CONSTRAINT "DeliveryRunStop_deliveryRunId_fkey" FOREIGN KEY ("deliveryRunId") REFERENCES "DeliveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryRunStop" ADD CONSTRAINT "DeliveryRunStop_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryRunStop" ADD CONSTRAINT "DeliveryRunStop_subscriptionDeliveryId_fkey" FOREIGN KEY ("subscriptionDeliveryId") REFERENCES "SubscriptionDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDepositBatch" ADD CONSTRAINT "CashDepositBatch_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "RiderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDepositBatch" ADD CONSTRAINT "CashDepositBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDepositBatch" ADD CONSTRAINT "CashDepositBatch_deliveryRunId_fkey" FOREIGN KEY ("deliveryRunId") REFERENCES "DeliveryRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDepositBatch" ADD CONSTRAINT "CashDepositBatch_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDepositBatch" ADD CONSTRAINT "CashDepositBatch_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDepositBatchEntry" ADD CONSTRAINT "CashDepositBatchEntry_cashDepositBatchId_fkey" FOREIGN KEY ("cashDepositBatchId") REFERENCES "CashDepositBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashDepositBatchEntry" ADD CONSTRAINT "CashDepositBatchEntry_codLedgerId_fkey" FOREIGN KEY ("codLedgerId") REFERENCES "CodLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDepositAuditEntry" ADD CONSTRAINT "CashDepositAuditEntry_cashDepositBatchId_fkey" FOREIGN KEY ("cashDepositBatchId") REFERENCES "CashDepositBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashDepositAuditEntry" ADD CONSTRAINT "CashDepositAuditEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionIssueReport" ADD CONSTRAINT "SubscriptionIssueReport_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionIssueReport" ADD CONSTRAINT "SubscriptionIssueReport_subscriptionDeliveryId_fkey" FOREIGN KEY ("subscriptionDeliveryId") REFERENCES "SubscriptionDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionIssueReport" ADD CONSTRAINT "SubscriptionIssueReport_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubscriptionIssueReport" ADD CONSTRAINT "SubscriptionIssueReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAuditEntry" ADD CONSTRAINT "SubscriptionAuditEntry_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionAuditEntry" ADD CONSTRAINT "SubscriptionAuditEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_subscriptionDeliveryId_fkey" FOREIGN KEY ("subscriptionDeliveryId") REFERENCES "SubscriptionDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
