import type { RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';

export const categoryIdSchema = z.object({ id: z.string().uuid() }).strict();
export const categoryCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    parentId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const categoryUpdateSchema = categoryCreateSchema.partial().strict();

export const unitIdSchema = z.object({ id: z.string().uuid() }).strict();
export const unitCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    symbol: z.string().trim().min(1).max(16),
  })
  .strict();
export const unitUpdateSchema = unitCreateSchema.partial().strict();

async function assertCategoryParentIsValid(
  organizationId: string,
  categoryId: string,
  parentId: string | null | undefined,
): Promise<void> {
  if (parentId === undefined || parentId === null) return;
  if (parentId === categoryId) {
    throw new AppError(
      'Category cannot be its own parent',
      400,
      'INVALID_REFERENCE',
    );
  }

  const parent = await prisma.productCategory.findFirst({
    where: { id: parentId, organizationId },
    select: { id: true, parentId: true },
  });
  if (!parent) {
    throw new AppError(
      'Parent category does not belong to this organization',
      400,
      'INVALID_REFERENCE',
    );
  }

  let cursor: string | null = parent.parentId;
  while (cursor) {
    if (cursor === categoryId) {
      throw new AppError(
        'Category parent cannot create a circular reference',
        400,
        'INVALID_REFERENCE',
      );
    }
    const ancestor = await prisma.productCategory.findFirst({
      where: { id: cursor, organizationId },
      select: { parentId: true },
    });
    if (!ancestor) break;
    cursor = ancestor.parentId;
  }
}

export const listCategories: RequestHandler = async (req, res) => {
  const categories = await prisma.productCategory.findMany({
    where: { organizationId: req.auth!.organizationId },
    include: {
      _count: { select: { products: true, children: true } },
    },
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
  });
  success(res, 'Categories retrieved successfully', categories);
};

export const getCategoryById: RequestHandler = async (req, res) => {
  const category = await prisma.productCategory.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    include: {
      parent: true,
      children: { orderBy: { name: 'asc' } },
      _count: { select: { products: true, children: true } },
    },
  });
  if (!category) throw new AppError('Category not found', 404, 'NOT_FOUND');
  success(res, 'Category retrieved successfully', category);
};

export const createCategory: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  await assertCategoryParentIsValid(
    organizationId,
    req.body.parentId ?? '',
    req.body.parentId,
  );

  const category = await prisma.$transaction(async (tx) => {
    const created = await tx.productCategory.create({
      data: { ...req.body, organizationId },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'category.created',
        entityType: 'product_category',
        entityId: created.id,
        requestId: req.requestId,
        changes: { name: created.name, parentId: created.parentId },
      },
    });
    return created;
  });
  success(res, 'Category created successfully', category, 201);
};

export const updateCategory: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const id = String(req.params.id);
  const existing = await prisma.productCategory.findFirst({
    where: { id, organizationId },
    select: { id: true, parentId: true },
  });
  if (!existing) throw new AppError('Category not found', 404, 'NOT_FOUND');

  if (req.body.parentId !== undefined) {
    await assertCategoryParentIsValid(organizationId, id, req.body.parentId);
  }

  const category = await prisma.$transaction(async (tx) => {
    const updated = await tx.productCategory.update({
      where: { id },
      data: req.body,
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'category.updated',
        entityType: 'product_category',
        entityId: updated.id,
        requestId: req.requestId,
        changes: req.body,
      },
    });
    return updated;
  });

  success(res, 'Category updated successfully', category);
};

export const deleteCategory: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const id = String(req.params.id);
  const existing = await prisma.productCategory.findFirst({
    where: { id, organizationId },
    select: { id: true, name: true, parentId: true },
  });
  if (!existing) throw new AppError('Category not found', 404, 'NOT_FOUND');

  const category = await prisma.$transaction(async (tx) => {
    const deleted = await tx.productCategory.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'category.deleted',
        entityType: 'product_category',
        entityId: deleted.id,
        requestId: req.requestId,
        changes: { name: deleted.name, parentId: deleted.parentId },
      },
    });
    return deleted;
  });

  success(res, 'Category deleted successfully', {
    id: category.id,
    deletedAt: new Date().toISOString(),
  });
};

export const listUnits: RequestHandler = async (req, res) => {
  const units = await prisma.unitOfMeasure.findMany({
    where: { organizationId: req.auth!.organizationId },
    include: {
      _count: { select: { products: true } },
    },
    orderBy: { name: 'asc' },
  });
  success(res, 'Units retrieved successfully', units);
};

export const getUnitById: RequestHandler = async (req, res) => {
  const unit = await prisma.unitOfMeasure.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    include: { _count: { select: { products: true } } },
  });
  if (!unit) throw new AppError('Unit not found', 404, 'NOT_FOUND');
  success(res, 'Unit retrieved successfully', unit);
};

export const createUnit: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const unit = await prisma.$transaction(async (tx) => {
    const created = await tx.unitOfMeasure.create({
      data: { ...req.body, organizationId },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'unit.created',
        entityType: 'unit_of_measure',
        entityId: created.id,
        requestId: req.requestId,
      },
    });
    return created;
  });
  success(res, 'Unit created successfully', unit, 201);
};

export const updateUnit: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const id = String(req.params.id);
  const existing = await prisma.unitOfMeasure.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) throw new AppError('Unit not found', 404, 'NOT_FOUND');

  const unit = await prisma.$transaction(async (tx) => {
    const updated = await tx.unitOfMeasure.update({
      where: { id },
      data: req.body,
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'unit.updated',
        entityType: 'unit_of_measure',
        entityId: updated.id,
        requestId: req.requestId,
        changes: req.body,
      },
    });
    return updated;
  });

  success(res, 'Unit updated successfully', unit);
};

export const deleteUnit: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const id = String(req.params.id);
  const existing = await prisma.unitOfMeasure.findFirst({
    where: { id, organizationId },
    select: { id: true, name: true, symbol: true },
  });
  if (!existing) throw new AppError('Unit not found', 404, 'NOT_FOUND');

  const productCount = await prisma.product.count({
    where: { organizationId, unitId: id },
  });
  if (productCount > 0) {
    throw new AppError(
      'Unit is in use by products and cannot be deleted',
      409,
      'CONFLICT',
    );
  }

  const unit = await prisma.$transaction(async (tx) => {
    const deleted = await tx.unitOfMeasure.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: req.auth!.userId,
        action: 'unit.deleted',
        entityType: 'unit_of_measure',
        entityId: deleted.id,
        requestId: req.requestId,
        changes: { name: deleted.name, symbol: deleted.symbol },
      },
    });
    return deleted;
  });

  success(res, 'Unit deleted successfully', {
    id: unit.id,
    deletedAt: new Date().toISOString(),
  });
};
