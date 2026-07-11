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

-- The database trigger is the final guarantee that business state and the outbox
-- are committed atomically, including older service paths that do not yet call
-- OutboxService explicitly.
CREATE OR REPLACE FUNCTION "phase1_order_outbox_trigger"()
RETURNS TRIGGER AS $$
DECLARE
  notification_event "NotificationEventType";
  notification_key TEXT;
  payload JSONB;
BEGIN
  notification_event := NULL;

  IF TG_OP = 'INSERT' THEN
    notification_event := 'ORDER_PLACED';
  ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
    IF NEW."status" = 'CONFIRMED' AND OLD."status" IN ('PENDING', 'PAYMENT_PENDING') THEN
      notification_event := 'STORE_ACCEPTED_ORDER';
    ELSIF NEW."status" = 'PICKING' THEN
      notification_event := 'STORE_STARTED_PICKING';
    ELSIF NEW."status" = 'PACKED' AND OLD."status" IN ('CONFIRMED', 'PICKING') THEN
      notification_event := 'ORDER_PACKED';
    ELSIF NEW."status" = 'CANCELLED' THEN
      notification_event := 'DELIVERY_CANCELLED';
    END IF;
  END IF;

  IF notification_event IS NOT NULL THEN
    notification_key := CONCAT('order:', NEW."id", ':', notification_event::TEXT);
    payload := jsonb_build_object(
      'orderId', NEW."id",
      'fromStatus', CASE WHEN TG_OP = 'UPDATE' THEN OLD."status"::TEXT ELSE NULL END,
      'toStatus', NEW."status"::TEXT
    );

    INSERT INTO "OutboxEvent" (
      "id", "eventType", "aggregateType", "aggregateId", "payload",
      "idempotencyKey", "status", "attempts", "availableAt", "createdAt", "updatedAt"
    ) VALUES (
      CONCAT('ob_', md5(random()::TEXT || clock_timestamp()::TEXT || NEW."id")),
      notification_event,
      'ORDER',
      NEW."id",
      payload,
      notification_key,
      'PENDING',
      0,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ) ON CONFLICT ("idempotencyKey") DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_phase1_notification_outbox"
AFTER INSERT OR UPDATE OF "status" ON "Order"
FOR EACH ROW EXECUTE FUNCTION "phase1_order_outbox_trigger"();

CREATE OR REPLACE FUNCTION "phase1_delivery_event_outbox_trigger"()
RETURNS TRIGGER AS $$
DECLARE
  notification_event "NotificationEventType";
  notification_key TEXT;
  payload JSONB;
BEGIN
  notification_event := NULL;

  IF NEW."eventType" = 'JOB_CREATED' THEN
    notification_event := 'DISPATCH_JOB_CREATED';
  ELSIF NEW."eventType" = 'ASSIGNMENT_OFFERED' THEN
    notification_event := 'ASSIGNMENT_OFFERED';
  ELSIF NEW."eventType" = 'ASSIGNMENT_ACCEPTED' THEN
    notification_event := 'ASSIGNMENT_ACCEPTED';
  ELSIF NEW."eventType" = 'ASSIGNMENT_REJECTED' THEN
    notification_event := 'ASSIGNMENT_REJECTED';
  ELSIF NEW."eventType" = 'ASSIGNMENT_EXPIRED' THEN
    notification_event := 'ASSIGNMENT_EXPIRED';
  ELSIF NEW."eventType" = 'JOB_STATUS_CHANGED' THEN
    IF NEW."toStatus" = 'RIDER_EN_ROUTE_TO_STORE' THEN
      notification_event := 'RIDER_EN_ROUTE_TO_STORE';
    ELSIF NEW."toStatus" = 'RIDER_AT_STORE' THEN
      notification_event := 'RIDER_AT_STORE';
    ELSIF NEW."toStatus" = 'PICKUP_VERIFIED' THEN
      notification_event := 'PICKUP_VERIFIED';
    ELSIF NEW."toStatus" = 'OUT_FOR_DELIVERY' THEN
      notification_event := 'OUT_FOR_DELIVERY';
    ELSIF NEW."toStatus" = 'RIDER_AT_CUSTOMER' THEN
      notification_event := 'RIDER_AT_CUSTOMER';
    ELSIF NEW."toStatus" = 'DELIVERED' THEN
      notification_event := 'DELIVERY_COMPLETED';
    ELSIF NEW."toStatus" = 'DELIVERY_FAILED' THEN
      notification_event := 'DELIVERY_FAILED';
    ELSIF NEW."toStatus" = 'CANCELLED' THEN
      notification_event := 'DELIVERY_CANCELLED';
    END IF;
  END IF;

  IF notification_event IS NOT NULL THEN
    notification_key := CONCAT('delivery-event:', NEW."id", ':', notification_event::TEXT);
    payload := jsonb_build_object(
      'deliveryJobId', NEW."deliveryJobId",
      'assignmentId', NEW."assignmentId",
      'actorUserId', NEW."actorUserId",
      'actorRole', NEW."actorRole",
      'fromStatus', NEW."fromStatus",
      'toStatus', NEW."toStatus",
      'metadata', COALESCE(NEW."metadata", '{}'::jsonb)
    ) || COALESCE(NEW."metadata", '{}'::jsonb);

    INSERT INTO "OutboxEvent" (
      "id", "eventType", "aggregateType", "aggregateId", "payload",
      "idempotencyKey", "status", "attempts", "availableAt", "createdAt", "updatedAt"
    ) VALUES (
      CONCAT('ob_', md5(random()::TEXT || clock_timestamp()::TEXT || NEW."id")),
      notification_event,
      'DELIVERY_JOB',
      NEW."deliveryJobId",
      payload,
      notification_key,
      'PENDING',
      0,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ) ON CONFLICT ("idempotencyKey") DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DeliveryEvent_phase1_notification_outbox"
AFTER INSERT ON "DeliveryEvent"
FOR EACH ROW EXECUTE FUNCTION "phase1_delivery_event_outbox_trigger"();
