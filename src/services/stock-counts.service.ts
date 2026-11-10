import { randomUUID } from 'node:crypto';
import { MovementType, Prisma, type Prisma as PrismaTypes } from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { writeAuditEvent } from './audit.service.js';

type Transaction = PrismaTypes.TransactionClient;

function countNumber() {
  return `SC-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function nonNegativeQuantity(value: string) {
  let quantity: Prisma.Decimal;
  try {
    quantity = new Prisma.Decimal(value);
  } catch {
    throw new AppError('Counted quantity must be a decimal string', 400, 'VALIDATION_ERROR');
  }
  if (!quantity.isFinite() || quantity.lt(0)) {
    throw new AppError('Counted quantity cannot be negative', 400, 'INVALID_QUANTITY');
  }
  return quantity;
}

async function lockCount(tx: Transaction, organizationId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "StockCount"
    WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `);
  if (!rows.length) throw new AppError('Stock count not found', 404, 'NOT_FOUND');
  return tx.stockCount.findUniqueOrThrow({
    where: { id },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
      },
    },
  });
}

async function lockBalance(
  tx: Transaction,
  key: {
    organizationId: string;
    productId: string;
    warehouseId: string;
    locationId: string;
  },
) {
  await tx.inventoryBalance.upsert({
    where: { organizationId_productId_warehouseId_locationId: key },
    create: { ...key, onHand: 0, reserved: 0, averageCost: 0 },
    update: {},
  });
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "InventoryBalance"
    WHERE "organizationId" = ${key.organizationId}::uuid
      AND "productId" = ${key.productId}::uuid
      AND "warehouseId" = ${key.warehouseId}::uuid
      AND "locationId" = ${key.locationId}::uuid
    FOR UPDATE
  `);
  return tx.inventoryBalance.findUniqueOrThrow({
    where: { organizationId_productId_warehouseId_locationId: key },
  });
}

async function audit(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  action: string,
  id: string,
  requestId?: string,
  changes?: PrismaTypes.InputJsonValue,
) {
  await writeAuditEvent(tx, {
    organizationId,
    actorId,
    action,
    entityType: 'StockCount',
    entityId: id,
    requestId,
    changes,
  });
}

export async function createStockCount(
  organizationId: string,
  actorId: string,
  input: {
    warehouseId: string;
    reason?: string;
    items: Array<{ productId: string; locationId?: string }>;
  },
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!warehouse) throw new AppError('Warehouse not found', 404, 'INVALID_REFERENCE');

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await tx.product.findMany({
      where: { organizationId, isActive: true, id: { in: productIds } },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new AppError('One or more products are invalid for this organization', 400, 'INVALID_REFERENCE');
    }

    const defaultLocation = await tx.warehouseLocation.findFirst({
      where: { warehouseId: warehouse.id, code: 'MAIN', isActive: true },
      select: { id: true },
    });
    const resolvedLines: Array<{ productId: string; locationId: string }> = [];
    for (const item of input.items) {
      const locationId = item.locationId ?? defaultLocation?.id;
      if (!locationId) {
        throw new AppError('An active location is required for every count line', 400, 'INVALID_LOCATION');
      }
      const location = await tx.warehouseLocation.findFirst({
        where: { id: locationId, warehouseId: warehouse.id, isActive: true },
        select: { id: true },
      });
      if (!location) throw new AppError('Count location is invalid for this warehouse', 400, 'INVALID_LOCATION');
      resolvedLines.push({ productId: item.productId, locationId: location.id });
    }
    if (new Set(resolvedLines.map((item) => `${item.productId}:${item.locationId}`)).size !== resolvedLines.length) {
      throw new AppError('Duplicate product and location lines are not supported', 400, 'DUPLICATE_LINE');
    }
    resolvedLines.sort((a, b) =>
      a.productId.localeCompare(b.productId) ||
      a.locationId.localeCompare(b.locationId),
    );

    const lines: Array<{ productId: string; locationId: string; systemQuantity: Prisma.Decimal }> = [];
    for (const item of resolvedLines) {
      const balanceKey = {
        organizationId,
        productId: item.productId,
        warehouseId: warehouse.id,
        locationId: item.locationId,
      };
      await tx.inventoryBalance.upsert({
        where: {
          organizationId_productId_warehouseId_locationId: balanceKey,
        },
        create: { ...balanceKey, onHand: 0, reserved: 0, averageCost: 0 },
        update: {},
      });
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "InventoryBalance"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "productId" = ${item.productId}::uuid
          AND "warehouseId" = ${warehouse.id}::uuid
          AND "locationId" = ${item.locationId}::uuid
        FOR UPDATE
      `);
      const balance = await tx.inventoryBalance.findUnique({
        where: {
          organizationId_productId_warehouseId_locationId: balanceKey,
        },
        select: { onHand: true },
      });
      lines.push({
        productId: item.productId,
        locationId: item.locationId,
        systemQuantity: balance?.onHand ?? new Prisma.Decimal(0),
      });
    }

    const count = await tx.stockCount.create({
      data: {
        organizationId,
        warehouseId: warehouse.id,
        number: countNumber(),
        reason: input.reason?.trim(),
        createdById: actorId,
        items: { create: lines },
      },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true } },
            location: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    await audit(tx, organizationId, actorId, 'stock_count.created', count.id, requestId);
    return count;
  });
}

