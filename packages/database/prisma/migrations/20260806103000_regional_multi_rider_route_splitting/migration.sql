-- Region-aware subscription delivery planning, multi-rider route splitting,
-- safe manual route operations, recovery runs, and rider-specific accountability.
-- This migration is additive and preserves all existing order, proof, COD, and
-- subscription history.

ALTER TYPE "DeliveryRunStatus" ADD VALUE IF NOT EXISTS 'RIDER_NEEDED';
ALTER TYPE "DeliveryRunStatus" ADD VALUE IF NOT EXISTS 'INTERRUPTED';
ALTER TYPE "DeliveryRunStatus" ADD VALUE IF NOT EXISTS 'RECOVERY_REQUIRED';

DO $$ BEGIN
  CREATE TYPE "DeliveryZoneResolutionSource" AS ENUM ('POLYGON', 'RADIUS', 'MANUAL', 'UNRESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RouteAssignmentSource" AS ENUM ('AUTOMATIC', 'MANUAL', 'RECOVERY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryRouteEventType" AS ENUM (
    'DELIVERY_REGION_RESOLVED',
    'ROUTE_CLUSTER_CREATED',
    'DELIVERY_RUN_SPLIT',
    'DELIVERY_RUN_MERGED',
    'DELIVERY_RUN_ASSIGNED',
    'DELIVERY_RUN_REASSIGNED',
    'DELIVERY_RUN_CAPACITY_WARNING',
    'DELIVERY_RUN_CASH_LIMIT_WARNING',
    'DELIVERY_RUN_INTERRUPTED',
    'RECOVERY_RUN_CREATED',
    'RUN_STOP_MOVED',
    'RUN_STOP_REORDERED',
    'DELIVERY_RUN_CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "DeliveryZone"
  ADD COLUMN IF NOT EXISTS "code" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "polygon" JSONB,
  ADD COLUMN IF NOT EXISTS "centerLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "centerLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "fallbackRadiusKm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "deliverySlots" JSONB,
  ADD COLUMN IF NOT EXISTS "maximumDailySubscriptionCapacity" INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS "maximumStopsPerRun" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "maximumRouteDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "maximumEstimatedDurationMinutes" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS "maximumParcelCount" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS "maximumWeightKg" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "cashRiskLimitPaise" INTEGER NOT NULL DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS "slotEndBufferMinutes" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "allowedVehicleTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "neighbouringZoneIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "DeliveryZone"
SET "code" = UPPER(REGEXP_REPLACE("name", '[^A-Za-z0-9]+', '-', 'g')) || '-' || UPPER(SUBSTRING(MD5("id"), 1, 6))
WHERE "code" IS NULL OR BTRIM("code") = '';

ALTER TABLE "DeliveryZone" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryZone_code_key" ON "DeliveryZone"("code");
CREATE INDEX IF NOT EXISTS "DeliveryZone_active_priority_idx" ON "DeliveryZone"("isActive", "priority", "sortOrder");

ALTER TABLE "CustomerAddress"
  ADD COLUMN IF NOT EXISTS "deliveryZoneId" TEXT,
  ADD COLUMN IF NOT EXISTS "zoneResolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "zoneResolutionSource" "DeliveryZoneResolutionSource",
  ADD COLUMN IF NOT EXISTS "zoneResolutionConfidence" DOUBLE PRECISION;

ALTER TABLE "CustomerSubscription"
  ADD COLUMN IF NOT EXISTS "deliveryZoneId" TEXT;

ALTER TABLE "SubscriptionDelivery"
  ADD COLUMN IF NOT EXISTS "deliveryZoneId" TEXT;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "deliveryZoneId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryZoneSnapshot" JSONB;

ALTER TABLE "RiderProfile"
  ADD COLUMN IF NOT EXISTS "homeZoneId" TEXT,
  ADD COLUMN IF NOT EXISTS "maximumParcelCapacity" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "maximumCashHoldingPaise" INTEGER NOT NULL DEFAULT 1000000;

ALTER TABLE "DeliveryRun"
  ADD COLUMN IF NOT EXISTS "deliveryZoneId" TEXT,
  ADD COLUMN IF NOT EXISTS "planningAlgorithmVersion" TEXT NOT NULL DEFAULT 'regional-nearest-neighbour-v1',
  ADD COLUMN IF NOT EXISTS "plannedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "originalStopCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "estimatedDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "estimatedDurationMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "clusterIdentifier" TEXT,
  ADD COLUMN IF NOT EXISTS "manualOverride" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "manualOverrideReason" TEXT,
  ADD COLUMN IF NOT EXISTS "assignmentScoreVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "assignmentReasonSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "assignmentConstraints" JSONB,
  ADD COLUMN IF NOT EXISTS "assignmentSource" "RouteAssignmentSource",
  ADD COLUMN IF NOT EXISTS "recoveryFromRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "interruptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "interruptionReason" TEXT;

UPDATE "DeliveryRun"
SET
  "clusterIdentifier" = COALESCE("clusterIdentifier", "deliveryCluster"),
  "plannedAt" = COALESCE("plannedAt", "createdAt"),
  "originalStopCount" = CASE WHEN "originalStopCount" = 0 THEN "totalStopCount" ELSE "originalStopCount" END;

ALTER TABLE "DeliveryRunStop"
  ADD COLUMN IF NOT EXISTS "deliveryZoneId" TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "deliveryLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "movedFromRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastMovedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "DeliveryZoneStore" (
  "zoneId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryZoneStore_pkey" PRIMARY KEY ("zoneId", "storeId")
);

CREATE TABLE IF NOT EXISTS "DeliveryZonePreferredRider" (
  "zoneId" TEXT NOT NULL,
  "riderProfileId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryZonePreferredRider_pkey" PRIMARY KEY ("zoneId", "riderProfileId")
);

CREATE TABLE IF NOT EXISTS "DeliveryRunAuditEntry" (
  "id" TEXT NOT NULL,
  "deliveryRunId" TEXT,
  "actorUserId" TEXT,
  "actorRole" "Role",
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceRunId" TEXT,
  "destinationRunId" TEXT,
  "metadata" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryRunAuditEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeliveryRouteEvent" (
  "id" TEXT NOT NULL,
  "eventType" "DeliveryRouteEventType" NOT NULL,
  "deliveryRunId" TEXT,
  "deliveryRunStopId" TEXT,
  "actorUserId" TEXT,
  "payload" JSONB NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryRouteEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryRunAuditEntry_idempotencyKey_key" ON "DeliveryRunAuditEntry"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryRouteEvent_dedupeKey_key" ON "DeliveryRouteEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "DeliveryRunAuditEntry_run_created_idx" ON "DeliveryRunAuditEntry"("deliveryRunId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeliveryRouteEvent_run_created_idx" ON "DeliveryRouteEvent"("deliveryRunId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeliveryRouteEvent_type_created_idx" ON "DeliveryRouteEvent"("eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "DeliveryZoneStore_store_idx" ON "DeliveryZoneStore"("storeId");
CREATE INDEX IF NOT EXISTS "DeliveryZonePreferredRider_rider_idx" ON "DeliveryZonePreferredRider"("riderProfileId");
CREATE INDEX IF NOT EXISTS "CustomerAddress_deliveryZone_idx" ON "CustomerAddress"("deliveryZoneId");
CREATE INDEX IF NOT EXISTS "CustomerSubscription_deliveryZone_status_idx" ON "CustomerSubscription"("deliveryZoneId", "status");
CREATE INDEX IF NOT EXISTS "SubscriptionDelivery_deliveryZone_date_idx" ON "SubscriptionDelivery"("deliveryZoneId", "serviceDate", "status");
CREATE INDEX IF NOT EXISTS "Order_deliveryZone_date_idx" ON "Order"("deliveryZoneId", "scheduledDeliveryDate");
CREATE INDEX IF NOT EXISTS "DeliveryRun_zone_date_status_idx" ON "DeliveryRun"("deliveryZoneId", "serviceDate", "status");
CREATE INDEX IF NOT EXISTS "DeliveryRun_cluster_identifier_idx" ON "DeliveryRun"("clusterIdentifier", "serviceDate");
CREATE INDEX IF NOT EXISTS "DeliveryRunStop_zone_status_idx" ON "DeliveryRunStop"("deliveryZoneId", "status");
CREATE INDEX IF NOT EXISTS "RiderProfile_home_zone_status_idx" ON "RiderProfile"("homeZoneId", "status");

DO $$ BEGIN
  ALTER TABLE "DeliveryZoneStore"
    ADD CONSTRAINT "DeliveryZoneStore_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryZoneStore"
    ADD CONSTRAINT "DeliveryZoneStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryZonePreferredRider"
    ADD CONSTRAINT "DeliveryZonePreferredRider_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryZonePreferredRider"
    ADD CONSTRAINT "DeliveryZonePreferredRider_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerAddress"
    ADD CONSTRAINT "CustomerAddress_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CustomerSubscription"
    ADD CONSTRAINT "CustomerSubscription_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "SubscriptionDelivery"
    ADD CONSTRAINT "SubscriptionDelivery_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Order"
    ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "RiderProfile"
    ADD CONSTRAINT "RiderProfile_homeZoneId_fkey" FOREIGN KEY ("homeZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRun"
    ADD CONSTRAINT "DeliveryRun_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRun"
    ADD CONSTRAINT "DeliveryRun_recoveryFromRunId_fkey" FOREIGN KEY ("recoveryFromRunId") REFERENCES "DeliveryRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRunStop"
    ADD CONSTRAINT "DeliveryRunStop_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRunStop"
    ADD CONSTRAINT "DeliveryRunStop_movedFromRunId_fkey" FOREIGN KEY ("movedFromRunId") REFERENCES "DeliveryRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRunAuditEntry"
    ADD CONSTRAINT "DeliveryRunAuditEntry_deliveryRunId_fkey" FOREIGN KEY ("deliveryRunId") REFERENCES "DeliveryRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRunAuditEntry"
    ADD CONSTRAINT "DeliveryRunAuditEntry_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRouteEvent"
    ADD CONSTRAINT "DeliveryRouteEvent_deliveryRunId_fkey" FOREIGN KEY ("deliveryRunId") REFERENCES "DeliveryRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRouteEvent"
    ADD CONSTRAINT "DeliveryRouteEvent_deliveryRunStopId_fkey" FOREIGN KEY ("deliveryRunStopId") REFERENCES "DeliveryRunStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DeliveryRouteEvent"
    ADD CONSTRAINT "DeliveryRouteEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "DeliveryZone"
  ADD CONSTRAINT "DeliveryZone_capacity_check" CHECK (
    "maximumDailySubscriptionCapacity" > 0 AND
    "maximumStopsPerRun" > 0 AND
    "maximumRouteDistanceKm" > 0 AND
    "maximumEstimatedDurationMinutes" > 0 AND
    "maximumParcelCount" > 0 AND
    "cashRiskLimitPaise" >= 0 AND
    "slotEndBufferMinutes" >= 0
  );

ALTER TABLE "RiderProfile"
  ADD CONSTRAINT "RiderProfile_route_capacity_check" CHECK (
    "maximumParcelCapacity" > 0 AND "maximumCashHoldingPaise" >= 0
  );

ALTER TABLE "DeliveryRun"
  ADD CONSTRAINT "DeliveryRun_estimate_check" CHECK (
    "estimatedDistanceKm" >= 0 AND "estimatedDurationMinutes" >= 0 AND "originalStopCount" >= 0
  );
