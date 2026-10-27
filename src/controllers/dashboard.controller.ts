import type { RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';

export const summary: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const [
    products,
    warehouses,
    purchaseOrders,
    salesOrders,
    inventorySummary,
    inventoryValue,
    lowStockCount,
    inTransitDeliveries,
    overdueDeliveries,
    settings,
  ] = await prisma.$transaction([
    prisma.product.count({ where: { organizationId, isActive: true } }),
    prisma.warehouse.count({ where: { organizationId, isActive: true } }),
    prisma.purchaseOrder.count({
      where: {
        organizationId,
        status: { in: ['SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED'] },
      },
    }),
    prisma.salesOrder.count({
      where: {
        organizationId,
        status: { in: ['CONFIRMED', 'RESERVED', 'PARTIALLY_FULFILLED'] },
      },
    }),
    prisma.inventoryBalance.aggregate({
      where: { organizationId },
      _sum: { onHand: true, reserved: true },
    }),
    prisma.$queryRaw<Array<{ inventoryValue: Prisma.Decimal }>>(Prisma.sql`
        SELECT COALESCE(SUM(b."onHand" * b."averageCost"), 0) AS "inventoryValue"
        FROM "InventoryBalance" b
        WHERE b."organizationId" = ${organizationId}::uuid
      `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM (
          SELECT b."onHand", b."reserved", p."reorderLevel"
          FROM "InventoryBalance" b
          JOIN "Product" p ON p."id" = b."productId"
          WHERE b."organizationId" = ${organizationId}::uuid AND p."isActive" = true
        ) stock
        WHERE stock."onHand" - stock."reserved" <= stock."reorderLevel"
      `),
    prisma.salesDelivery.count({
      where: { organizationId, status: 'IN_TRANSIT' },
    }),
    prisma.salesDelivery.count({
      where: {
        organizationId,
        status: 'IN_TRANSIT',
        estimatedDeliveryAt: { lt: new Date() },
      },
    }),
    prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { baseCurrency: true, businessName: true },
    }),
  ]);
  if (!settings) {
    throw new AppError(
      'Organization settings are missing',
      500,
      'CONFIGURATION_ERROR',
    );
  }
  const availableUnits = (
    inventorySummary._sum.onHand ?? new Prisma.Decimal(0)
  ).sub(inventorySummary._sum.reserved ?? new Prisma.Decimal(0));
  success(res, 'Dashboard summary retrieved', {
    products,
    warehouses,
    openPurchaseOrders: purchaseOrders,
    openSalesOrders: salesOrders,
    inTransitDeliveries,
    overdueDeliveries,
    lowStockBalances: Number(lowStockCount[0]?.count ?? 0n),
    availableUnits,
    inventoryValue: inventoryValue[0]?.inventoryValue ?? new Prisma.Decimal(0),
    currency: settings.baseCurrency,
    businessName: settings.businessName,
    asOf: new Date().toISOString(),
  });
};
