-- AddColumn
ALTER TABLE "CustomerAddress" ADD COLUMN "localityId" TEXT;

-- CreateIndex
CREATE INDEX "CustomerAddress_localityId_idx" ON "CustomerAddress"("localityId");

-- AddForeignKey (NOT VALID to avoid long lock on large tables)
ALTER TABLE "CustomerAddress"
ADD CONSTRAINT "CustomerAddress_localityId_fkey"
FOREIGN KEY ("localityId") REFERENCES "ServiceableLocality"("id")
ON DELETE SET NULL ON UPDATE CASCADE
NOT VALID;

-- Validate the FK constraint separately for safety on large tables
ALTER TABLE "CustomerAddress"
VALIDATE CONSTRAINT "CustomerAddress_localityId_fkey";
