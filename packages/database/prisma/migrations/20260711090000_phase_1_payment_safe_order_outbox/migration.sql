-- Do not notify store/admin about an online order before payment capture.
-- COD and non-payment-pending orders still enqueue ORDER_PLACED immediately.
-- Online orders enqueue ORDER_PLACED atomically when PAYMENT_PENDING becomes
-- CONFIRMED in PaymentsService.captureSimulatedPayment.
CREATE OR REPLACE FUNCTION "phase1_order_outbox_trigger"()
RETURNS TRIGGER AS $$
DECLARE
  notification_event "NotificationEventType";
  notification_key TEXT;
  payload JSONB;
BEGIN
  notification_event := NULL;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" NOT IN ('PAYMENT_PENDING', 'PAYMENT_FAILED') THEN
      notification_event := 'ORDER_PLACED';
    END IF;
  ELSIF OLD."status" IS DISTINCT FROM NEW."status" THEN
    IF OLD."status" = 'PAYMENT_PENDING' AND NEW."status" = 'CONFIRMED' THEN
      notification_event := 'ORDER_PLACED';
    ELSIF NEW."status" = 'CONFIRMED' THEN
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
