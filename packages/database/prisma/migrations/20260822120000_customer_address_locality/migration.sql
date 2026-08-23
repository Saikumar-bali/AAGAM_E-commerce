ALTER TABLE "CustomerAddress" ADD COLUMN "localityId" TEXT;

CREATE INDEX "CustomerAddress_localityId_idx" ON "CustomerAddress"("localityId");

ALTER TABLE "CustomerAddress"
ADD CONSTRAINT "CustomerAddress_localityId_fkey"
FOREIGN KEY ("localityId") REFERENCES "ServiceableLocality"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
