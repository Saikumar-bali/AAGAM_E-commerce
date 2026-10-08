-- BUG-013/014: DeliveryRun uniqueness was keyed on
-- (storeId, serviceDate, slotStart, deliveryCluster, deliverySlot) WITHOUT the
-- rider. A second rider's run for the same store/date/slot therefore collided
-- with the first rider's run, and the whole dispatch transaction rolled back
-- with an opaque HTTP 500, so a store could only ever put one rider on a slot
-- and "Reassign" to another rider failed the same way.
--
-- Scope the unique key by rider. Postgres treats a NULL rider as distinct, so
-- the planner's rider-less runs and dispatched runs never collide.
DROP INDEX IF EXISTS "DeliveryRun_storeId_serviceDate_slotStart_deliveryCluster_deliverySlot_key";
DROP INDEX IF EXISTS "DeliveryRun_storeId_serviceDate_slotStart_deliveryCluster_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryRun_storeId_serviceDate_slotStart_deliveryCluster_deliverySlot_riderId_key"
  ON "DeliveryRun"("storeId", "serviceDate", "slotStart", "deliveryCluster", "deliverySlot", "riderId");
