-- Saved-address coordinates are already required by checkout routing and pricing.
-- Keep those coordinates intact and store their trust/provenance separately so
-- manual/geocoded addresses are never mistaken for customer-captured GPS.
CREATE TABLE "CustomerAddressLocationEvidence" (
  "customerAddressId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "accuracyMetres" DOUBLE PRECISION,
  "capturedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerAddressLocationEvidence_pkey" PRIMARY KEY ("customerAddressId"),
  CONSTRAINT "CustomerAddressLocationEvidence_source_check"
    CHECK ("source" IN ('LIVE_GPS', 'MAP_PIN', 'GEOCODED', 'LEGACY_UNKNOWN')),
  CONSTRAINT "CustomerAddressLocationEvidence_accuracy_check"
    CHECK ("accuracyMetres" IS NULL OR "accuracyMetres" > 0),
  CONSTRAINT "CustomerAddressLocationEvidence_address_fkey"
    FOREIGN KEY ("customerAddressId") REFERENCES "CustomerAddress"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Existing coordinates have no trustworthy provenance. Never upgrade them to
-- LIVE_GPS merely because latitude/longitude happen to be present.
INSERT INTO "CustomerAddressLocationEvidence" (
  "customerAddressId", "source", "accuracyMetres", "capturedAt"
)
SELECT "id", 'LEGACY_UNKNOWN', NULL, NULL
FROM "CustomerAddress"
ON CONFLICT ("customerAddressId") DO NOTHING;

-- Freeze the same conservative source into pre-existing order/subscription
-- snapshots. New snapshots are enriched by application code/trigger below.
UPDATE "Order"
SET "addressSnapshot" = COALESCE("addressSnapshot", '{}'::jsonb)
  || jsonb_build_object(
    'locationSource', 'LEGACY_UNKNOWN',
    'locationAccuracyMetres', NULL,
    'locationCapturedAt', NULL
  )
WHERE "addressSnapshot" IS NULL
   OR NOT ("addressSnapshot" ? 'locationSource');

UPDATE "CustomerSubscription"
SET "addressSnapshot" = COALESCE("addressSnapshot", '{}'::jsonb)
  || jsonb_build_object(
    'locationSource', 'LEGACY_UNKNOWN',
    'locationAccuracyMetres', NULL,
    'locationCapturedAt', NULL
  )
WHERE "addressSnapshot" IS NULL
   OR NOT ("addressSnapshot" ? 'locationSource');

-- CustomerSubscription is created in a large transactional domain service.
-- Freeze provenance at the database boundary as a final invariant so every
-- future subscription snapshot remains immutable even if the saved address is
-- later edited. If application code already supplied a source, preserve it.
CREATE OR REPLACE FUNCTION "freezeCustomerSubscriptionAddressLocationEvidence"()
RETURNS TRIGGER AS $$
DECLARE
  evidence_source TEXT;
  evidence_accuracy DOUBLE PRECISION;
  evidence_captured TIMESTAMP(3);
BEGIN
  IF NEW."addressSnapshot" IS NULL OR NEW."addressSnapshot" ? 'locationSource' THEN
    RETURN NEW;
  END IF;

  SELECT "source", "accuracyMetres", "capturedAt"
    INTO evidence_source, evidence_accuracy, evidence_captured
  FROM "CustomerAddressLocationEvidence"
  WHERE "customerAddressId" = NEW."addressId";

  IF evidence_source IS NULL THEN
    evidence_source := 'LEGACY_UNKNOWN';
  END IF;

  NEW."addressSnapshot" := NEW."addressSnapshot" || jsonb_build_object(
    'locationSource', evidence_source,
    'locationAccuracyMetres', evidence_accuracy,
    'locationCapturedAt', CASE
      WHEN evidence_captured IS NULL THEN NULL
      ELSE to_char(evidence_captured AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CustomerSubscription_freeze_address_location_evidence"
BEFORE INSERT OR UPDATE OF "addressId", "addressSnapshot"
ON "CustomerSubscription"
FOR EACH ROW
EXECUTE FUNCTION "freezeCustomerSubscriptionAddressLocationEvidence"();
