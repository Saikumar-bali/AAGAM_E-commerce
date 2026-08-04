-- Normalize empty references and preserve legacy duplicate rows before adding
-- the production uniqueness guarantee used by COD settlement retry handling.
UPDATE "CodLedger"
SET "settlementReference" = NULL
WHERE "settlementReference" IS NOT NULL
  AND btrim("settlementReference") = '';

WITH ranked AS (
  SELECT
    "id",
    "settlementReference",
    row_number() OVER (
      PARTITION BY "settlementReference"
      ORDER BY "updatedAt" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "CodLedger"
  WHERE "settlementReference" IS NOT NULL
)
UPDATE "CodLedger" AS ledger
SET "settlementReference" = ranked."settlementReference"
  || '-legacy-'
  || left(ledger."id", 8)
FROM ranked
WHERE ledger."id" = ranked."id"
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "CodLedger_settlementReference_key"
ON "CodLedger"("settlementReference");
