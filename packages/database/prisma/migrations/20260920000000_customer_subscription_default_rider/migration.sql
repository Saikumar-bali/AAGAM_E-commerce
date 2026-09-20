-- AlterTable
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "defaultRiderId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSubscription_defaultRiderId_idx" ON "CustomerSubscription"("defaultRiderId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_defaultRiderId_fkey" FOREIGN KEY ("defaultRiderId") REFERENCES "RiderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
