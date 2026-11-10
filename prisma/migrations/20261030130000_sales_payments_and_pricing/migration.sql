CREATE TYPE "SalesPaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

ALTER TABLE "OrganizationSettings"
    ADD COLUMN "salesTaxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    ADD COLUMN "maxSalesDiscountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;

ALTER TABLE "SalesOrder"
    ADD COLUMN "paymentStatus" "SalesPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    ADD COLUMN "discountPercent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    ADD COLUMN "discountAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    ADD COLUMN "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    ADD COLUMN "taxAmount" DECIMAL(20,4) NOT NULL DEFAULT 0,
    ADD COLUMN "paidAmount" DECIMAL(20,4) NOT NULL DEFAULT 0;

CREATE TABLE "SalesPayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "amount" DECIMAL(20,4) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "receivedById" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesPayment_organizationId_idempotencyKey_key"
    ON "SalesPayment"("organizationId", "idempotencyKey");
CREATE INDEX "SalesPayment_organizationId_salesOrderId_receivedAt_idx"
    ON "SalesPayment"("organizationId", "salesOrderId", "receivedAt");

ALTER TABLE "SalesPayment"
    ADD CONSTRAINT "SalesPayment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesPayment"
    ADD CONSTRAINT "SalesPayment_salesOrderId_fkey"
    FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesPayment"
    ADD CONSTRAINT "SalesPayment_receivedById_fkey"
    FOREIGN KEY ("receivedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganizationSettings"
    ADD CONSTRAINT "OrganizationSettings_salesTaxRate_check"
    CHECK ("salesTaxRate" >= 0 AND "salesTaxRate" <= 100);
ALTER TABLE "OrganizationSettings"
    ADD CONSTRAINT "OrganizationSettings_maxSalesDiscountPercent_check"
    CHECK ("maxSalesDiscountPercent" >= 0 AND "maxSalesDiscountPercent" <= 100);
ALTER TABLE "SalesPayment"
    ADD CONSTRAINT "SalesPayment_amount_check"
    CHECK ("amount" > 0);

INSERT INTO "Permission" ("id", "key", "description")
VALUES
    (gen_random_uuid(), 'sales.price.override', 'Override catalog selling prices on sales orders'),
    (gen_random_uuid(), 'sales.discount.apply', 'Apply sales discounts within organization policy'),
    (gen_random_uuid(), 'sales.payments.record', 'Record customer payments against sales orders')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON (
    (p."key" IN ('sales.price.override', 'sales.discount.apply')
        AND r."name" IN ('Organization Owner', 'Organization Administrator', 'Sales Manager'))
    OR
    (p."key" = 'sales.payments.record'
        AND r."name" IN ('Organization Owner', 'Organization Administrator', 'Sales Manager', 'Salesperson'))
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
