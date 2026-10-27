import { z } from 'zod';

const decimal = z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/);
const quantity = z
  .string()
  .regex(/^\d{1,16}(?:\.\d{1,3})?$/)
  .refine((value) => /[1-9]/.test(value), 'Quantity must be greater than zero');
const exchangeRate = z
  .string()
  .regex(/^\d{1,12}(?:\.\d{1,8})?$/)
  .refine(
    (value) => Number(value) > 0,
    'Exchange rate must be greater than zero',
  );
const uuid = z.string().uuid();

export const purchaseOrderCreateSchema = z
  .object({
    supplierId: uuid,
    warehouseId: uuid,
    procurementType: z.enum(['LOCAL', 'IMPORT']).default('LOCAL'),
    expectedAt: z.string().datetime().optional(),
    currency: z
      .string()
      .length(3)
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    exchangeRate: exchangeRate.optional(),
    freightCost: decimal.default('0'),
    customsCost: decimal.default('0'),
    insuranceCost: decimal.default('0'),
    otherLandedCost: decimal.default('0'),
    originCountry: z.string().trim().min(2).max(100).optional(),
    shipmentReference: z.string().trim().max(100).optional(),
    incoterm: z.string().trim().max(20).optional(),
    notes: z.string().max(2000).optional(),
    items: z
      .array(
        z.object({ productId: uuid, quantity, unitCost: decimal }).strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export const purchaseOrderListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum([
        'DRAFT',
        'SUBMITTED',
        'APPROVED',
        'PARTIALLY_RECEIVED',
        'FULLY_RECEIVED',
        'CANCELLED',
        'REJECTED',
        'CLOSED',
      ])
      .optional(),
    supplierId: uuid.optional(),
  })
  .strict();

export const purchaseOrderParamsSchema = z.object({ id: uuid }).strict();

export const receiptCreateSchema = z
  .object({
    invoiceNumber: z.string().trim().max(100).optional(),
    deliveryNote: z.string().trim().max(100).optional(),
    items: z
      .array(
        z
          .object({
            purchaseOrderItemId: uuid,
            quantity,
            locationId: uuid.optional(),
            unitCost: decimal.optional(),
            batchNumber: z.string().trim().min(1).max(100).optional(),
            expiryDate: z.string().datetime().optional(),
            serialNumbers: z
              .array(z.string().trim().min(1).max(160))
              .max(500)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

export const goodsReceiptListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const salesOrderCreateSchema = z
  .object({
    customerId: uuid.optional(),
    warehouseId: uuid,
    deliveryAddress: z.string().trim().max(500).optional(),
    estimatedDeliveryAt: z.string().datetime().optional(),
    notes: z.string().max(2000).optional(),
    items: z
      .array(z.object({ productId: uuid, quantity }).strict())
      .min(1)
      .max(500),
  })
  .strict();

export const salesDeliveryUpdateSchema = z
  .object({
    status: z.enum(['IN_TRANSIT', 'DELIVERED', 'FAILED']),
    deliveryAddress: z.string().trim().max(500).nullable().optional(),
    carrier: z.string().trim().max(120).nullable().optional(),
    driverName: z.string().trim().max(160).nullable().optional(),
    driverPhone: z.string().trim().max(40).nullable().optional(),
    trackingReference: z.string().trim().max(120).nullable().optional(),
    estimatedDeliveryAt: z.string().datetime().nullable().optional(),
    proofOfDelivery: z.string().url().max(2000).nullable().optional(),
  })
  .strict();

export const salesDeliveryParamsSchema = z
  .object({ id: uuid, deliveryId: uuid })
  .strict();

export const salesOrderListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum([
        'DRAFT',
        'CONFIRMED',
        'RESERVED',
        'PARTIALLY_FULFILLED',
        'FULFILLED',
        'COMPLETED',
        'CANCELLED',
      ])
      .optional(),
    warehouseId: uuid.optional(),
  })
  .strict();

export const dispatchSchema = z
  .object({
    items: z
      .array(z.object({ productId: uuid, quantity }).strict())
      .min(1)
      .max(500)
      .optional(),
  })
  .strict();
