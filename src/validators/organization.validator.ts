import { z } from 'zod';

export const organizationSettingsUpdateSchema = z
  .object({
    businessName: z.string().trim().min(1).max(160).optional(),
    address: z.string().trim().max(500).nullable().optional(),
    logoUrl: z.string().url().max(2000).nullable().optional(),
    timezone: z.string().trim().min(1).max(100).optional(),
    allowNegativeStock: z.boolean().optional(),
    requirePurchaseApproval: z.boolean().optional(),
    requireSeparationOfDuties: z.boolean().optional(),
    salesTaxRate: z
      .string()
      .regex(/^\d{1,3}(?:\.\d{1,4})?$/)
      .refine((value) => Number(value) <= 100, 'Sales tax rate cannot exceed 100%')
      .optional(),
    maxSalesDiscountPercent: z
      .string()
      .regex(/^\d{1,3}(?:\.\d{1,4})?$/)
      .refine((value) => Number(value) <= 100, 'Maximum discount cannot exceed 100%')
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one organization setting must be provided',
  });
