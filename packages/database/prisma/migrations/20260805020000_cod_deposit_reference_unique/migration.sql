-- COD deposit entries are the immutable financial audit trail. Normalize
-- references and preserve legacy duplicates with an explicit suffix before
-- enforcing global uniqueness for future DEPOSITED entries.
UPDATE "CodLedgerEntry"
SET "reference" = NULL
WHERE "type" = 'DEPOSITED'::"CodLedgerEntryType"
  AND "reference" IS NOT NULL
  AND btrim("reference") = '';

UPDATE "CodLedgerEntry"
SET "reference" = btrim("reference")
WHERE "type" = 'DEPOSITED'::"CodLedgerEntryType"
  AND "reference" IS NOT NULL;

WITH ranked_deposits AS (
  SELECT
    "id",
    "reference",
    row_number() OVER (
      PARTITION BY "reference"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "CodLedgerEntry"
  WHERE "type" = 'DEPOSITED'::"CodLedgerEntryType"
    AND "reference" IS NOT NULL
)
UPDATE "CodLedgerEntry" AS entry
SET "reference" = ranked_deposits."reference"
  || '-legacy-'
  || left(entry."id", 8)
FROM ranked_deposits
WHERE entry."id" = ranked_deposits."id"
  AND ranked_deposits.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "CodLedgerEntry_deposited_reference_key"
ON "CodLedgerEntry"("reference")
WHERE "type" = 'DEPOSITED'::"CodLedgerEntryType"
  AND "reference" IS NOT NULL;
