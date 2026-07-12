-- Phase 3: durable delivery exception, OTP, COD, return, and inspection operations.

CREATE TYPE "DeliveryOperationType" AS ENUM (
  'OTP_ISSUED',
  'OTP_ATTEMPT_FAILED',
  'OTP_VERIFIED',
  'DELIVERY_FAILURE_RECORDED',
  'RETURN_STARTED',
  'RETURN_CONFIRMED',
  'RETURN_INSPECTION_COMPLETED',
  'COD_COLLECTED',
  'COD_SETTLED'
);

CREATE TYPE "DeliveryOperationStatus" AS ENUM (
  'PENDING',
  'COMPLETED',
  'FAILED',
  'SUPERSEDED'
);

CREATE TABLE "DeliveryOperation" (
  "id" TEXT NOT NULL,
  "deliveryJobId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "type" "DeliveryOperationType" NOT NULL,
  "status" "DeliveryOperationStatus" NOT NULL DEFAULT 'COMPLETED',
  "actorUserId" TEXT,
  "actorRole" "Role",
  "idempotencyKey" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryOperation_idempotencyKey_key"
  ON "DeliveryOperation"("idempotencyKey");

CREATE INDEX "DeliveryOperation_deliveryJobId_type_createdAt_idx"
  ON "DeliveryOperation"("deliveryJobId", "type", "createdAt" DESC);

CREATE INDEX "DeliveryOperation_orderId_createdAt_idx"
  ON "DeliveryOperation"("orderId", "createdAt" DESC);

CREATE INDEX "DeliveryOperation_status_type_createdAt_idx"
  ON "DeliveryOperation"("status", "type", "createdAt" DESC);

ALTER TABLE "DeliveryOperation"
  ADD CONSTRAINT "DeliveryOperation_deliveryJobId_fkey"
  FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryOperation"
  ADD CONSTRAINT "DeliveryOperation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryOperation"
  ADD CONSTRAINT "DeliveryOperation_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
