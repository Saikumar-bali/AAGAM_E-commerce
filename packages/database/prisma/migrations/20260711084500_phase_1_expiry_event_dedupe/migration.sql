-- Prevent duplicate expiry audit/outbox events when multiple workers or the
-- rider workspace reconcile the same timed-out assignment.
--
-- Existing databases may already contain duplicate expiry rows from earlier
-- manual/test reconciliation. Keep the oldest audit event and remove only the
-- duplicate rows before installing the final database guarantee.
WITH ranked_expiry_events AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "assignmentId", "eventType"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_number
  FROM "DeliveryEvent"
  WHERE "assignmentId" IS NOT NULL
    AND "eventType" = 'ASSIGNMENT_EXPIRED'
)
DELETE FROM "DeliveryEvent" AS event
USING ranked_expiry_events AS ranked
WHERE event."id" = ranked."id"
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX "DeliveryEvent_one_assignment_expiry"
  ON "DeliveryEvent"("assignmentId", "eventType")
  WHERE "assignmentId" IS NOT NULL
    AND "eventType" = 'ASSIGNMENT_EXPIRED';
