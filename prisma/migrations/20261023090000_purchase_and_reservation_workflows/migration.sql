ALTER TYPE "PurchaseStatus" ADD VALUE 'REJECTED';

ALTER TABLE "GoodsReceiptItem"
  ADD COLUMN "purchaseOrderItemId" UUID;

CREATE INDEX "GoodsReceiptItem_purchaseOrderItemId_idx"
  ON "GoodsReceiptItem"("purchaseOrderItemId");

ALTER TABLE "GoodsReceiptItem"
  ADD CONSTRAINT "GoodsReceiptItem_purchaseOrderItemId_fkey"
  FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryReservation"
  ADD COLUMN "locationId" UUID;

UPDATE "InventoryReservation" AS reservation
SET "locationId" = balance."locationId"
FROM "InventoryBalance" AS balance
WHERE balance."organizationId" = reservation."organizationId"
  AND balance."productId" = reservation."productId"
  AND balance."warehouseId" = reservation."warehouseId"
  AND balance."onHand" >= reservation."quantity"
  AND reservation."locationId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InventoryReservation" WHERE "locationId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate reservations without a matching inventory balance/location';
  END IF;
END;
$$;

ALTER TABLE "InventoryReservation"
  ALTER COLUMN "locationId" SET NOT NULL,
  ADD CONSTRAINT "InventoryReservation_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "InventoryReservation_locationId_idx"
  ON "InventoryReservation"("locationId");

CREATE INDEX "InventoryReservation_organizationId_warehouseId_productId_locationId_status_idx"
  ON "InventoryReservation"("organizationId", "warehouseId", "productId", "locationId", "status");

ALTER TABLE "IdempotencyRecord"
  ADD COLUMN "requestHash" TEXT NOT NULL DEFAULT '';
