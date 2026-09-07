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

-- One delivery row per service date. The slot distinguishes morning/evening/
-- both deliveries on the same date, which the old BOTH handling silently lost
-- to the (subscriptionId, serviceDate) unique constraint.
ALTER TABLE "SubscriptionDelivery" ADD COLUMN "deliverySlot" TEXT NOT NULL DEFAULT 'AM';
ALTER TABLE "SubscriptionDelivery" ADD CONSTRAINT "SubscriptionDelivery_deliverySlot_check"
  CHECK ("deliverySlot" IN ('AM', 'PM', 'BOTH'));

-- Store-self-delivered orders record who delivered and the cash taken on the
-- doorstep so per-day collection tracking works without a rider COD ledger.
ALTER TABLE "SubscriptionDelivery" ADD COLUMN "cashCollectedPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SubscriptionDelivery" ADD COLUMN "cashCollectedAt" TIMESTAMP(3);
ALTER TABLE "SubscriptionDelivery" ADD COLUMN "deliveredByStoreUserId" TEXT;

ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_source_check"
  CHECK ("source" IN ('PLAN', 'CUSTOM_OFFLINE') OR "source" IS NULL);

CREATE INDEX "SubscriptionDelivery_deliverySlot_idx" ON "SubscriptionDelivery"("deliverySlot");
CREATE INDEX "User_acquisitionSource_idx" ON "User"("acquisitionSource");
CREATE INDEX "User_offlineStoreId_idx" ON "User"("offlineStoreId");
