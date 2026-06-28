-- AlterTable: Store - add soft delete
ALTER TABLE "Store" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable: Product - add soft delete and isActive
ALTER TABLE "Product" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "InventoryAdjustmentReason" AS ENUM ('MANUAL_ADJUSTMENT', 'CHECKOUT_RESERVATION', 'ORDER_CANCEL_RESTORE', 'ORDER_DELIVERED_FINALIZE', 'STOCK_CORRECTION');

-- CreateTable: InventoryLedger
CREATE TABLE "InventoryLedger" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    "reason" "InventoryAdjustmentReason" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryLedger_storeId_createdAt_idx" ON "InventoryLedger"("storeId", "createdAt");
CREATE INDEX "InventoryLedger_productId_createdAt_idx" ON "InventoryLedger"("productId", "createdAt");
CREATE INDEX "InventoryLedger_orderId_idx" ON "InventoryLedger"("orderId");

-- AddForeignKey
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
