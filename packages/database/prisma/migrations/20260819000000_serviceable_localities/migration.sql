-- CreateTable
CREATE TABLE "ServiceableLocality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ANDHRA PRADESH',
    "pincode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "zoneId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceableLocality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceableLocality_pincode_idx" ON "ServiceableLocality"("pincode");

-- CreateIndex
CREATE INDEX "ServiceableLocality_city_idx" ON "ServiceableLocality"("city");

-- CreateIndex
CREATE INDEX "ServiceableLocality_zoneId_idx" ON "ServiceableLocality"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceableLocality_pincode_name_key" ON "ServiceableLocality"("pincode", "name");

-- AddForeignKey
ALTER TABLE "ServiceableLocality" ADD CONSTRAINT "ServiceableLocality_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;