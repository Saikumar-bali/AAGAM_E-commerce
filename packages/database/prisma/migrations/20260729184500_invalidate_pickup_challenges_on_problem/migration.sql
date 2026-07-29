-- A pickup PIN or QR payload describes the parcel state at the time the store
-- issued it. Once the rider reports a mismatch, that authorization must never
-- remain usable for a corrected parcel. Enforce this invariant at the database
-- boundary so every current and future application code path is covered.

-- Triggers are not retroactive. Supersede any stale authorizations that already
-- exist when this migration is deployed before installing the ongoing trigger.
UPDATE "PickupChallenge" AS challenge
SET
  "status" = 'SUPERSEDED'::"PickupChallengeStatus",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "RiderPickupTask" AS task
WHERE challenge."deliveryJobId" = task."deliveryJobId"
  AND challenge."status" = 'PENDING'::"PickupChallengeStatus"
  AND task."status" = 'PROBLEM_REPORTED'::"RiderPickupStatus";

CREATE OR REPLACE FUNCTION "supersede_pickup_challenges_on_problem"()
RETURNS TRIGGER AS $$
BEGIN
  -- Challenge issuance already locks this exact key before it reads checklist
  -- readiness. Taking the same transaction lock before the problem status is
  -- written removes the race where a challenge could be inserted after the
  -- problem transition but before invalidation completes.
  PERFORM pg_advisory_xact_lock(
    hashtext('pickup-proof:' || NEW."deliveryJobId")
  );

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
BEFORE INSERT OR UPDATE OF "status" ON "RiderPickupTask"
FOR EACH ROW
WHEN (NEW."status" = 'PROBLEM_REPORTED'::"RiderPickupStatus")
EXECUTE FUNCTION "supersede_pickup_challenges_on_problem"();
