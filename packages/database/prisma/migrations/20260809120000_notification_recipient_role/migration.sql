-- Persist the exact role an event was routed to so multi-role users receive
-- isolated Customer, Rider, Store Owner, and Admin inboxes. Historical rows
-- remain NULL and continue through the scoped legacy-history fallback.
ALTER TABLE "NotificationRecipient" ADD COLUMN "recipientRole" "Role";

DROP INDEX IF EXISTS "NotificationRecipient_notificationId_userId_key";

CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_recipientRole_key"
ON "NotificationRecipient"("notificationId", "userId", "recipientRole");

CREATE INDEX "NotificationRecipient_userId_recipientRole_status_createdAt_idx"
ON "NotificationRecipient"("userId", "recipientRole", "status", "createdAt");
