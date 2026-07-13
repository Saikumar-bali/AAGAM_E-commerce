CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "PromotionPlacement" AS ENUM ('HOME_HERO', 'HOME_TODAY_OFFERS', 'DEALS_PAGE');
CREATE TYPE "PromotionTargetType" AS ENUM ('NONE', 'PRODUCT', 'CATEGORY', 'DEALS', 'INTERNAL_PATH');
CREATE TYPE "CouponStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "CouponApplicationMode" AS ENUM ('CODE', 'AUTO');
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_DELIVERY');
CREATE TYPE "CouponEligibilityScope" AS ENUM ('ALL', 'PRODUCTS', 'CATEGORIES');
CREATE TYPE "CouponRedemptionStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED');

CREATE TABLE "PromotionCampaign" (
  "id" TEXT NOT NULL,
  "internalName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "description" TEXT,
  "badgeText" TEXT,
  "imageUrl" TEXT,
  "mobileImageUrl" TEXT,
  "backgroundColor" TEXT NOT NULL DEFAULT '#0f172a',
  "textColor" TEXT NOT NULL DEFAULT '#ffffff',
  "accentColor" TEXT NOT NULL DEFAULT '#14b8a6',
  "ctaLabel" TEXT NOT NULL DEFAULT 'Shop now',
  "targetType" "PromotionTargetType" NOT NULL DEFAULT 'DEALS',
  "targetPath" TEXT,
  "productId" TEXT,
  "categoryId" TEXT,
  "couponId" TEXT,
  "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromotionCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionPlacementAssignment" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "placement" "PromotionPlacement" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromotionPlacementAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CouponStatus" NOT NULL DEFAULT 'DRAFT',
  "applicationMode" "CouponApplicationMode" NOT NULL DEFAULT 'CODE',
  "discountType" "CouponDiscountType" NOT NULL,
  "percentageBps" INTEGER,
  "amountPaise" INTEGER,
  "maxDiscountPaise" INTEGER,
  "minimumSubtotalPaise" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "totalUsageLimit" INTEGER,
  "perCustomerLimit" INTEGER NOT NULL DEFAULT 1,
  "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
  "eligibilityScope" "CouponEligibilityScope" NOT NULL DEFAULT 'ALL',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "storeId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CouponProductEligibility" (
  "couponId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "CouponProductEligibility_pkey" PRIMARY KEY ("couponId", "productId")
);

CREATE TABLE "CouponCategoryEligibility" (
  "couponId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  CONSTRAINT "CouponCategoryEligibility_pkey" PRIMARY KEY ("couponId", "categoryId")
);

CREATE TABLE "CouponRedemption" (
  "id" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "CouponRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
  "codeSnapshot" TEXT NOT NULL,
  "discountPaise" INTEGER NOT NULL,
  "ruleSnapshot" JSONB NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "redeemedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionPlacementAssignment_campaignId_placement_key" ON "PromotionPlacementAssignment"("campaignId", "placement");
CREATE INDEX "PromotionPlacementAssignment_placement_sortOrder_idx" ON "PromotionPlacementAssignment"("placement", "sortOrder");
CREATE INDEX "PromotionCampaign_status_startsAt_endsAt_idx" ON "PromotionCampaign"("status", "startsAt", "endsAt");
CREATE INDEX "PromotionCampaign_priority_idx" ON "PromotionCampaign"("priority");
CREATE INDEX "PromotionCampaign_productId_idx" ON "PromotionCampaign"("productId");
CREATE INDEX "PromotionCampaign_categoryId_idx" ON "PromotionCampaign"("categoryId");
CREATE INDEX "PromotionCampaign_couponId_idx" ON "PromotionCampaign"("couponId");
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
CREATE INDEX "Coupon_status_startsAt_endsAt_idx" ON "Coupon"("status", "startsAt", "endsAt");
CREATE INDEX "Coupon_applicationMode_priority_idx" ON "Coupon"("applicationMode", "priority");
CREATE INDEX "Coupon_storeId_idx" ON "Coupon"("storeId");
CREATE INDEX "CouponProductEligibility_productId_idx" ON "CouponProductEligibility"("productId");
CREATE INDEX "CouponCategoryEligibility_categoryId_idx" ON "CouponCategoryEligibility"("categoryId");
CREATE UNIQUE INDEX "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");
CREATE INDEX "CouponRedemption_couponId_status_idx" ON "CouponRedemption"("couponId", "status");
CREATE INDEX "CouponRedemption_customerId_couponId_status_idx" ON "CouponRedemption"("customerId", "couponId", "status");

ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PromotionCampaign" ADD CONSTRAINT "PromotionCampaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionPlacementAssignment" ADD CONSTRAINT "PromotionPlacementAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PromotionCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponProductEligibility" ADD CONSTRAINT "CouponProductEligibility_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponProductEligibility" ADD CONSTRAINT "CouponProductEligibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponCategoryEligibility" ADD CONSTRAINT "CouponCategoryEligibility_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponCategoryEligibility" ADD CONSTRAINT "CouponCategoryEligibility_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
