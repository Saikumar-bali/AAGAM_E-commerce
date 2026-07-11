-- Phase 1: durable notification inbox, multi-device subscriptions, and transactional outbox.

CREATE TYPE "PushProvider" AS ENUM ('FCM_WEB', 'FCM_MOBILE', 'WEB_PUSH');
CREATE TYPE "NotificationEventType" AS ENUM (
  'ORDER_PLACED',
  'STORE_ACCEPTED_ORDER',
  'STORE_STARTED_PICKING',
  'ORDER_PACKED',
  'DISPATCH_JOB_CREATED',
  'ASSIGNMENT_OFFERED',
  'ASSIGNMENT_ACCEPTED',
  'ASSIGNMENT_REJECTED',
  'ASSIGNMENT_EXPIRED',
  'RIDER_EN_ROUTE_TO_STORE',
  'RIDER_AT_STORE',
  'PICKUP_VERIFIED',
  'OUT_FOR_DELIVERY',
  'RIDER_AT_CUSTOMER',
  'DELIVERY_COMPLETED',
  'DELIVERY_FAILED',
  'DELIVERY_CANCELLED',
  'ADMIN_BROADCAST'
);
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
CREATE TYPE "NotificationRecipientStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'OPENED', 'READ');
CREATE TYPE "NotificationAttemptStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "PushProvider" NOT NULL DEFAULT 'FCM_WEB',
  "token" TEXT,
  "endpoint" TEXT,
  "p256dh" TEXT,
  "auth" TEXT,
  "userAgent" TEXT,
  "deviceName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL DEFAULT '*',
  "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "eventType" "NotificationEventType" NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "eventType" "NotificationEventType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "data" JSONB,
  "deepLink" TEXT,
  "orderId" TEXT,
  "deliveryJobId" TEXT,
  "outboxEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationRecipient" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "NotificationRecipientStatus" NOT NULL DEFAULT 'QUEUED',
  "dedupeKey" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "openedAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "status" "NotificationAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "provider" "PushProvider" NOT NULL,
  "responseId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "nextRetryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_token_key" ON "PushSubscription"("token");
CREATE UNIQUE INDEX "PushSubscription_provider_endpoint_key" ON "PushSubscription"("provider", "endpoint");
CREATE INDEX "PushSubscription_userId_isActive_idx" ON "PushSubscription"("userId", "isActive");
CREATE INDEX "PushSubscription_provider_isActive_idx" ON "PushSubscription"("provider", "isActive");

CREATE UNIQUE INDEX "NotificationPreference_userId_eventType_key" ON "NotificationPreference"("userId", "eventType");

CREATE UNIQUE INDEX "OutboxEvent_idempotencyKey_key" ON "OutboxEvent"("idempotencyKey");
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

CREATE UNIQUE INDEX "Notification_outboxEventId_key" ON "Notification"("outboxEventId");
CREATE INDEX "Notification_eventType_createdAt_idx" ON "Notification"("eventType", "createdAt");
CREATE INDEX "Notification_orderId_createdAt_idx" ON "Notification"("orderId", "createdAt");
CREATE INDEX "Notification_deliveryJobId_createdAt_idx" ON "Notification"("deliveryJobId", "createdAt");

CREATE UNIQUE INDEX "NotificationRecipient_dedupeKey_key" ON "NotificationRecipient"("dedupeKey");
CREATE UNIQUE INDEX "NotificationRecipient_notificationId_userId_key" ON "NotificationRecipient"("notificationId", "userId");
CREATE INDEX "NotificationRecipient_userId_status_createdAt_idx" ON "NotificationRecipient"("userId", "status", "createdAt");

CREATE UNIQUE INDEX "NotificationDeliveryAttempt_recipientId_subscriptionId_attemptNumber_key"
  ON "NotificationDeliveryAttempt"("recipientId", "subscriptionId", "attemptNumber");
CREATE INDEX "NotificationDeliveryAttempt_recipientId_createdAt_idx"
  ON "NotificationDeliveryAttempt"("recipientId", "createdAt");
CREATE INDEX "NotificationDeliveryAttempt_status_nextRetryAt_idx"
  ON "NotificationDeliveryAttempt"("status", "nextRetryAt");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_deliveryJobId_fkey"
  FOREIGN KEY ("deliveryJobId") REFERENCES "DeliveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_outboxEventId_fkey"
  FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NotificationRecipient"
  ADD CONSTRAINT "NotificationRecipient_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationRecipient"
  ADD CONSTRAINT "NotificationRecipient_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDeliveryAttempt"
  ADD CONSTRAINT "NotificationDeliveryAttempt_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "NotificationRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationDeliveryAttempt"
  ADD CONSTRAINT "NotificationDeliveryAttempt_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
