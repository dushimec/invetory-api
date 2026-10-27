import { z } from 'zod';

export const adjustmentCreateSchema = z
  .object({
    warehouseId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1000),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            locationId: z.string().uuid().optional(),
            delta: z
              .string()
              .regex(/^-?\d{1,16}(?:\.\d{1,3})?$/)
              .refine(
                (value) => /[1-9]/.test(value),
                'Adjustment cannot be zero',
              ),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
