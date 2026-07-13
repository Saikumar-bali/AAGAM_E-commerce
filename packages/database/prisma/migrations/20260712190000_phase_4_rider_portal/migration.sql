CREATE TYPE "RiderApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "RiderShiftStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "RiderBreakStatus" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "RiderDocumentType" AS ENUM ('DRIVING_LICENSE', 'IDENTITY', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE', 'OTHER');
CREATE TYPE "RiderEarningType" AS ENUM ('BASE_DELIVERY_FEE', 'DISTANCE_INCENTIVE', 'BONUS', 'PENALTY');
CREATE TYPE "RiderEarningStatus" AS ENUM ('PENDING', 'PAID');
CREATE TYPE "RiderPickupStatus" AS ENUM ('PENDING', 'VERIFIED', 'PROBLEM_REPORTED');
CREATE TYPE "RiderSupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

ALTER TABLE "RiderProfile"
  ADD COLUMN "vehicleType" TEXT,
  ADD COLUMN "vehicleNumber" TEXT,
  ADD COLUMN "emergencyContactName" TEXT,
  ADD COLUMN "emergencyContactPhone" TEXT,
  ADD COLUMN "bankAccountCiphertext" TEXT,
  ADD COLUMN "bankIfscCiphertext" TEXT,
  ADD COLUMN "bankAccountLast4" TEXT,
  ADD COLUMN "bankStatus" "RiderApprovalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "approvalStatus" "RiderApprovalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "bankReviewedByUserId" TEXT,
  ADD COLUMN "bankReviewedAt" TIMESTAMP(3),
  ADD COLUMN "approvalReviewedByUserId" TEXT,
  ADD COLUMN "approvalReviewedAt" TIMESTAMP(3);

CREATE TABLE "RiderAvailabilitySchedule" (
  "id" TEXT NOT NULL, "riderProfileId" TEXT NOT NULL, "dayOfWeek" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL, "endMinute" INTEGER NOT NULL, "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderAvailabilitySchedule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RiderAvailabilitySchedule_riderProfileId_dayOfWeek_startMin_key" ON "RiderAvailabilitySchedule"("riderProfileId", "dayOfWeek", "startMinute", "endMinute");
CREATE INDEX "RiderAvailabilitySchedule_riderProfileId_dayOfWeek_idx" ON "RiderAvailabilitySchedule"("riderProfileId", "dayOfWeek");
ALTER TABLE "RiderAvailabilitySchedule" ADD CONSTRAINT "RiderAvailabilitySchedule_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RiderShift" (
  "id" TEXT NOT NULL, "riderProfileId" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "RiderShiftStatus" NOT NULL DEFAULT 'SCHEDULED', "actualStartedAt" TIMESTAMP(3), "actualEndedAt" TIMESTAMP(3),
  "note" TEXT, "createdByUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderShift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiderShift_riderProfileId_startsAt_idx" ON "RiderShift"("riderProfileId", "startsAt");
CREATE INDEX "RiderShift_status_startsAt_idx" ON "RiderShift"("status", "startsAt");
ALTER TABLE "RiderShift" ADD CONSTRAINT "RiderShift_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RiderBreak" (
  "id" TEXT NOT NULL, "riderProfileId" TEXT NOT NULL, "status" "RiderBreakStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3),
  CONSTRAINT "RiderBreak_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiderBreak_riderProfileId_status_startedAt_idx" ON "RiderBreak"("riderProfileId", "status", "startedAt");
ALTER TABLE "RiderBreak" ADD CONSTRAINT "RiderBreak_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RiderDocument" (
  "id" TEXT NOT NULL, "riderProfileId" TEXT NOT NULL, "type" "RiderDocumentType" NOT NULL, "documentNumberLast4" TEXT,
  "storageKey" TEXT NOT NULL, "expiresAt" TIMESTAMP(3), "status" "RiderApprovalStatus" NOT NULL DEFAULT 'PENDING', "reviewNote" TEXT, "reviewedByUserId" TEXT, "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiderDocument_riderProfileId_type_status_idx" ON "RiderDocument"("riderProfileId", "type", "status");
CREATE INDEX "RiderDocument_expiresAt_idx" ON "RiderDocument"("expiresAt");
ALTER TABLE "RiderDocument" ADD CONSTRAINT "RiderDocument_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RiderEarning" (
  "id" TEXT NOT NULL, "riderProfileId" TEXT NOT NULL, "deliveryJobId" TEXT, "type" "RiderEarningType" NOT NULL,
  "amountPaise" INTEGER NOT NULL, "status" "RiderEarningStatus" NOT NULL DEFAULT 'PENDING', "reference" TEXT, "createdByUserId" TEXT, "paidByUserId" TEXT,
  "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "paidAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiderEarning_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiderEarning_riderProfileId_earnedAt_idx" ON "RiderEarning"("riderProfileId", "earnedAt");
CREATE INDEX "RiderEarning_riderProfileId_status_idx" ON "RiderEarning"("riderProfileId", "status");
CREATE UNIQUE INDEX "RiderEarning_deliveryJobId_type_reference_key" ON "RiderEarning"("deliveryJobId", "type", "reference");
ALTER TABLE "RiderEarning" ADD CONSTRAINT "RiderEarning_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RiderPickupTask" (
  "id" TEXT NOT NULL, "riderProfileId" TEXT NOT NULL, "deliveryJobId" TEXT NOT NULL, "status" "RiderPickupStatus" NOT NULL DEFAULT 'PENDING',
  "parcelCode" TEXT, "checklist" JSONB NOT NULL, "problemType" TEXT, "problemNote" TEXT, "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderPickupTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RiderPickupTask_deliveryJobId_key" ON "RiderPickupTask"("deliveryJobId");
CREATE INDEX "RiderPickupTask_riderProfileId_status_idx" ON "RiderPickupTask"("riderProfileId", "status");
ALTER TABLE "RiderPickupTask" ADD CONSTRAINT "RiderPickupTask_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RiderSupportTicket" (
  "id" TEXT NOT NULL, "riderProfileId" TEXT NOT NULL, "deliveryJobId" TEXT, "category" TEXT NOT NULL, "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL, "evidenceKeys" JSONB, "status" "RiderSupportStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderSupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiderSupportTicket_riderProfileId_status_createdAt_idx" ON "RiderSupportTicket"("riderProfileId", "status", "createdAt");
CREATE INDEX "RiderSupportTicket_deliveryJobId_idx" ON "RiderSupportTicket"("deliveryJobId");
ALTER TABLE "RiderSupportTicket" ADD CONSTRAINT "RiderSupportTicket_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RiderSupportMessage" (
  "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "senderUserId" TEXT NOT NULL, "senderRole" "Role" NOT NULL,
  "body" TEXT NOT NULL, "evidenceKeys" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiderSupportMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RiderSupportMessage_ticketId_createdAt_idx" ON "RiderSupportMessage"("ticketId", "createdAt");
ALTER TABLE "RiderSupportMessage" ADD CONSTRAINT "RiderSupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "RiderSupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
