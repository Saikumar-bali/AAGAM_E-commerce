-- AlterTable
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "temporaryRiderId" TEXT;
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "temporaryRiderStartDate" TIMESTAMP(3);
ALTER TABLE "CustomerSubscription" ADD COLUMN IF NOT EXISTS "temporaryRiderEndDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSubscription_temporaryRiderId_idx" ON "CustomerSubscription"("temporaryRiderId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSubscription_temporaryRiderId_fkey'
  ) THEN
    ALTER TABLE "CustomerSubscription" ADD CONSTRAINT "CustomerSubscription_temporaryRiderId_fkey"
    FOREIGN KEY ("temporaryRiderId") REFERENCES "RiderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