export async function listStockCounts(
  organizationId: string,
  query: { page: number; pageSize: number; status?: string; warehouseId?: string },
) {
  const where = {
    organizationId,
    ...(query.status ? { status: query.status as PrismaTypes.EnumStockCountStatusFilter } : {}),
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.stockCount.findMany({
      where,
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockCount.count({ where }),
  ]);
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

export async function getStockCount(organizationId: string, id: string) {
  const count = await prisma.stockCount.findFirst({
    where: { id, organizationId },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      items: {
        include: {
          product: { select: { id: true, sku: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
      },
    },
  });
  if (!count) throw new AppError('Stock count not found', 404, 'NOT_FOUND');
  return {
    ...count,
    items: count.items.map((item) => ({
      ...item,
      discrepancy: item.countedQuantity?.sub(item.systemQuantity) ?? null,
    })),
  };
}

export async function recordStockCountQuantity(
  organizationId: string,
  actorId: string,
  id: string,
  itemId: string,
  countedQuantity: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, organizationId, id);
    if (count.status !== 'DRAFT') {
      throw new AppError('Counts can only be recorded on a draft stock count', 409, 'INVALID_STATE');
    }
    const item = count.items.find(({ id: currentId }) => currentId === itemId);
    if (!item) throw new AppError('Stock count line not found', 404, 'NOT_FOUND');
    const quantity = nonNegativeQuantity(countedQuantity);
    const balance = await lockBalance(tx, {
      organizationId,
      productId: item.productId,
      warehouseId: count.warehouseId,
      locationId: item.locationId,
    });
    const updatedItem = await tx.stockCountItem.update({
      where: { id: itemId },
      data: {
        systemQuantity: balance.onHand,
        countedQuantity: quantity,
      },
    });
    await audit(tx, organizationId, actorId, 'stock_count.quantity_recorded', id, requestId, {
      itemId,
      countedQuantity: quantity.toString(),
    });
    return {
      ...count,
      items: count.items.map((current) =>
        current.id === itemId
          ? {
              ...current,
              ...updatedItem,
              discrepancy: quantity.sub(current.systemQuantity),
            }
          : {
              ...current,
              discrepancy:
                current.countedQuantity?.sub(current.systemQuantity) ?? null,
            },
      ),
    };
  });
}

export async function submitStockCount(
  organizationId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, organizationId, id);
    if (count.status !== 'DRAFT') throw new AppError('Only draft stock counts can be submitted', 409, 'INVALID_STATE');
    if (!count.items.length || count.items.some((item) => item.countedQuantity === null)) {
      throw new AppError('Record a physical quantity for every count line before submitting', 400, 'COUNT_INCOMPLETE');
    }
    const updated = await tx.stockCount.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    await audit(tx, organizationId, actorId, 'stock_count.submitted', id, requestId);
    return updated;
  });
}

