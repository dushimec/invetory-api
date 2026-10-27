import type { RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';

export const warehouseCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    code: z.string().trim().min(1).max(30).toUpperCase(),
    address: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const warehouseList: RequestHandler = async (req, res) => {
  const warehouses = await prisma.warehouse.findMany({
    where: { organizationId: req.auth!.organizationId },
    include: {
      locations: { where: { isActive: true }, orderBy: { code: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });
  success(res, 'Warehouses retrieved successfully', warehouses);
};

export const warehouseCreate: RequestHandler = async (req, res) => {
  const warehouse = await prisma.$transaction(async (tx) => {
    const created = await tx.warehouse.create({
      data: {
        organizationId: req.auth!.organizationId,
        name: req.body.name,
        code: req.body.code,
        address: req.body.address,
        locations: { create: { code: 'MAIN', name: 'Main location' } },
      },
      include: { locations: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId: req.auth!.organizationId,
        actorId: req.auth!.userId,
        action: 'warehouse.created',
        entityType: 'warehouse',
        entityId: created.id,
        requestId: req.requestId,
        changes: { name: created.name, code: created.code },
      },
    });
    return created;
  });
  success(res, 'Warehouse created successfully', warehouse, 201);
};

export const warehouseStock: RequestHandler = async (req, res) => {
  const warehouse = await prisma.warehouse.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    select: { id: true },
  });
  if (!warehouse) throw new AppError('Warehouse not found', 404, 'NOT_FOUND');
  const balances = await prisma.inventoryBalance.findMany({
    where: {
      organizationId: req.auth!.organizationId,
      warehouseId: warehouse.id,
    },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          unit: { select: { symbol: true } },
        },
      },
      location: true,
    },
    orderBy: [{ product: { name: 'asc' } }, { location: { code: 'asc' } }],
  });
  success(res, 'Warehouse stock retrieved successfully', balances);
};
