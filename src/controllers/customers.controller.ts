import type { RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';

const customerFields = {
  code: z.string().trim().min(1).max(40).toUpperCase(),
  name: z.string().trim().min(1).max(160),
  email: z.string().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  country: z.string().trim().max(100).default('Rwanda'),
  taxId: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export const customerCreateSchema = z.object(customerFields).strict();
export const customerUpdateSchema = z.object(customerFields).partial().strict();
export const customerIdSchema = z.object({ id: z.string().uuid() }).strict();
export const customerListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
  })
  .strict();

export const list: RequestHandler = async (req, res) => {
  const query = customerListSchema.parse(req.query);
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
    prisma.customer.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { name: 'asc' },
    }),
    prisma.customer.count({ where }),
  ]);
  res.json({
    success: true,
    message: 'Customers retrieved successfully',
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
  const customer = await prisma.customer.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    include: { _count: { select: { sales: true } } },
  });
  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  success(res, 'Customer retrieved successfully', customer);
};

export const create: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const customer = await prisma.$transaction(async (tx) => {
    const record = await tx.customer.create({
      data: { ...req.body, organizationId },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'customer.created',
        entityType: 'customer',
        entityId: record.id,
        requestId: req.requestId,
        changes: { code: record.code, name: record.name },
      },
    });
    return record;
  });
  success(res, 'Customer created successfully', customer, 201);
};

export const update: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const id = String(req.params.id);
  const customer = await prisma.$transaction(async (tx) => {
    const existing = await tx.customer.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new AppError('Customer not found', 404, 'NOT_FOUND');
    const updated = await tx.customer.update({ where: { id }, data: req.body });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: id,
        requestId: req.requestId,
        changes: req.body,
      },
    });
    return updated;
  });
  success(res, 'Customer updated successfully', customer);
};

export const salesHistory: RequestHandler = async (req, res) => {
  const customer = await prisma.customer.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    select: { id: true },
  });
  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  const sales = await prisma.salesOrder.findMany({
    where: {
      organizationId: req.auth!.organizationId,
      customerId: customer.id,
    },
    include: { warehouse: true, items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  success(res, 'Customer sales history retrieved successfully', sales);
};
