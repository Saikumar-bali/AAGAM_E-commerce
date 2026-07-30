-- Dedicated pre-assignment Rider location freshness. RiderProfile.updatedAt is
-- intentionally not used because unrelated profile edits must not refresh GPS.
CREATE TABLE "RiderAvailabilityLocation" (
  "riderProfileId" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiderAvailabilityLocation_pkey" PRIMARY KEY ("riderProfileId")
);

CREATE INDEX "RiderAvailabilityLocation_capturedAt_idx"
  ON "RiderAvailabilityLocation"("capturedAt");

ALTER TABLE "RiderAvailabilityLocation"
  ADD CONSTRAINT "RiderAvailabilityLocation_riderProfileId_fkey"
  FOREIGN KEY ("riderProfileId") REFERENCES "RiderProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
