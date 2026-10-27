import { randomUUID } from 'node:crypto';
import {
  DocumentStatus,
  MovementType,
  Prisma,
  type Prisma as PrismaTypes,
} from '@prisma/client';
import { prisma } from '../config/db.js';
import { writeAuditEvent } from './audit.service.js';
import { AppError } from '../utils/app-error.js';

type Transaction = PrismaTypes.TransactionClient;

function adjustmentNumber() {
  return `ADJ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function decimal(value: string, allowNegative = false) {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    throw new AppError(
      'Adjustment quantity must be a decimal string',
      400,
      'VALIDATION_ERROR',
    );
  }
  if (
    !amount.isFinite() ||
    amount.isZero() ||
    (!allowNegative && amount.lt(0))
  ) {
    throw new AppError(
      'Adjustment quantity must be non-zero',
      400,
      'INVALID_QUANTITY',
    );
  }
  return amount;
}

async function lockAdjustment(
  tx: Transaction,
  organizationId: string,
  id: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "StockAdjustment"
    WHERE "id" = ${id}::uuid AND "organizationId" = ${organizationId}::uuid
    FOR UPDATE
  `);
  if (!rows.length)
    throw new AppError('Adjustment not found', 404, 'NOT_FOUND');
  return tx.stockAdjustment.findUniqueOrThrow({
    where: { id },
    include: {
      items: true,
      warehouse: { select: { id: true, name: true, code: true } },
    },
  });
}

async function audit(
  tx: Transaction,
  organizationId: string,
  actorId: string,
  action: string,
  id: string,
  requestId?: string,
) {
  await writeAuditEvent(tx, {
    organizationId,
    actorId,
    action,
    entityType: 'StockAdjustment',
    entityId: id,
    requestId,
  });
}

export async function createAdjustment(
  organizationId: string,
  actorId: string,
  input: {
    warehouseId: string;
    reason: string;
    items: Array<{ productId: string; locationId?: string; delta: string }>;
  },
  requestId?: string,
) {
  if (
    new Set(
      input.items.map((item) => `${item.productId}:${item.locationId ?? ''}`),
    ).size !== input.items.length
  ) {
    throw new AppError(
      'Duplicate adjustment lines are not supported',
      400,
      'DUPLICATE_LINE',
    );
  }
  return prisma.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!warehouse)
      throw new AppError('Warehouse not found', 404, 'INVALID_REFERENCE');
    const uniqueProductIds = [
      ...new Set(input.items.map((item) => item.productId)),
    ];
    const products = await tx.product.findMany({
      where: {
        organizationId,
        isActive: true,
        id: { in: uniqueProductIds },
      },
      select: { id: true },
    });
    if (products.length !== uniqueProductIds.length) {
      throw new AppError(
        'Product not found in this organization',
        404,
        'INVALID_REFERENCE',
      );
    }
    for (const item of input.items) {
      if (item.locationId) {
        const location = await tx.warehouseLocation.findFirst({
          where: {
            id: item.locationId,
            warehouseId: warehouse.id,
            isActive: true,
          },
          select: { id: true },
        });
        if (!location)
          throw new AppError(
            'Invalid adjustment location',
            400,
            'INVALID_LOCATION',
          );
      }
    }
    const adjustment = await tx.stockAdjustment.create({
      data: {
        organizationId,
        warehouseId: warehouse.id,
        number: adjustmentNumber(),
        reason: input.reason.trim(),
        requestedById: actorId,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            locationId: item.locationId,
            delta: decimal(item.delta, true),
            unitCost: 0,
          })),
        },
      },
      include: { items: true, warehouse: true },
    });
    await audit(
      tx,
      organizationId,
      actorId,
      'adjustment.created',
      adjustment.id,
      requestId,
    );
    return adjustment;
  });
}

