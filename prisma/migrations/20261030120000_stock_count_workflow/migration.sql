CREATE TYPE "StockCountStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'POSTED'
);

CREATE TABLE "StockCount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "reviewReason" TEXT,
    "createdById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "postedAt" TIMESTAMP(3),
    "postedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockCountItem" (
    "id" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "systemQuantity" DECIMAL(20,3) NOT NULL,
    "countedQuantity" DECIMAL(20,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockCount_organizationId_number_key"
    ON "StockCount"("organizationId", "number");
CREATE INDEX "StockCount_organizationId_status_createdAt_idx"
    ON "StockCount"("organizationId", "status", "createdAt");
CREATE INDEX "StockCount_organizationId_warehouseId_status_idx"
    ON "StockCount"("organizationId", "warehouseId", "status");
CREATE UNIQUE INDEX "StockCountItem_stockCountId_productId_locationId_key"
    ON "StockCountItem"("stockCountId", "productId", "locationId");
CREATE INDEX "StockCountItem_productId_locationId_idx"
    ON "StockCountItem"("productId", "locationId");

ALTER TABLE "StockCount"
    ADD CONSTRAINT "StockCount_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockCount"
    ADD CONSTRAINT "StockCount_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockCountItem"
    ADD CONSTRAINT "StockCountItem_stockCountId_fkey"
    FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCountItem"
    ADD CONSTRAINT "StockCountItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockCountItem"
    ADD CONSTRAINT "StockCountItem_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
