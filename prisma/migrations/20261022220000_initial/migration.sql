-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INVITED');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('NONE', 'BATCH', 'SERIAL', 'EXPIRY', 'BATCH_EXPIRY');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING_BALANCE', 'PURCHASE_RECEIPT', 'SALE_ISSUE', 'CUSTOMER_RETURN', 'SUPPLIER_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'POSITIVE_ADJUSTMENT', 'NEGATIVE_ADJUSTMENT', 'STOCK_COUNT', 'RESERVATION', 'RESERVATION_RELEASE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SalesStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'RESERVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('AVAILABLE', 'QUARANTINED', 'EXPIRED', 'RECALLED', 'DAMAGED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "businessName" TEXT NOT NULL,
    "address" TEXT,
    "logoUrl" TEXT,
    "taxSettings" JSONB NOT NULL DEFAULT '{}',
    "baseCurrency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Kigali',
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "requirePurchaseApproval" BOOLEAN NOT NULL DEFAULT true,
    "requireSeparationOfDuties" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBySessionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseLocation" (
    "id" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "categoryId" UUID,
    "unitId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "purchaseCost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "wholesalePrice" DECIMAL(20,4),
    "reorderLevel" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "minimumStock" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "maximumStock" DECIMAL(20,3),
    "trackingMode" "TrackingMode" NOT NULL DEFAULT 'NONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Rwanda',
    "taxId" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Rwanda',
    "taxId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "onHand" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantityDelta" DECIMAL(20,3) NOT NULL,
    "quantityBefore" DECIMAL(20,3) NOT NULL,
    "quantityAfter" DECIMAL(20,3) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL,
    "sourceType" TEXT,
    "sourceId" UUID,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "reason" TEXT,
    "actorId" UUID NOT NULL,
    "reversalOfId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "status" "StockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "subtotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "expectedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "approvedById" UUID,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantityOrdered" DECIMAL(20,3) NOT NULL,
    "quantityReceived" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(20,4) NOT NULL,
    "lineTotal" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "purchaseOrderId" UUID,
    "supplierId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceNumber" TEXT,
    "deliveryNote" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiptItem" (
    "id" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID,
    "quantity" DECIMAL(20,3) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "GoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "SalesStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "subtotal" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(20,3) NOT NULL,
    "quantityIssued" DECIMAL(20,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(20,4) NOT NULL,
    "lineTotal" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(20,3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "sourceWarehouseId" UUID NOT NULL,
    "destinationWarehouseId" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "dispatchedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferItem" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(20,3) NOT NULL,
    "quantityReceived" DECIMAL(20,3) NOT NULL DEFAULT 0,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "requestedById" UUID NOT NULL,
    "approvedById" UUID,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentItem" (
    "id" UUID NOT NULL,
    "adjustmentId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID,
    "delta" DECIMAL(20,3) NOT NULL,
    "unitCost" DECIMAL(20,4) NOT NULL,

    CONSTRAINT "StockAdjustmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "changes" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "recipientId" UUID,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_refreshTokenHash_key" ON "UserSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Warehouse_organizationId_isActive_idx" ON "Warehouse"("organizationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_organizationId_code_key" ON "Warehouse"("organizationId", "code");

-- CreateIndex
CREATE INDEX "WarehouseLocation_warehouseId_isActive_idx" ON "WarehouseLocation"("warehouseId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseLocation_warehouseId_code_key" ON "WarehouseLocation"("warehouseId", "code");

-- CreateIndex
CREATE INDEX "ProductCategory_organizationId_parentId_idx" ON "ProductCategory"("organizationId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_organizationId_parentId_name_key" ON "ProductCategory"("organizationId", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_organizationId_symbol_key" ON "UnitOfMeasure"("organizationId", "symbol");

-- CreateIndex
CREATE INDEX "Product_organizationId_isActive_name_idx" ON "Product"("organizationId", "isActive", "name");

-- CreateIndex
CREATE INDEX "Product_organizationId_categoryId_idx" ON "Product"("organizationId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_barcode_key" ON "Product"("organizationId", "barcode");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_name_idx" ON "Supplier"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organizationId_code_key" ON "Supplier"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Customer_organizationId_name_idx" ON "Customer"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_code_key" ON "Customer"("organizationId", "code");

-- CreateIndex
CREATE INDEX "InventoryBalance_organizationId_warehouseId_productId_idx" ON "InventoryBalance"("organizationId", "warehouseId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_organizationId_productId_warehouseId_locat_key" ON "InventoryBalance"("organizationId", "productId", "warehouseId", "locationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_organizationId_productId_warehouseId_crea_idx" ON "InventoryMovement"("organizationId", "productId", "warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_organizationId_sourceType_sourceId_idx" ON "InventoryMovement"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_organizationId_idempotencyKey_key" ON "InventoryMovement"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockBatch_organizationId_expiryDate_status_idx" ON "StockBatch"("organizationId", "expiryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_organizationId_productId_batchNumber_key" ON "StockBatch"("organizationId", "productId", "batchNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_organizationId_status_createdAt_idx" ON "PurchaseOrder"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_number_key" ON "PurchaseOrder"("organizationId", "number");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_organizationId_status_createdAt_idx" ON "GoodsReceipt"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_organizationId_number_key" ON "GoodsReceipt"("organizationId", "number");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_goodsReceiptId_idx" ON "GoodsReceiptItem"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "SalesOrder_organizationId_status_createdAt_idx" ON "SalesOrder"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_organizationId_number_key" ON "SalesOrder"("organizationId", "number");

-- CreateIndex
CREATE INDEX "SalesOrderItem_salesOrderId_idx" ON "SalesOrderItem"("salesOrderId");

-- CreateIndex
CREATE INDEX "InventoryReservation_organizationId_productId_warehouseId_s_idx" ON "InventoryReservation"("organizationId", "productId", "warehouseId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_salesOrderId_status_idx" ON "InventoryReservation"("salesOrderId", "status");

-- CreateIndex
CREATE INDEX "StockTransfer_organizationId_status_createdAt_idx" ON "StockTransfer"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_organizationId_number_key" ON "StockTransfer"("organizationId", "number");

-- CreateIndex
CREATE INDEX "StockTransferItem_transferId_idx" ON "StockTransferItem"("transferId");

-- CreateIndex
CREATE INDEX "StockAdjustment_organizationId_status_createdAt_idx" ON "StockAdjustment"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_organizationId_number_key" ON "StockAdjustment"("organizationId", "number");

-- CreateIndex
CREATE INDEX "StockAdjustmentItem_adjustmentId_idx" ON "StockAdjustmentItem"("adjustmentId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_organizationId_key_key" ON "IdempotencyRecord"("organizationId", "key");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_entityType_entityId_idx" ON "AuditLog"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_recipientId_readAt_createdAt_idx" ON "Notification"("organizationId", "recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_organizationId_dedupeKey_key" ON "Notification"("organizationId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseLocation" ADD CONSTRAINT "WarehouseLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiptItem" ADD CONSTRAINT "GoodsReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Numeric and ledger invariants not expressible in the Prisma schema.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_costs_nonnegative" CHECK (
    "purchaseCost" >= 0 AND "sellingPrice" >= 0 AND
    ("wholesalePrice" IS NULL OR "wholesalePrice" >= 0)
  ),
  ADD CONSTRAINT "Product_stock_limits_nonnegative" CHECK (
    "reorderLevel" >= 0 AND "minimumStock" >= 0 AND
    ("maximumStock" IS NULL OR "maximumStock" >= "minimumStock")
  );

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_reserved_nonnegative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "InventoryBalance_average_cost_nonnegative" CHECK ("averageCost" >= 0);

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_delta_nonzero" CHECK ("quantityDelta" <> 0),
  ADD CONSTRAINT "InventoryMovement_quantity_reconciles" CHECK (
    "quantityAfter" = "quantityBefore" + "quantityDelta"
  ),
  ADD CONSTRAINT "InventoryMovement_cost_nonnegative" CHECK ("unitCost" >= 0);

ALTER TABLE "PurchaseOrderItem"
  ADD CONSTRAINT "PurchaseOrderItem_quantities_valid" CHECK (
    "quantityOrdered" > 0 AND "quantityReceived" >= 0 AND "quantityReceived" <= "quantityOrdered"
  ),
  ADD CONSTRAINT "PurchaseOrderItem_cost_nonnegative" CHECK ("unitCost" >= 0 AND "lineTotal" >= 0);

ALTER TABLE "GoodsReceiptItem"
  ADD CONSTRAINT "GoodsReceiptItem_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "GoodsReceiptItem_cost_nonnegative" CHECK ("unitCost" >= 0);

ALTER TABLE "SalesOrderItem"
  ADD CONSTRAINT "SalesOrderItem_quantities_valid" CHECK (
    "quantity" > 0 AND "quantityIssued" >= 0 AND "quantityIssued" <= "quantity"
  ),
  ADD CONSTRAINT "SalesOrderItem_amounts_nonnegative" CHECK ("unitPrice" >= 0 AND "lineTotal" >= 0);

ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT "InventoryReservation_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "StockTransferItem"
  ADD CONSTRAINT "StockTransferItem_quantities_valid" CHECK (
    "quantity" > 0 AND "quantityReceived" >= 0 AND "quantityReceived" <= "quantity"
  );

ALTER TABLE "StockAdjustmentItem"
  ADD CONSTRAINT "StockAdjustmentItem_delta_nonzero" CHECK ("delta" <> 0),
  ADD CONSTRAINT "StockAdjustmentItem_cost_nonnegative" CHECK ("unitCost" >= 0);

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_amounts_nonnegative" CHECK ("subtotal" >= 0 AND "total" >= 0);

ALTER TABLE "SalesOrder"
  ADD CONSTRAINT "SalesOrder_amounts_nonnegative" CHECK ("subtotal" >= 0 AND "total" >= 0);

CREATE FUNCTION prevent_immutable_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Records in % are immutable; create a compensating record instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InventoryMovement_immutable"
  BEFORE UPDATE OR DELETE ON "InventoryMovement"
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_mutation();

CREATE TRIGGER "AuditLog_immutable"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_record_mutation();
