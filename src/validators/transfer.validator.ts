import { z } from 'zod';

const uuid = z.string().uuid();
const quantity = z
  .string()
  .regex(/^\d{1,16}(?:\.\d{1,3})?$/)
  .refine((value) => /[1-9]/.test(value), 'Quantity must be greater than zero');

export const transferCreateSchema = z
  .object({
    sourceWarehouseId: uuid,
    destinationWarehouseId: uuid,
    items: z
      .array(z.object({ productId: uuid, quantity }).strict())
      .min(1)
      .max(500),
  })
  .strict();

export const transferListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum([
        'DRAFT',
        'SUBMITTED',
        'APPROVED',
        'IN_TRANSIT',
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'CANCELLED',
      ])
      .optional(),
  })
  .strict();

export const transferParamsSchema = z.object({ id: uuid }).strict();

export const transferReceiveSchema = z
  .object({
    items: z
      .array(z.object({ transferItemId: uuid, quantity }).strict())
      .min(1)
      .max(500),
  })
  .strict();
