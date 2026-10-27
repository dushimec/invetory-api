CREATE TYPE "ReturnType" AS ENUM ('CUSTOMER', 'SUPPLIER');

CREATE TABLE "InventoryReturn" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "type" "ReturnType" NOT NULL,
    "number" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "salesOrderId" UUID,
    "purchaseOrderId" UUID,
    "requestedById" UUID NOT NULL,
    "approvedById" UUID,
    "postedAt" TIMESTAMP(3),
    "postedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryReturn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryReturn_reference_valid" CHECK (
      ("type" = 'CUSTOMER' AND "salesOrderId" IS NOT NULL AND "purchaseOrderId" IS NULL)
      OR ("type" = 'SUPPLIER' AND "purchaseOrderId" IS NOT NULL AND "salesOrderId" IS NULL)
    )
);

CREATE TABLE "InventoryReturnItem" (
    "id" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL,
    CONSTRAINT "InventoryReturnItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InventoryReturnItem_quantity_valid" CHECK ("quantity" > 0),
    CONSTRAINT "InventoryReturnItem_cost_valid" CHECK ("unitCost" >= 0)
);

CREATE UNIQUE INDEX "InventoryReturn_organizationId_number_key"
  ON "InventoryReturn"("organizationId", "number");
CREATE INDEX "InventoryReturn_organizationId_type_status_createdAt_idx"
  ON "InventoryReturn"("organizationId", "type", "status", "createdAt");
CREATE INDEX "InventoryReturn_organizationId_salesOrderId_idx"
  ON "InventoryReturn"("organizationId", "salesOrderId");
CREATE INDEX "InventoryReturn_organizationId_purchaseOrderId_idx"
  ON "InventoryReturn"("organizationId", "purchaseOrderId");
CREATE INDEX "InventoryReturnItem_returnId_idx"
  ON "InventoryReturnItem"("returnId");
CREATE INDEX "InventoryReturnItem_productId_idx"
  ON "InventoryReturnItem"("productId");

ALTER TABLE "InventoryReturn"
  ADD CONSTRAINT "InventoryReturn_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryReturn_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryReturn_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryReturn_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryReturnItem"
  ADD CONSTRAINT "InventoryReturnItem_returnId_fkey"
    FOREIGN KEY ("returnId") REFERENCES "InventoryReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryReturnItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InventoryReturnItem_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
