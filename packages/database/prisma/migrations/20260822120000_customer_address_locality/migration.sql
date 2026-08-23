-- AddColumn
ALTER TABLE "CustomerAddress" ADD COLUMN "localityId" TEXT;

-- CreateIndex
CREATE INDEX "CustomerAddress_localityId_idx" ON "CustomerAddress"("localityId");

-- AddForeignKey
ALTER TABLE "CustomerAddress"
ADD CONSTRAINT "CustomerAddress_localityId_fkey"
FOREIGN KEY ("localityId") REFERENCES "ServiceableLocality"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
