ALTER TABLE "Inventory"
ADD COLUMN "isListed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "autoHideWhenOutOfStock" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Inventory_storeId_isListed_quantity_idx"
ON "Inventory"("storeId", "isListed", "quantity");
