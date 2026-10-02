-- Backfill CustomerSubscription.source for subscribers added through the
-- manual/offline subscribe flows, which historically left it NULL. The milk
-- grid read `source` alone, so those walk-in offline customers rendered as
-- "ON" (online) while the Subscribers tab -- which also inspects the
-- customer's acquisitionSource and synthetic offline.* email -- called them
-- offline.
--
-- Subscription-level evidence also qualifies: the manual subscribe path
-- (createManualSubscription) accepts any registered customerId and stamps
-- source = 'manual' on new rows, so historic manual-flow subscriptions for
-- registered customers (no offline customer markers) must be backfilled too,
-- or they stay classified online and disagree with the runtime classifier.
--
-- Idempotent: only NULL rows with offline customer or manual audit evidence
-- are touched, so re-running the migration is a no-op.
UPDATE "CustomerSubscription" AS cs
SET "source" = 'manual'
WHERE cs."source" IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM "User" AS u
      WHERE u."id" = cs."customerId"
        AND (
          u."acquisitionSource" IN ('OFFLINE', 'OFFLINE_STORE')
          OR u."email" LIKE 'offline.%'
          OR u."phone" LIKE 'offline\_%'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM "SubscriptionAuditEntry" AS a
      WHERE a."subscriptionId" = cs."id"
        AND a."action" = 'ADMIN_MANUAL_SUBSCRIPTION_CREATED'
    )
  );
