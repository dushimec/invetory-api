import type { RequestHandler } from 'express';
import { prisma } from '../config/db.js';
import {
  postStockMovement,
  reconcileInventory,
  type StockOperation,
} from '../services/inventory.service.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';
import { inventoryListSchema } from '../validators/inventory.validator.js';

export function postMovement(operation: StockOperation): RequestHandler {
  return async (req, res) => {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey)
      throw new AppError(
        'Idempotency-Key header is required',
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    const result = await postStockMovement({
      ...req.body,
      operation,
      organizationId: req.auth!.organizationId,
      actorId: req.auth!.userId,
      idempotencyKey,
      requestId: req.requestId,
    });
    success(res, 'Inventory movement posted successfully', result, 201);
  };
}

export const balances: RequestHandler = async (req, res) => {
  const query = inventoryListSchema.parse(req.query);
  const where = {
    organizationId: req.auth!.organizationId,
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.inventoryBalance.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            unit: { select: { symbol: true } },
          },
        },
        warehouse: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
    }),
    prisma.inventoryBalance.count({ where }),
  ]);
  res.json({
    success: true,
    message: 'Inventory balances retrieved successfully',
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  });
};

export const movements: RequestHandler = async (req, res) => {
  const query = inventoryListSchema.parse(req.query);
  const where = {
    organizationId: req.auth!.organizationId,
    ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
  };

  const [data, totalItems] = await prisma.$transaction([
    prisma.inventoryMovement.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        product: { select: { sku: true, name: true } },
        warehouse: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.inventoryMovement.count({ where }),
  ]);
  res.json({
    success: true,
    message: 'Inventory movements retrieved successfully',
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  });
};

export const reconciliation: RequestHandler = async (req, res) => {
  const mismatches = await reconcileInventory(req.auth!.organizationId);
  success(res, 'Inventory ledger reconciliation completed', {
    matched: mismatches.length === 0,
    mismatchCount: mismatches.length ? Number(mismatches[0]!.mismatchCount) : 0,
    maximumReturned: 100,
    mismatches: mismatches.map(({ mismatchCount: _count, ...row }) => row),
    checkedAt: new Date().toISOString(),
  });
};
