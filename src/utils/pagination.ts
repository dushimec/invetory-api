import { z } from 'zod';
import { AppError } from './app-error.js';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pagination(query: unknown) {
  const parsed = paginationSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(
      'Invalid pagination parameters',
      400,
      'VALIDATION_ERROR',
    );
  }
  return {
    ...parsed.data,
    skip: (parsed.data.page - 1) * parsed.data.pageSize,
  };
}
