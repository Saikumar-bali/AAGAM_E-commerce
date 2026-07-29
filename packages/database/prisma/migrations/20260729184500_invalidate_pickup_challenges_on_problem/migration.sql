-- A pickup PIN or QR payload describes the parcel state at the time the store
-- issued it. Once the rider reports a mismatch, that authorization must never
-- remain usable for a corrected parcel. Enforce this invariant at the database
-- boundary so every current and future application code path is covered.

CREATE OR REPLACE FUNCTION "supersede_pickup_challenges_on_problem"()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "PickupChallenge"
  SET
    "status" = 'SUPERSEDED'::"PickupChallengeStatus",
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "deliveryJobId" = NEW."deliveryJobId"
    AND "status" = 'PENDING'::"PickupChallengeStatus";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "RiderPickupTask_supersede_challenges_on_problem"
ON "RiderPickupTask";

CREATE TRIGGER "RiderPickupTask_supersede_challenges_on_problem"
AFTER INSERT OR UPDATE OF "status" ON "RiderPickupTask"
FOR EACH ROW
WHEN (NEW."status" = 'PROBLEM_REPORTED'::"RiderPickupStatus")
EXECUTE FUNCTION "supersede_pickup_challenges_on_problem"();
