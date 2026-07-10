-- Phase 0: canonical delivery domain and dispatch assignment foundation.

CREATE TYPE "DeliveryJobStatus" AS ENUM (
  'WAITING_FOR_DISPATCH',
  'RIDER_ASSIGNED',
  'RIDER_EN_ROUTE_TO_STORE',
  'RIDER_AT_STORE',
  'PICKUP_VERIFIED',
  'OUT_FOR_DELIVERY',
  'RIDER_AT_CUSTOMER',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RETURNING_TO_STORE',
  'RETURNED_TO_STORE',
  'CANCELLED'
);

CREATE TYPE "DispatchAssignmentStatus" AS ENUM (
  'CREATED',
  'OFFERED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'REASSIGNED'
);

CREATE TYPE "DeliveryEventType" AS ENUM (
  'JOB_CREATED',
  'JOB_STATUS_CHANGED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_OFFERED',
  'ASSIGNMENT_ACCEPTED',
  'ASSIGNMENT_REJECTED',
  'ASSIGNMENT_EXPIRED',
  'ASSIGNMENT_CANCELLED',
  'ASSIGNMENT_REASSIGNED',
  'LEGACY_ADAPTER_USED'
);

CREATE TABLE "DeliveryJob" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "DeliveryJobStatus" NOT NULL DEFAULT 'WAITING_FOR_DISPATCH',
  "currentRiderId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DispatchAssignment" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "riderProfileId" TEXT NOT NULL,
  "status" "DispatchAssignmentStatus" NOT NULL DEFAULT 'CREATED',
  "offeredAt" TIMESTAMP(3),
  "respondedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DispatchAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryEvent" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "assignmentId" TEXT,
  "eventType" "DeliveryEventType" NOT NULL,
  "fromStatus" "DeliveryJobStatus",
  "toStatus" "DeliveryJobStatus",
  "actorUserId" TEXT,
  "actorRole" "Role",
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryJob_orderId_key" ON "DeliveryJob"("orderId");
CREATE INDEX "DeliveryJob_status_createdAt_idx" ON "DeliveryJob"("status", "createdAt");
CREATE INDEX "DeliveryJob_currentRiderId_status_idx" ON "DeliveryJob"("currentRiderId", "status");
CREATE INDEX "DispatchAssignment_deliveryJobId_status_idx" ON "DispatchAssignment"("deliveryJobId", "status");
CREATE INDEX "DispatchAssignment_riderProfileId_status_idx" ON "DispatchAssignment"("riderProfileId", "status");
CREATE INDEX "DispatchAssignment_expiresAt_status_idx" ON "DispatchAssignment"("expiresAt", "status");
CREATE INDEX "DeliveryEvent_deliveryJobId_createdAt_idx" ON "DeliveryEvent"("deliveryJobId", "createdAt");
CREATE INDEX "DeliveryEvent_assignmentId_createdAt_idx" ON "DeliveryEvent"("assignmentId", "createdAt");
CREATE INDEX "DeliveryEvent_eventType_createdAt_idx" ON "DeliveryEvent"("eventType", "createdAt");

-- PostgreSQL partial indexes provide the concurrency guarantees Prisma cannot
-- express in schema.prisma: one open offer per delivery job and one active job
-- per rider.
CREATE UNIQUE INDEX "DispatchAssignment_one_open_offer_per_job"
  ON "DispatchAssignment"("deliveryJobId")
  WHERE "status" IN ('CREATED', 'OFFERED', 'ACCEPTED');

CREATE UNIQUE INDEX "DeliveryJob_one_active_job_per_rider"
  ON "DeliveryJob"("currentRiderId")
  WHERE "currentRiderId" IS NOT NULL
    AND "status" NOT IN ('DELIVERED', 'RETURNED_TO_STORE', 'CANCELLED');

ALTER TABLE "DeliveryJob"
  ADD CONSTRAINT "DeliveryJob_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryJob"
  ADD CONSTRAINT "DeliveryJob_currentRiderId_fkey"
  FOREIGN KEY ("currentRiderId") REFERENCES "RiderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DispatchAssignment"
  ADD CONSTRAINT "DispatchAssignment_deliveryJobId_fkey"
  FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DispatchAssignment"
  ADD CONSTRAINT "DispatchAssignment_riderProfileId_fkey"
  FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryEvent"
  ADD CONSTRAINT "DeliveryEvent_deliveryJobId_fkey"
  FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryEvent"
  ADD CONSTRAINT "DeliveryEvent_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "DispatchAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
