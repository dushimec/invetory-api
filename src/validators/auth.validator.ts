import { z } from 'zod';

const password = z.string().min(12).max(128);
const email = z.string().trim().email().max(254);

export const registerSchema = z
  .object({
    organizationName: z.string().trim().min(2).max(120),
    organizationSlug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(60),
    fullName: z.string().trim().min(2).max(120),
    email,
    password,
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    organizationSlug: z.string().trim().toLowerCase().min(2).max(60),
  })
  .strict();

export const refreshSchema = z
  .object({ refreshToken: z.string().min(20).max(4096) })
  .strict();

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });
