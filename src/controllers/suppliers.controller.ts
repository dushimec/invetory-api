import type { RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';

const supplierFields = {
  code: z.string().trim().min(1).max(40).toUpperCase(),
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(160).nullable().optional(),
  email: z.string().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  country: z.string().trim().max(100).default('Rwanda'),
  taxId: z.string().trim().max(100).nullable().optional(),
  paymentTerms: z.string().trim().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export const supplierCreateSchema = z.object(supplierFields).strict();
export const supplierUpdateSchema = z.object(supplierFields).partial().strict();
export const supplierIdSchema = z.object({ id: z.string().uuid() }).strict();
export const supplierListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
  })
  .strict();

export const list: RequestHandler = async (req, res) => {
  const query = supplierListSchema.parse(req.query);
  const where = {
    organizationId: req.auth!.organizationId,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { code: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.supplier.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { name: 'asc' },
    }),
    prisma.supplier.count({ where }),
  ]);
  res.json({
    success: true,
    message: 'Suppliers retrieved successfully',
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  });
};

export const getById: RequestHandler = async (req, res) => {
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    include: { _count: { select: { purchases: true, receipts: true } } },
  });
  if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
  success(res, 'Supplier retrieved successfully', supplier);
};

export const create: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const supplier = await prisma.$transaction(async (tx) => {
    const record = await tx.supplier.create({
      data: { ...req.body, organizationId },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'supplier.created',
        entityType: 'supplier',
        entityId: record.id,
        requestId: req.requestId,
        changes: { code: record.code, name: record.name },
      },
    });
    return record;
  });
  success(res, 'Supplier created successfully', supplier, 201);
};

export const update: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const id = String(req.params.id);
  const supplier = await prisma.$transaction(async (tx) => {
    const existing = await tx.supplier.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
    const updated = await tx.supplier.update({ where: { id }, data: req.body });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'supplier.updated',
        entityType: 'supplier',
        entityId: id,
        requestId: req.requestId,
        changes: req.body,
      },
    });
    return updated;
  });
  success(res, 'Supplier updated successfully', supplier);
};

export const purchases: RequestHandler = async (req, res) => {
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    select: { id: true },
  });
  if (!supplier) throw new AppError('Supplier not found', 404, 'NOT_FOUND');
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      organizationId: req.auth!.organizationId,
      supplierId: supplier.id,
    },
    include: { warehouse: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  success(res, 'Supplier purchase history retrieved successfully', orders);
};
