import { z } from 'zod';

const email = z.string().trim().email().max(254);
const uuid = z.string().uuid();

export const userCreateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email,
    temporaryPassword: z.string().min(12).max(128),
    roleId: uuid,
  })
  .strict();

export const usersListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'INVITED']).optional(),
  })
  .strict();

export const userParamsSchema = z.object({ id: uuid }).strict();

export const membershipUpdateSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    roleId: uuid.optional(),
  })
  .strict()
  .refine((value) => value.status !== undefined || value.roleId !== undefined, {
    message: 'At least one membership field must be updated',
  });