export async function listAdjustments(
  organizationId: string,
  query: { page: number; pageSize: number; status?: DocumentStatus },
) {
  const where = {
    organizationId,
    ...(query.status ? { status: query.status } : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.stockAdjustment.findMany({
      where,
      include: {
        items: true,
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockAdjustment.count({ where }),
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

export async function getAdjustment(organizationId: string, id: string) {
  const adjustment = await prisma.stockAdjustment.findFirst({
    where: { id, organizationId },
    include: {
      items: {
        include: { product: { select: { id: true, sku: true, name: true } } },
      },
      warehouse: true,
    },
  });
  if (!adjustment) throw new AppError('Adjustment not found', 404, 'NOT_FOUND');
  return adjustment;
}

async function transition(
  organizationId: string,
  actorId: string,
  id: string,
  from: DocumentStatus[],
  to: DocumentStatus,
  action: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const adjustment = await lockAdjustment(tx, organizationId, id);
    if (!from.includes(adjustment.status)) {
      throw new AppError(
        'Adjustment is not in a valid state for this action',
        409,
        'INVALID_STATE',
      );
    }
    if (to === 'APPROVED') {
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId },
        select: { requireSeparationOfDuties: true },
      });
      if (!settings)
        throw new AppError(
          'Organization settings are missing',
          500,
          'CONFIGURATION_ERROR',
        );
      if (
        settings.requireSeparationOfDuties &&
        adjustment.requestedById === actorId
      ) {
        throw new AppError(
          'The adjustment creator cannot approve the same adjustment',
          403,
          'SEPARATION_OF_DUTIES',
        );
      }
    }
    const data =
      to === 'APPROVED'
        ? { status: to, approvedById: actorId }
        : { status: to };
    const updated = await tx.stockAdjustment.update({
      where: { id },
      data,
      include: { items: true, warehouse: true },
    });
    await audit(tx, organizationId, actorId, action, id, requestId);
    return updated;
  });
}

export function submitAdjustment(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return transition(
    orgId,
    actorId,
    id,
    ['DRAFT'],
    'SUBMITTED',
    'adjustment.submitted',
    requestId,
  );
}

export function approveAdjustment(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return transition(
    orgId,
    actorId,
    id,
    ['SUBMITTED'],
    'APPROVED',
    'adjustment.approved',
    requestId,
  );
}

export function cancelAdjustment(
  orgId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return transition(
    orgId,
    actorId,
    id,
    ['DRAFT', 'SUBMITTED', 'APPROVED'],
    'CANCELLED',
    'adjustment.cancelled',
    requestId,
  );
}

export async function postAdjustment(
  organizationId: string,
  actorId: string,
  id: string,
  requestId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const adjustment = await lockAdjustment(tx, organizationId, id);
    if (adjustment.status === 'POSTED') return adjustment;
    if (adjustment.status !== 'APPROVED') {
      throw new AppError(
        'Only approved adjustments can be posted',
        409,
        'INVALID_STATE',
      );
    }
    const settings = await tx.organizationSettings.findUnique({
      where: { organizationId },
      select: { allowNegativeStock: true },
    });
    if (!settings)
      throw new AppError(
        'Organization settings are missing',
        500,
        'CONFIGURATION_ERROR',
      );
    const defaultLocation = await tx.warehouseLocation.findFirst({
      where: {
        warehouseId: adjustment.warehouseId,
        code: 'MAIN',
        isActive: true,
      },
      select: { id: true },
    });
    if (!defaultLocation)
      throw new AppError(
        'Active MAIN location not found',
        409,
        'INVALID_LOCATION',
      );
    const items = [...adjustment.items].sort((a, b) =>
      `${a.productId}:${a.locationId ?? ''}`.localeCompare(
        `${b.productId}:${b.locationId ?? ''}`,
      ),
    );
    for (const item of items) {
      const locationId = item.locationId ?? defaultLocation.id;
      const key = {
        organizationId,
        productId: item.productId,
        warehouseId: adjustment.warehouseId,
        locationId,
      };
      await tx.inventoryBalance.upsert({
        where: { organizationId_productId_warehouseId_locationId: key },
        create: { ...key, onHand: 0, reserved: 0, averageCost: 0 },
        update: {},
      });
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "InventoryBalance"
        WHERE "organizationId" = ${organizationId}::uuid
          AND "productId" = ${item.productId}::uuid
          AND "warehouseId" = ${adjustment.warehouseId}::uuid
          AND "locationId" = ${locationId}::uuid
        FOR UPDATE
      `);
      const balance = await tx.inventoryBalance.findUniqueOrThrow({
        where: { organizationId_productId_warehouseId_locationId: key },
      });
      const after = balance.onHand.add(item.delta);
      if (after.lt(balance.reserved)) {
        throw new AppError(
          'Adjustment cannot reduce stock below reserved quantities',
          409,
          'RESERVED_STOCK',
        );
      }
      if (!settings.allowNegativeStock && after.lt(0)) {
        throw new AppError('Stock cannot be negative', 409, 'NEGATIVE_STOCK');
      }
      const type = item.delta.gt(0)
        ? MovementType.POSITIVE_ADJUSTMENT
        : MovementType.NEGATIVE_ADJUSTMENT;
      await tx.inventoryBalance.update({
        where: { organizationId_productId_warehouseId_locationId: key },
        data: { onHand: after },
      });
      await tx.inventoryMovement.create({
        data: {
          ...key,
          type,
          quantityDelta: item.delta,
          quantityBefore: balance.onHand,
          quantityAfter: after,
          unitCost: balance.averageCost,
          sourceType: 'stock_adjustment',
          sourceId: adjustment.id,
          idempotencyKey: `adjustment-${adjustment.id}-${item.id}`,
          requestHash: `${item.productId}:${item.delta.toString()}`,
          reason: adjustment.reason,
          actorId,
        },
      });
      await tx.stockAdjustmentItem.update({
        where: { id: item.id },
        data: { unitCost: balance.averageCost, locationId },
      });
    }
    const updated = await tx.stockAdjustment.update({
      where: { id },
      data: { status: 'POSTED', postedAt: new Date() },
      include: { items: true, warehouse: true },
    });
    await audit(
      tx,
      organizationId,
      actorId,
      'adjustment.posted',
      id,
      requestId,
    );
    return updated;
  });
}
