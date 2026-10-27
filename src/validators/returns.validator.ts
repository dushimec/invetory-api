import { z } from 'zod';

const uuid = z.string().uuid();
const quantity = z
  .string()
  .regex(/^\d{1,16}(?:\.\d{1,3})?$/)
  .refine((value) => /[1-9]/.test(value), 'Quantity must be greater than zero');

export const returnCreateSchema = z
  .object({
    type: z.enum(['CUSTOMER', 'SUPPLIER']),
    warehouseId: uuid,
    salesOrderId: uuid.optional(),
    purchaseOrderId: uuid.optional(),
    reason: z.string().trim().min(3).max(1000),
    items: z
      .array(
        z
          .object({
            productId: uuid,
            locationId: uuid.optional(),
            quantity,
            serialNumbers: z
              .array(z.string().trim().min(1).max(160))
              .max(500)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .superRefine((value, context) => {
    const validSource =
      value.type === 'CUSTOMER'
        ? Boolean(value.salesOrderId) && !value.purchaseOrderId
        : Boolean(value.purchaseOrderId) && !value.salesOrderId;
    if (!validSource) {
      context.addIssue({
        code: 'custom',
        message:
          'Customer returns require only salesOrderId; supplier returns require only purchaseOrderId',
        path: ['type'],
      });
    }
  });

export const returnListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(['CUSTOMER', 'SUPPLIER']).optional(),
    status: z
      .enum([
        'DRAFT',
        'SUBMITTED',
        'APPROVED',
        'POSTED',
        'CANCELLED',
        'REVERSED',
      ])
      .optional(),
  })
  .strict();

export const returnParamsSchema = z.object({ id: uuid }).strict();
