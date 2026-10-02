-- Backfill CustomerSubscription.source for subscribers added through the
-- manual/offline subscribe flows, which historically left it NULL. The milk
-- grid read `source` alone, so those walk-in offline customers rendered as
-- "ON" (online) while the Subscribers tab -- which also inspects the
-- customer's acquisitionSource and synthetic offline.* email -- called them
-- offline.
--
-- Idempotent: only NULL rows whose customer carries offline evidence are
-- touched, so re-running the migration is a no-op.
UPDATE "CustomerSubscription" AS cs
SET "source" = 'manual'
WHERE cs."source" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "User" AS u
    WHERE u."id" = cs."customerId"
      AND (
        u."acquisitionSource" IN ('OFFLINE', 'OFFLINE_STORE')
        OR u."email" LIKE 'offline.%'
        OR u."phone" LIKE 'offline\_%'
      )
  );
