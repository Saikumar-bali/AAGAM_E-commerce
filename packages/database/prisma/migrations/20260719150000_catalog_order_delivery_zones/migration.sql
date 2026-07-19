ALTER TABLE "Category" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) AS position FROM "Category"
)
UPDATE "Category" SET "sortOrder" = ordered.position FROM ordered WHERE "Category".id = ordered.id;

WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "createdAt" DESC) AS position FROM "Product"
)
UPDATE "Product" SET "sortOrder" = ordered.position FROM ordered WHERE "Product".id = ordered.id;

CREATE TABLE "DeliveryZone" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeliveryZone_name_key" ON "DeliveryZone"("name");
CREATE INDEX "DeliveryZone_isActive_sortOrder_idx" ON "DeliveryZone"("isActive", "sortOrder");

INSERT INTO "DeliveryZone" ("id", "name", "sortOrder", "updatedAt") VALUES
('zone_madhurawada', 'Madhurawada', 1, CURRENT_TIMESTAMP),
('zone_pm_palem', 'PM Palem', 2, CURRENT_TIMESTAMP),
('zone_mvp_colony', 'MVP Colony', 3, CURRENT_TIMESTAMP),
('zone_dwaraka_nagar', 'Dwaraka Nagar', 4, CURRENT_TIMESTAMP),
('zone_gajuwaka', 'Gajuwaka', 5, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
