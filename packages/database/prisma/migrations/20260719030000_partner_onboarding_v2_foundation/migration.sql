-- Partner Onboarding V2: additive multi-role identity and auditable Admin controls.
-- The legacy User.role column remains as the primary/default role while all
-- authorization paths can also use active memberships from this table.

CREATE TABLE IF NOT EXISTS "UserRoleMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT NOT NULL DEFAULT 'SYSTEM',
  "grantedByUserId" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "UserRoleMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserRoleMembership_status_check" CHECK ("status" IN ('ACTIVE','REVOKED')),
  CONSTRAINT "UserRoleMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserRoleMembership_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserRoleMembership_userId_role_key"
  ON "UserRoleMembership"("userId", "role");
CREATE INDEX IF NOT EXISTS "UserRoleMembership_role_status_idx"
  ON "UserRoleMembership"("role", "status");
CREATE INDEX IF NOT EXISTS "UserRoleMembership_userId_status_idx"
  ON "UserRoleMembership"("userId", "status");

INSERT INTO "UserRoleMembership" ("id", "userId", "role", "status", "source")
SELECT gen_random_uuid()::text, "id", "role", 'ACTIVE', 'LEGACY_PRIMARY_ROLE'
FROM "User"
ON CONFLICT ("userId", "role") DO NOTHING;

ALTER TABLE "PartnerApplication"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "deletionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledPurgeAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "contactVerificationMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "contactVerifiedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "contactVerificationReason" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedExistingUser" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE "PartnerApplication"
    ADD CONSTRAINT "PartnerApplication_deletedByUserId_fkey"
    FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PartnerApplication"
    ADD CONSTRAINT "PartnerApplication_contactVerifiedByUserId_fkey"
    FOREIGN KEY ("contactVerifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "PartnerApplication_deletedAt_idx"
  ON "PartnerApplication"("deletedAt");
CREATE INDEX IF NOT EXISTS "PartnerApplication_scheduledPurgeAt_idx"
  ON "PartnerApplication"("scheduledPurgeAt");

ALTER TABLE "PartnerApplicationDocument"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
