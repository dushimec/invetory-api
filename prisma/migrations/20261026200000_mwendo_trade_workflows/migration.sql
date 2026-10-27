CREATE TYPE "ProcurementType" AS ENUM ('LOCAL', 'IMPORT');

CREATE TYPE "DeliveryStatus" AS ENUM ('IN_TRANSIT', 'DELIVERED', 'FAILED');

CREATE TYPE "SerialStatus" AS ENUM (
  'AVAILABLE',
  'RESERVED',
  'IN_TRANSIT',
  'ISSUED',
  'SUPPLIER_RETURNED'
);

ALTER TABLE "PurchaseOrder"
ADD COLUMN "procurementType" "ProcurementType" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN "exchangeRate" DECIMAL(20,8) NOT NULL DEFAULT 1,
ADD COLUMN "freightCost" DECIMAL(20,4) NOT NULL DEFAULT 0,
ADD COLUMN "customsCost" DECIMAL(20,4) NOT NULL DEFAULT 0,
ADD COLUMN "insuranceCost" DECIMAL(20,4) NOT NULL DEFAULT 0,
ADD COLUMN "otherLandedCost" DECIMAL(20,4) NOT NULL DEFAULT 0,
ADD COLUMN "originCountry" TEXT,
ADD COLUMN "shipmentReference" TEXT,
ADD COLUMN "incoterm" TEXT;

CREATE INDEX "PurchaseOrder_organizationId_procurementType_status_createdAt_idx"
ON "PurchaseOrder"("organizationId", "procurementType", "status", "createdAt");

ALTER TABLE "GoodsReceiptItem"
ADD COLUMN "serialNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "SalesOrder"
ADD COLUMN "deliveryAddress" TEXT,
ADD COLUMN "estimatedDeliveryAt" TIMESTAMP(3);

CREATE TABLE "StockSerial" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "status" "SerialStatus" NOT NULL DEFAULT 'AVAILABLE',
  "warehouseId" UUID,
  "locationId" UUID,
  "sourcePurchaseOrderItemId" UUID,
  "issuedSalesOrderItemId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockSerial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockSerial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockSerial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockSerial_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockSerial_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockSerial_sourcePurchaseOrderItemId_fkey" FOREIGN KEY ("sourcePurchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockSerial_issuedSalesOrderItemId_fkey" FOREIGN KEY ("issuedSalesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StockSerial_organizationId_productId_serialNumber_key"
ON "StockSerial"("organizationId", "productId", "serialNumber");

CREATE INDEX "StockSerial_organizationId_warehouseId_productId_status_locationId_idx"
ON "StockSerial"("organizationId", "warehouseId", "productId", "status", "locationId");

CREATE INDEX "StockSerial_sourcePurchaseOrderItemId_idx"
ON "StockSerial"("sourcePurchaseOrderItemId");

CREATE INDEX "StockSerial_issuedSalesOrderItemId_idx"
ON "StockSerial"("issuedSalesOrderItemId");

ALTER TABLE "InventoryReservation"
ADD COLUMN "serialNumberId" UUID;

CREATE UNIQUE INDEX "InventoryReservation_serialNumberId_key"
ON "InventoryReservation"("serialNumberId");

ALTER TABLE "InventoryReservation"
ADD CONSTRAINT "InventoryReservation_serialNumberId_fkey"
FOREIGN KEY ("serialNumberId") REFERENCES "StockSerial"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockTransferItem"
ADD COLUMN "serialNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "StockAdjustmentItem"
ADD COLUMN "serialNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "InventoryReturnItem"
ADD COLUMN "serialNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "SalesDelivery" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "salesOrderId" UUID NOT NULL,
  "number" TEXT NOT NULL,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'IN_TRANSIT',
  "deliveryAddress" TEXT,
  "carrier" TEXT,
  "driverName" TEXT,
  "driverPhone" TEXT,
  "trackingReference" TEXT,
  "estimatedDeliveryAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "proofOfDelivery" TEXT,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesDelivery_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesDelivery_organizationId_number_key"
ON "SalesDelivery"("organizationId", "number");

CREATE INDEX "SalesDelivery_organizationId_status_estimatedDeliveryAt_idx"
ON "SalesDelivery"("organizationId", "status", "estimatedDeliveryAt");

CREATE INDEX "SalesDelivery_salesOrderId_createdAt_idx"
ON "SalesDelivery"("salesOrderId", "createdAt");

CREATE TABLE "SalesDeliveryItem" (
  "id" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "salesOrderItemId" UUID NOT NULL,
  "quantity" DECIMAL(20,3) NOT NULL,
  "serialNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "SalesDeliveryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SalesDeliveryItem_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "SalesDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SalesDeliveryItem_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SalesDeliveryItem_deliveryId_salesOrderItemId_key"
ON "SalesDeliveryItem"("deliveryId", "salesOrderItemId");

CREATE INDEX "SalesDeliveryItem_deliveryId_idx"
ON "SalesDeliveryItem"("deliveryId");
