-- Add Google auth linkage fields on users
ALTER TABLE "User"
  ADD COLUMN "googleSub" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
