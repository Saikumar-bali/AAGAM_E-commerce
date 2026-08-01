-- Category artwork is managed by Admin and rendered by the customer app.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
