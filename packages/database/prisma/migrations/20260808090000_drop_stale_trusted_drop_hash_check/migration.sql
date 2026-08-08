-- Trusted Drop credentials are server-managed (one-time signed QR issued per delivery).
-- The customer subscription no longer stores a customer-chosen hash, so the legacy
-- CHECK constraint that required dropPointTokenHash for TRUSTED_DROP is stale and
-- blocks subscription creation. Drop it; the server-managed challenge flow enforces
-- the proof requirement instead.
ALTER TABLE "CustomerSubscription" DROP CONSTRAINT IF EXISTS "CustomerSubscription_trusted_drop_check";
