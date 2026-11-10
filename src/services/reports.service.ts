import { Prisma, type PurchaseStatus } from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';

export interface ReportQuery {
  page: number;
  pageSize: number;
  from?: Date;
  to?: Date;
  warehouseId?: string;
  productId?: string;
}

function assertDateRange(query: Pick<ReportQuery, 'from' | 'to'>) {
  if (query.from && query.to && query.from > query.to) {
    throw new AppError(
      'from must be before or equal to to',
      400,
      'INVALID_DATE_RANGE',
    );
  }
}

export async function inventoryValuation(
  organizationId: string,
  query: ReportQuery,
) {
  assertDateRange(query);
  if (query.from || query.to) {
    throw new AppError(
      'Inventory valuation is a current balance snapshot; historical valuation is not available',
      400,
      'HISTORICAL_VALUATION_UNAVAILABLE',
    );
  }
  const where: Prisma.InventoryBalanceWhereInput = {
    organizationId,
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
  };
  const [balances, totalItems, totalValue] = await prisma.$transaction([
    prisma.inventoryBalance.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            unit: { select: { symbol: true } },
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
        location: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.inventoryBalance.count({ where }),
    prisma.$queryRaw<Array<{ value: Prisma.Decimal }>>(Prisma.sql`
      SELECT COALESCE(SUM(b."onHand" * b."averageCost"), 0) AS "value"
      FROM "InventoryBalance" b
      WHERE b."organizationId" = ${organizationId}::uuid
        ${query.warehouseId ? Prisma.sql`AND b."warehouseId" = ${query.warehouseId}::uuid` : Prisma.empty}
        ${query.productId ? Prisma.sql`AND b."productId" = ${query.productId}::uuid` : Prisma.empty}
    `),
  ]);
  const data = balances.map((balance) => ({
    ...balance,
    value: balance.onHand.mul(balance.averageCost),
    available: balance.onHand.sub(balance.reserved),
  }));
  const pageValue = data.reduce(
    (total, row) => total.add(row.value),
    new Prisma.Decimal(0),
  );
  return {
    data,
    summary: {
      pageValue,
      totalValue: totalValue[0]?.value ?? new Prisma.Decimal(0),
    },
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function movementReport(
  organizationId: string,
  query: ReportQuery,
) {
  assertDateRange(query);
  const where: Prisma.InventoryMovementWhereInput = {
    organizationId,
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };
  const [data, totalItems, counts] = await prisma.$transaction([
    prisma.inventoryMovement.findMany({
      where,
      include: {
        product: { select: { id: true, sku: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.groupBy({
      by: ['type'],
      orderBy: { type: 'asc' },
      where,
      _count: { _all: true },
      _sum: { quantityDelta: true },
    }),
  ]);
  return {
    data,
    summary: counts.map((item) => ({
      type: item.type,
      count:
        item._count && typeof item._count !== 'boolean'
          ? (item._count._all ?? 0)
          : 0,
      netQuantity: item._sum?.quantityDelta ?? new Prisma.Decimal(0),
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function lowStockReport(
  organizationId: string,
  query: ReportQuery,
) {
  const where = Prisma.sql`
    b."organizationId" = ${organizationId}::uuid
    AND p."isActive" = true
    AND b."onHand" - b."reserved" <= p."reorderLevel"
    ${query.warehouseId ? Prisma.sql`AND b."warehouseId" = ${query.warehouseId}::uuid` : Prisma.empty}
    ${query.productId ? Prisma.sql`AND b."productId" = ${query.productId}::uuid` : Prisma.empty}
  `;
  const [data, count] = await prisma.$transaction([
    prisma.$queryRaw<
      Array<{
        id: string;
        onHand: string;
        reserved: string;
        averageCost: string;
        available: string;
        reorderLevel: string;
        productId: string;
        sku: string;
        productName: string;
        unit: string;
        warehouseId: string;
        warehouseCode: string;
        warehouseName: string;
        locationId: string;
        locationCode: string;
        locationName: string;
      }>
    >(Prisma.sql`
      SELECT b."id", b."onHand"::text AS "onHand",
        b."reserved"::text AS "reserved", b."averageCost"::text AS "averageCost",
        (b."onHand" - b."reserved")::text AS "available",
        p."reorderLevel"::text AS "reorderLevel", p."id" AS "productId",
        p."sku", p."name" AS "productName", u."symbol" AS "unit",
        w."id" AS "warehouseId", w."code" AS "warehouseCode",
        w."name" AS "warehouseName", l."id" AS "locationId",
        l."code" AS "locationCode", l."name" AS "locationName"
      FROM "InventoryBalance" b
      JOIN "Product" p ON p."id" = b."productId"
      JOIN "UnitOfMeasure" u ON u."id" = p."unitId"
      JOIN "Warehouse" w ON w."id" = b."warehouseId"
      JOIN "WarehouseLocation" l ON l."id" = b."locationId"
      WHERE ${where}
      ORDER BY w."name", p."name"
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
    `),
    prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "total"
      FROM "InventoryBalance" b
      JOIN "Product" p ON p."id" = b."productId"
      WHERE ${where}
    `),
  ]);
  const totalItems = Number(count[0]?.total ?? 0);
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function importProcurementReport(
  organizationId: string,
  query: ReportQuery & { status?: string },
) {
  assertDateRange(query);
  const where: Prisma.PurchaseOrderWhereInput = {
    organizationId,
    procurementType: 'IMPORT' as const,
    ...(query.status ? { status: query.status as PurchaseStatus } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };
  const whereSql = Prisma.sql`
    "organizationId" = ${organizationId}::uuid
    AND "procurementType" = 'IMPORT'::"ProcurementType"
    ${query.status ? Prisma.sql`AND "status" = ${query.status}::"PurchaseStatus"` : Prisma.empty}
    ${query.warehouseId ? Prisma.sql`AND "warehouseId" = ${query.warehouseId}::uuid` : Prisma.empty}
    ${query.from ? Prisma.sql`AND "createdAt" >= ${query.from}` : Prisma.empty}
    ${query.to ? Prisma.sql`AND "createdAt" <= ${query.to}` : Prisma.empty}
  `;
  const [data, totalItems, totals] = await prisma.$transaction([
    prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: {
          select: { id: true, code: true, name: true, country: true },
        },
        warehouse: { select: { id: true, code: true, name: true } },
        items: {
          include: { product: { select: { id: true, sku: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.purchaseOrder.count({ where }),
    prisma.$queryRaw<
      Array<{
        currency: string;
        orders: bigint;
        sourceAmount: Prisma.Decimal;
        baseCurrencyAmount: Prisma.Decimal;
      }>
    >(Prisma.sql`
      SELECT "currency", COUNT(*)::bigint AS "orders",
        COALESCE(SUM("total"), 0) AS "sourceAmount",
        COALESCE(SUM("total" * "exchangeRate"), 0) AS "baseCurrencyAmount"
      FROM "PurchaseOrder"
      WHERE ${whereSql}
      GROUP BY "currency"
      ORDER BY "currency"
    `),
  ]);
  return {
    data,
    summary: {
      totalsByCurrency: totals.map((row) => ({
        currency: row.currency,
        orders: Number(row.orders),
        sourceAmount: row.sourceAmount,
        baseCurrencyAmount: row.baseCurrencyAmount,
      })),
    },
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function deliveryTrackingReport(
  organizationId: string,
  query: ReportQuery & { status?: 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' },
) {
  assertDateRange(query);
  const where: Prisma.SalesDeliveryWhereInput = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.warehouseId
      ? { salesOrder: { warehouseId: query.warehouseId } }
      : {}),
    ...(query.from || query.to
      ? {
          estimatedDeliveryAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };
  const [data, totalItems, overdueDeliveries, statusCounts] =
    await prisma.$transaction([
    prisma.salesDelivery.findMany({
        where,
        include: {
        salesOrder: {
          include: {
            customer: {
              select: { id: true, code: true, name: true, phone: true },
            },
            warehouse: { select: { id: true, code: true, name: true } },
          },
        },
        items: {
          include: {
            salesOrderItem: {
              include: {
                product: { select: { id: true, sku: true, name: true } },
              },
            },
          },
        },
      },
        orderBy: [{ estimatedDeliveryAt: 'asc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.salesDelivery.count({ where }),
      prisma.salesDelivery.count({
        where: {
          organizationId,
          status: 'IN_TRANSIT',
          estimatedDeliveryAt: { lt: new Date() },
        },
      }),
      prisma.salesDelivery.groupBy({
        by: ['status'],
        orderBy: { status: 'asc' },
        where: {
          organizationId,
        },
        _count: { _all: true },
      }),
    ]);
  return {
    data,
    summary: {
      overdueDeliveries,
      byStatus: statusCounts.map((row) => ({
        status: row.status,
        count:
          row._count && typeof row._count !== 'boolean'
            ? (row._count._all ?? 0)
            : 0,
      })),
    },
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

export async function customerOutstandingReport(
  organizationId: string,
  query: Pick<ReportQuery, 'page' | 'pageSize' | 'from' | 'to'>,
) {
  assertDateRange(query);
  const where: Prisma.SalesOrderWhereInput = {
    organizationId,
    customerId: { not: null },
    status: { not: 'CANCELLED' },
    paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };
  const [data, totalItems, summary] = await prisma.$transaction([
    prisma.salesOrder.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        currency: true,
        subtotal: true,
        discountAmount: true,
        taxAmount: true,
        total: true,
        paidAmount: true,
        paymentStatus: true,
        createdAt: true,
        customer: { select: { id: true, code: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.salesOrder.count({ where }),
    prisma.$queryRaw<Array<{ orderCount: bigint; outstanding: Prisma.Decimal }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "orderCount",
        COALESCE(SUM("total" - "paidAmount"), 0) AS "outstanding"
      FROM "SalesOrder"
      WHERE "organizationId" = ${organizationId}::uuid
        AND "customerId" IS NOT NULL
        AND "status" <> 'CANCELLED'::"SalesStatus"
        AND "paymentStatus" IN (
          'UNPAID'::"SalesPaymentStatus",
          'PARTIALLY_PAID'::"SalesPaymentStatus"
        )
        ${query.from ? Prisma.sql`AND "createdAt" >= ${query.from}` : Prisma.empty}
        ${query.to ? Prisma.sql`AND "createdAt" <= ${query.to}` : Prisma.empty}
    `),
  ]);
  return {
    data: data.map((order) => ({
      ...order,
      outstanding: order.total.sub(order.paidAmount),
    })),
    summary: {
      orderCount: Number(summary[0]?.orderCount ?? 0),
      outstanding: summary[0]?.outstanding ?? new Prisma.Decimal(0),
    },
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}
