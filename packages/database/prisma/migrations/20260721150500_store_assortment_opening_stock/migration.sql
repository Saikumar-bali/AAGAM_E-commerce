-- Add an explicit audit reason for the first physical stock recorded when a store adopts a catalogue product.
ALTER TYPE "InventoryAdjustmentReason" ADD VALUE IF NOT EXISTS 'OPENING_STOCK';
