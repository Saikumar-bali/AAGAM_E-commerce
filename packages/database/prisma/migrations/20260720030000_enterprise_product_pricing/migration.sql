ALTER TABLE "Product" ADD COLUMN "mrpPaise" INTEGER NOT NULL DEFAULT 0;
UPDATE "Product" SET "mrpPaise" = CASE WHEN "pricePaise" > 0 THEN "pricePaise" ELSE ROUND("price" * 100)::INTEGER END WHERE "mrpPaise" = 0;
ALTER TABLE "Inventory" ADD COLUMN "sellingPricePaise" INTEGER;
ALTER TABLE "Product" ADD CONSTRAINT "Product_mrp_price_check" CHECK ("mrpPaise" >= 0 AND "pricePaise" >= 0 AND ("mrpPaise" = 0 OR "pricePaise" <= "mrpPaise"));
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_selling_price_check" CHECK ("sellingPricePaise" IS NULL OR "sellingPricePaise" >= 0);