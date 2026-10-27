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
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one organization setting must be provided',
  });
