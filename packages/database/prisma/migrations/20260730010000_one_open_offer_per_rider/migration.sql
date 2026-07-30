-- Prevent the same Rider from receiving multiple simultaneous delivery offers.
-- Keep the oldest live offer deterministic and cancel later duplicates before
-- adding the partial unique index.
WITH ranked_offers AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "riderProfileId"
      ORDER BY "offeredAt" ASC NULLS LAST, "createdAt" ASC, "id" ASC
    ) AS offer_rank
  FROM "DispatchAssignment"
  WHERE "status" = 'OFFERED'::"DispatchAssignmentStatus"
)
UPDATE "DispatchAssignment" AS assignment
SET
  "status" = 'CANCELLED'::"DispatchAssignmentStatus",
  "respondedAt" = COALESCE(assignment."respondedAt", CURRENT_TIMESTAMP),
  "rejectionReason" = COALESCE(
    assignment."rejectionReason",
    'Cancelled while enforcing one open offer per Rider'
  ),
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_offers
WHERE assignment."id" = ranked_offers."id"
  AND ranked_offers.offer_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "DispatchAssignment_one_open_offer_per_rider"
  ON "DispatchAssignment"("riderProfileId")
  WHERE "status" = 'OFFERED'::"DispatchAssignmentStatus";
