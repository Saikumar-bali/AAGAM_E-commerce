-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "operatingHours" JSONB,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';