-- Add Google auth linkage fields on users
ALTER TABLE "User"
  ADD COLUMN "googleSub" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
