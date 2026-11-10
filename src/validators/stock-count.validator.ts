import { z } from 'zod';

const uuid = z.string().uuid();

export const stockCountCreateSchema = z
  .object({
    warehouseId: uuid,
    reason: z.string().trim().max(1000).optional(),
    items: z
      .array(
        z
          .object({
            productId: uuid,
            locationId: uuid.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export const stockCountQuantitySchema = z
  .object({
    countedQuantity: z
      .string()
      .regex(/^\d{1,16}(?:\.\d{1,3})?$/, 'Enter a non-negative quantity with up to 3 decimal places'),
  })
  .strict();

export const stockCountRejectSchema = z
  .object({ reason: z.string().trim().min(3).max(1000) })
  .strict();

export const stockCountListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED']).optional(),
    warehouseId: uuid.optional(),
  })
  .strict();

export const stockCountParamsSchema = z
  .object({ id: uuid })
  .strict();

export const stockCountItemParamsSchema = z
  .object({ id: uuid, itemId: uuid })
  .strict();
