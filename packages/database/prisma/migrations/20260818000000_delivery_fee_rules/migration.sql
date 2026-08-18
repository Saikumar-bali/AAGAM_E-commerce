-- CreateEnum
CREATE TYPE "DeliveryFeeMatchType" AS ENUM ('PINCODE', 'CITY', 'KEYWORD', 'DEFAULT');

-- CreateTable
CREATE TABLE "DeliveryFeeRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchType" "DeliveryFeeMatchType" NOT NULL,
    "pincode" TEXT,
    "city" TEXT,
    "keywords" TEXT[],
    "storeId" TEXT,
    "ratePaisePerKm" INTEGER NOT NULL DEFAULT 200,
    "flatFeePaise" INTEGER,
    "freeDeliveryMinimumPaise" INTEGER,
    "maximumDistanceKm" DOUBLE PRECISION,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryFeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryFeeRule_storeId_idx" ON "DeliveryFeeRule"("storeId");

-- CreateIndex
CREATE INDEX "DeliveryFeeRule_matchType_idx" ON "DeliveryFeeRule"("matchType");

-- AddForeignKey
ALTER TABLE "DeliveryFeeRule" ADD CONSTRAINT "DeliveryFeeRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
