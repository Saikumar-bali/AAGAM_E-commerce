ALTER TABLE "User"
  ADD COLUMN "operationalCode" TEXT;

CREATE UNIQUE INDEX "User_operationalCode_key"
  ON "User"("operationalCode");
