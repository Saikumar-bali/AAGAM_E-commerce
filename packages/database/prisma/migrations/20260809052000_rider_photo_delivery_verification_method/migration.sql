-- Persist Rider photo fallback as a first-class delivery verification method.
ALTER TYPE "DeliveryVerificationMethod" ADD VALUE IF NOT EXISTS 'RIDER_PHOTO_EVIDENCE';
