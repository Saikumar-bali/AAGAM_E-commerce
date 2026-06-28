-- Migration: phase2_money_orders_payments
-- Purpose: Add paise-based money fields, refund model, payment lifecycle improvements.
-- Safe for production — no drops, no data loss.
-- PostgreSQL 12+ required (ALTER TYPE inside transaction).

-- 1. Product: add pricePaise
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "pricePaise" INTEGER NOT NULL DEFAULT 0;

-- 2. Order: add paise columns
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "subtotalPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryFeePaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "grandTotalPaise" INTEGER NOT NULL DEFAULT 0;

-- 3. OrderItem: add paise columns
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "unitPricePaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "lineTotalPaise" INTEGER NOT NULL DEFAULT 0;

-- 4. Payment: add amountPaise and idempotencyKey
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "amountPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- 5. PaymentStatus: add refund statuses
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

-- 6. Create RefundStatus enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RefundStatus') THEN
    CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
  END IF;
END
$$;

-- 7. Create Refund table
CREATE TABLE IF NOT EXISTS "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "requestedByUserId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- 8. Indexes for Refund
CREATE INDEX IF NOT EXISTS "Refund_orderId_idx" ON "Refund"("orderId");
CREATE INDEX IF NOT EXISTS "Refund_paymentId_idx" ON "Refund"("paymentId");

-- 9. Refund foreign keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Refund_orderId_fkey') THEN
    ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Refund_paymentId_fkey') THEN
    ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- 10. Backfill paise values from existing Float columns
UPDATE "Product" SET "pricePaise" = ROUND("price" * 100)::integer WHERE "pricePaise" = 0 AND "price" != 0;
UPDATE "Order" SET "subtotalPaise" = ROUND("subtotal" * 100)::integer WHERE "subtotalPaise" = 0 AND "subtotal" != 0;
UPDATE "Order" SET "deliveryFeePaise" = ROUND("deliveryFee" * 100)::integer WHERE "deliveryFeePaise" = 0 AND "deliveryFee" != 0;
UPDATE "Order" SET "discountPaise" = ROUND("discountAmount" * 100)::integer WHERE "discountPaise" = 0 AND "discountAmount" != 0;
UPDATE "Order" SET "taxPaise" = ROUND("taxAmount" * 100)::integer WHERE "taxPaise" = 0 AND "taxAmount" != 0;
UPDATE "Order" SET "grandTotalPaise" = ROUND("grandTotal" * 100)::integer WHERE "grandTotalPaise" = 0 AND "grandTotal" != 0;
UPDATE "OrderItem" SET "unitPricePaise" = ROUND("price" * 100)::integer WHERE "unitPricePaise" = 0 AND "price" != 0;
UPDATE "OrderItem" SET "lineTotalPaise" = ROUND(("price" * "quantity") * 100)::integer WHERE "lineTotalPaise" = 0;
UPDATE "Payment" SET "amountPaise" = ROUND("amount" * 100)::integer WHERE "amountPaise" = 0 AND "amount" != 0;
