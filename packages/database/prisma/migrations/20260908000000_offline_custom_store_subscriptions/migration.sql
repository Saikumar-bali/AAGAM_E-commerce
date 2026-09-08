-- Offline customers are store-acquired (no app signup) and managed by the store
-- portal. acquisitionSource makes that segment first-class and queryable;
-- offlineStoreId pins each offline customer to the store that owns the
-- relationship, which drives store-portal tenancy.
ALTER TABLE "User" ADD COLUMN "acquisitionSource" TEXT;
ALTER TABLE "User" ADD COLUMN "offlineStoreId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_offlineStore_fkey"
  FOREIGN KEY ("offlineStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custom offline subscriptions are store-built schedules, not catalog plans.
ALTER TABLE "CustomerSubscription" ADD COLUMN "source" TEXT;
ALTER TABLE "CustomerSubscription" ADD COLUMN "isCustom" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerSubscription" ADD COLUMN "storeDelivery" BOOLEAN NOT NULL DEFAULT false;

-- One delivery row per service date per slot. The slot distinguishes morning/evening/
-- both deliveries on the same date. Drop the old single-date unique constraint
-- and replace it with a slot-aware one.
ALTER TABLE "SubscriptionDelivery" ADD COLUMN "deliverySlot" TEXT NOT NULL DEFAULT 'AM';
ALTER TABLE "SubscriptionDelivery" ADD CONSTRAINT "SubscriptionDelivery_deliverySlot_check"
  CHECK ("deliverySlot" IN ('AM', 'PM', 'BOTH'));
ALTER TABLE "SubscriptionDelivery" ADD COLUMN "cashCollectedPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionDelivery" ADD COLUMN "cashCollectedAt" TIMESTAMP(3);
ALTER TABLE "SubscriptionDelivery" ADD COLUMN "deliveredByStoreUserId" TEXT;

-- Replace the old (subscriptionId, serviceDate) unique constraint with one
-- that includes deliverySlot, so AM and PM rows on the same date are allowed.
ALTER TABLE "SubscriptionDelivery" DROP CONSTRAINT IF EXISTS "SubscriptionDelivery_subscriptionId_serviceDate_key";
CREATE UNIQUE INDEX "SubscriptionDelivery_subscriptionId_serviceDate_deliverySlot_key"
  ON "SubscriptionDelivery"("subscriptionId", "serviceDate", "deliverySlot");

-- Add new enum values for store delivery
ALTER TYPE "SubscriptionDeliveryStatus" ADD VALUE 'STORE_DELIVERING';
ALTER TYPE "DeliveryJobStatus" ADD VALUE 'STORE_DELIVERING';
ALTER TYPE "OrderSource" ADD VALUE 'STORE_DELIVERY';

-- Store self-delivery proof table for verifying customer handoff
CREATE TABLE "StoreDeliveryProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryJobId" TEXT NOT NULL UNIQUE,
    "subscriptionDeliveryId" TEXT UNIQUE,
    "storeUserId" TEXT NOT NULL,
    "customerNameVerified" BOOLEAN NOT NULL DEFAULT false,
    "customerPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedCustomerName" TEXT,
    "verifiedCustomerPhone" TEXT,
    "handedOffAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreDeliveryProof_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE,
    CONSTRAINT "StoreDeliveryProof_subscriptionDeliveryId_fkey" FOREIGN KEY ("subscriptionDeliveryId") REFERENCES "SubscriptionDelivery"("id") ON DELETE SET NULL,
    CONSTRAINT "StoreDeliveryProof_storeUserId_fkey" FOREIGN KEY ("storeUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);

ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_source_check"
  CHECK ("source" IN ('manual', 'custom_manual') OR "source" IS NULL);

CREATE INDEX "SubscriptionDelivery_deliverySlot_idx" ON "SubscriptionDelivery"("deliverySlot");
CREATE INDEX "User_acquisitionSource_idx" ON "User"("acquisitionSource");
CREATE INDEX "User_offlineStoreId_idx" ON "User"("offlineStoreId");
CREATE INDEX "StoreDeliveryProof_storeUserId_idx" ON "StoreDeliveryProof"("storeUserId", "handedOffAt");
CREATE INDEX "StoreDeliveryProof_deliveryJobId_idx" ON "StoreDeliveryProof"("deliveryJobId");