async function reviewStockCount(
  organizationId: string,
  actorId: string,
  id: string,
  outcome: 'APPROVED' | 'REJECTED',
  reason?: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, organizationId, id);
    if (count.status !== 'SUBMITTED') throw new AppError('Only submitted stock counts can be reviewed', 409, 'INVALID_STATE');
    const settings = await tx.organizationSettings.findUnique({
      where: { organizationId },
      select: { requireSeparationOfDuties: true },
    });
    if (!settings) throw new AppError('Organization settings are missing', 500, 'CONFIGURATION_ERROR');
    if (settings.requireSeparationOfDuties && count.createdById === actorId) {
      throw new AppError('The count creator cannot review the same stock count', 403, 'SEPARATION_OF_DUTIES');
    }
    const updated = await tx.stockCount.update({
      where: { id },
      data: {
        status: outcome,
        reviewedAt: new Date(),
        reviewedById: actorId,
        ...(outcome === 'REJECTED' ? { reviewReason: reason?.trim() } : {}),
      },
    });
    await audit(tx, organizationId, actorId, `stock_count.${outcome.toLowerCase()}`, id, requestId, {
      ...(reason ? { reason: reason.trim() } : {}),
    });
    return updated;
  });
}

export function approveStockCount(organizationId: string, actorId: string, id: string, requestId?: string) {
  return reviewStockCount(organizationId, actorId, id, 'APPROVED', undefined, requestId);
}

export function rejectStockCount(organizationId: string, actorId: string, id: string, reason: string, requestId?: string) {
  return reviewStockCount(organizationId, actorId, id, 'REJECTED', reason, requestId);
}

export async function postStockCount(
  organizationId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const count = await lockCount(tx, organizationId, id);
    if (count.status === 'POSTED') return count;
    if (count.status !== 'APPROVED') throw new AppError('Only approved stock counts can be posted', 409, 'INVALID_STATE');
    for (const item of count.items) {
      if (item.countedQuantity === null) {
        throw new AppError('Approved count contains an uncounted line', 409, 'COUNT_INCOMPLETE');
      }
      const key = {
        organizationId,
        productId: item.productId,
        warehouseId: count.warehouseId,
        locationId: item.locationId,
      };
      const balance = await lockBalance(tx, key);
      const delta = item.countedQuantity.sub(item.systemQuantity);
      if (delta.isZero()) continue;
      const after = balance.onHand.add(delta);
      if (after.lt(balance.reserved)) {
        throw new AppError(
          `The count correction for ${item.product.name} would reduce stock below its reserved quantity`,
          409,
          'RESERVED_STOCK',
        );
      }
      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHand: after },
      });
      await tx.inventoryMovement.create({
        data: {
          ...key,
          type: MovementType.STOCK_COUNT,
          quantityDelta: delta,
          quantityBefore: balance.onHand,
          quantityAfter: after,
          unitCost: balance.averageCost,
          sourceType: 'stock_count',
          sourceId: count.id,
          idempotencyKey: `stock-count-${count.id}-${item.id}`,
          requestHash: `${item.productId}:${item.locationId}:${item.countedQuantity.toString()}`,
          actorId,
          reason: `Stock count ${count.number}`,
        },
      });
    }
    const updated = await tx.stockCount.update({
      where: { id },
      data: { status: 'POSTED', postedAt: new Date(), postedById: actorId },
      include: { items: true },
    });
    await audit(tx, organizationId, actorId, 'stock_count.posted', id, requestId, {
      lineCount: count.items.length,
    });
    return updated;
  });
}
