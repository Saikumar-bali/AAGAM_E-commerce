-- Persist the exact role each durable notification was routed to.
-- Historical rows remain NULL and are intentionally not guessed/backfilled.
ALTER TABLE "NotificationRecipient" ADD COLUMN "recipientRole" "Role";

DROP INDEX IF EXISTS "NotificationRecipient_notificationId_userId_key";

CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_recipientRole_key"
ON "NotificationRecipient"("notificationId", "userId", "recipientRole");

CREATE INDEX "NotificationRecipient_userId_recipientRole_status_createdAt_idx"
ON "NotificationRecipient"("userId", "recipientRole", "status", "createdAt");
