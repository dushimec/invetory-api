import { z } from 'zod';

const decimal = z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/);
const quantity = z.string().regex(/^\d{1,16}(?:\.\d{1,3})?$/);
const base = z
  .object({
    sku: z.string().trim().min(1).max(80),
    barcode: z.string().trim().max(120).nullable().optional(),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullable().optional(),
    brand: z.string().trim().max(120).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    unitId: z.string().uuid(),
    purchaseCost: decimal.default('0'),
    sellingPrice: decimal.default('0'),
    wholesalePrice: decimal.nullable().optional(),
    reorderLevel: quantity.default('0'),
    minimumStock: quantity.default('0'),
    maximumStock: quantity.nullable().optional(),
    trackingMode: z
      .enum(['NONE', 'BATCH', 'SERIAL', 'EXPIRY', 'BATCH_EXPIRY'])
      .default('NONE'),
  })
  .strict();

export const createProductSchema = base.extend({
  sku: base.shape.sku.optional(),
});
export const updateProductSchema = base.partial().strict();
export const productParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const productListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    categoryId: z.string().uuid().optional(),
    active: z.enum(['true', 'false']).optional(),
    sortBy: z
      .enum(['name', 'sku', 'createdAt', 'sellingPrice'])
      .default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
