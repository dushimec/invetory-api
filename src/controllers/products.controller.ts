import type { RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';
import { pagination } from '../utils/pagination.js';
import { nextProductSku } from '../utils/product-sku.js';
import { productListSchema } from '../validators/product.validator.js';

export const list: RequestHandler = async (req, res) => {
  const { page, pageSize, search, categoryId, active, sortBy, sortOrder } =
    productListSchema.parse(req.query);
  const { skip } = pagination({ page, pageSize });
  const where = {
    organizationId: req.auth!.organizationId,
    isActive: active !== 'false',
    ...(categoryId ? { categoryId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { sku: { contains: search, mode: 'insensitive' as const } },
            { barcode: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [items, totalItems] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: { category: true, unit: true },
    }),
    prisma.product.count({ where }),
  ]);
  res.json({
    success: true,
    message: 'Products retrieved successfully',
    data: items,
    meta: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  });
};

export const getById: RequestHandler = async (req, res) => {
  const product = await prisma.product.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    include: { category: true, unit: true },
  });
  if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
  success(res, 'Product retrieved successfully', product);
};

export const create: RequestHandler = async (req, res) => {
  const orgId = req.auth!.organizationId;
  const data = req.body;
  if (
    (new Prisma.Decimal(data.purchaseCost).gt(0) &&
      !req.auth!.permissions.includes('products.cost.update')) ||
    ((new Prisma.Decimal(data.sellingPrice).gt(0) ||
      (data.wholesalePrice && new Prisma.Decimal(data.wholesalePrice).gt(0))) &&
      !req.auth!.permissions.includes('products.price.update'))
  ) {
    throw new AppError(
      'You do not have permission to change product costs or prices',
      403,
      'FORBIDDEN',
    );
  }
  const [unit, category] = await Promise.all([
    prisma.unitOfMeasure.findFirst({
      where: { id: data.unitId, organizationId: orgId },
    }),
    data.categoryId
      ? prisma.productCategory.findFirst({
          where: { id: data.categoryId, organizationId: orgId },
        })
      : null,
  ]);
  if (!unit || (data.categoryId && !category)) {
    throw new AppError(
      'Unit or category does not belong to this organization',
      400,
      'INVALID_REFERENCE',
    );
  }
  const product = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Organization"
      WHERE "id" = ${orgId}::uuid
      FOR UPDATE
    `);
    let sku = data.sku;
    if (!sku) {
      const generatedSkus = await tx.product.findMany({
        where: {
          organizationId: orgId,
          sku: { startsWith: 'SKU-' },
        },
        select: { sku: true },
      });
      sku = nextProductSku(generatedSkus.map(({ sku }) => sku));
    }
    const created = await tx.product.create({
      data: { ...data, sku, organizationId: orgId },
      include: { category: true, unit: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: req.auth!.userId,
        action: 'product.created',
        entityType: 'product',
        entityId: created.id,
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        changes: { sku: created.sku, name: created.name },
      },
    });
    return created;
  });
  success(res, 'Product created successfully', product, 201);
};

export const update: RequestHandler = async (req, res) => {
  const orgId = req.auth!.organizationId;
  const existing = await prisma.product.findFirst({
    where: { id: String(req.params.id), organizationId: orgId },
  });
  if (!existing) throw new AppError('Product not found', 404, 'NOT_FOUND');
  const data = req.body;
  const changed = (
    next: string | null | undefined,
    current: Prisma.Decimal | null,
  ) => {
    if (next === undefined) return false;
    if (next === null) return current !== null;
    return current === null || !new Prisma.Decimal(next).eq(current);
  };
  const changesCost = changed(data.purchaseCost, existing.purchaseCost);
  const changesPrice =
    changed(data.sellingPrice, existing.sellingPrice) ||
    changed(data.wholesalePrice, existing.wholesalePrice);
  if (
    (changesCost && !req.auth!.permissions.includes('products.cost.update')) ||
    (changesPrice && !req.auth!.permissions.includes('products.price.update'))
  ) {
    throw new AppError(
      'You do not have permission to change product costs or prices',
      403,
      'FORBIDDEN',
    );
  }
  if (
    data.unitId &&
    !(await prisma.unitOfMeasure.findFirst({
      where: { id: data.unitId, organizationId: orgId },
    }))
  ) {
    throw new AppError(
      'Unit does not belong to this organization',
      400,
      'INVALID_REFERENCE',
    );
  }
  if (
    data.categoryId &&
    !(await prisma.productCategory.findFirst({
      where: { id: data.categoryId, organizationId: orgId },
    }))
  ) {
    throw new AppError(
      'Category does not belong to this organization',
      400,
      'INVALID_REFERENCE',
    );
  }
  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: existing.id },
      data,
      include: { category: true, unit: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorId: req.auth!.userId,
        action: 'product.updated',
        entityType: 'product',
        entityId: updated.id,
        requestId: req.requestId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        changes: data,
      },
    });
    return updated;
  });
  success(res, 'Product updated successfully', product);
};

export const archive: RequestHandler = async (req, res) => {
  const productId = String(req.params.id);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.product.updateMany({
      where: {
        id: productId,
        organizationId: req.auth!.organizationId,
        isActive: true,
      },
      data: { isActive: false, archivedAt: new Date() },
    });
    if (result.count) {
      await tx.auditLog.create({
        data: {
          organizationId: req.auth!.organizationId,
          actorId: req.auth!.userId,
          action: 'product.archived',
          entityType: 'product',
          entityId: productId,
          requestId: req.requestId,
        },
      });
    }
    return result;
  });
  if (!updated.count)
    throw new AppError(
      'Product not found or already archived',
      404,
      'NOT_FOUND',
    );
  success(res, 'Product archived successfully', {
    id: String(req.params.id),
    isActive: false,
  });
};

export const barcode: RequestHandler = async (req, res) => {
  const product = await prisma.product.findFirst({
    where: {
      organizationId: req.auth!.organizationId,
      barcode: String(req.params.barcode),
      isActive: true,
    },
    include: { category: true, unit: true },
  });
  if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
  success(res, 'Product retrieved successfully', product);
};
