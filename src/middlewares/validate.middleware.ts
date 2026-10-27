import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/app-error.js';

export function validate(
  schema: z.ZodType,
  source: 'body' | 'params' | 'query' = 'body',
): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      next(
        new AppError(
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    if (source === 'body') req.body = parsed.data;
    if (source === 'params') req.params = parsed.data as typeof req.params;
    next();
  };
}
