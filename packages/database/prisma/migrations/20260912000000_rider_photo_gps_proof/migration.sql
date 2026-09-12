-- Rider photo+GPS proof mode for offline subscription stop completion.
ALTER TYPE "SubscriptionProofMode" ADD VALUE 'RIDER_PHOTO_GPS';

-- Photo + GPS proof captured by a rider when completing an offline (store-delivery)
-- subscription stop. These stops are completed without an OTP/Trusted-Drop challenge.
CREATE TABLE "RiderPhotoProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryRunStopId" TEXT NOT NULL UNIQUE,
    "deliveryJobId" TEXT NOT NULL UNIQUE,
    "subscriptionDeliveryId" TEXT NOT NULL UNIQUE,
    "riderProfileId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "accuracyMetres" DOUBLE PRECISION,
    "cashCollectedPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiderPhotoProof_deliveryRunStopId_fkey" FOREIGN KEY ("deliveryRunStopId") REFERENCES "DeliveryRunStop"("id") ON DELETE CASCADE,
    CONSTRAINT "RiderPhotoProof_deliveryJobId_fkey" FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE,
    CONSTRAINT "RiderPhotoProof_subscriptionDeliveryId_fkey" FOREIGN KEY ("subscriptionDeliveryId") REFERENCES "SubscriptionDelivery"("id") ON DELETE CASCADE,
    CONSTRAINT "RiderPhotoProof_riderProfileId_fkey" FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id") ON DELETE RESTRICT
);

CREATE INDEX "RiderPhotoProof_riderProfileId_createdAt_idx" ON "RiderPhotoProof"("riderProfileId", "createdAt");