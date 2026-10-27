import { z } from 'zod';

const permissionKey = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
  .max(80);

export const roleCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).default(''),
    duties: z.array(z.string().trim().min(3).max(200)).min(1).max(20),
    permissions: z.array(permissionKey).max(100).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.permissions).size !== value.permissions.length) {
      context.addIssue({
        code: 'custom',
        message: 'Permission keys must be unique',
        path: ['permissions'],
      });
    }
  });

export const roleUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    duties: z.array(z.string().trim().min(3).max(200)).min(1).max(20).optional(),
    permissions: z.array(permissionKey).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.name === undefined &&
      value.description === undefined &&
      value.duties === undefined &&
      value.permissions === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'At least one role field must be updated',
      });
    }
    if (
      value.permissions &&
      new Set(value.permissions).size !== value.permissions.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Permission keys must be unique',
        path: ['permissions'],
      });
    }
  });

export const roleParamsSchema = z.object({ id: z.string().uuid() }).strict();
