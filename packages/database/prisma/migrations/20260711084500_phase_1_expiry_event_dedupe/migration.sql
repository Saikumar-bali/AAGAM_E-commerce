-- Prevent duplicate expiry audit/outbox events when multiple workers or the
-- rider workspace reconcile the same timed-out assignment.
CREATE UNIQUE INDEX "DeliveryEvent_one_assignment_expiry"
  ON "DeliveryEvent"("assignmentId", "eventType")
  WHERE "assignmentId" IS NOT NULL
    AND "eventType" = 'ASSIGNMENT_EXPIRED';
