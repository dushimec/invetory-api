import { z } from 'zod';

const positiveQuantity = z
  .string()
  .regex(/^\d{1,16}(?:\.\d{1,3})?$/)
  .refine((value) => Number(value) > 0);
const signedQuantity = z
  .string()
  .regex(/^-?\d{1,16}(?:\.\d{1,3})?$/)
  .refine((value) => Number(value) !== 0);
const cost = z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/);

export const receiveSchema = z
  .object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    quantity: positiveQuantity,
    unitCost: cost,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const issueSchema = z
  .object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    quantity: positiveQuantity,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const adjustmentSchema = z
  .object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    locationId: z.string().uuid().optional(),
    quantity: signedQuantity,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const inventoryListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    warehouseId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
  })
  .strict();
