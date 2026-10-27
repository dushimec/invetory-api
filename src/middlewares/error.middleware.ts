import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/app-error.js';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError('Route not found', 404, 'NOT_FOUND'));
};

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  _next,
) => {
  let appError = error instanceof AppError ? error : undefined;
  if (error instanceof ZodError) {
    appError = new AppError(
      'Validation failed',
      400,
      'VALIDATION_ERROR',
      error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    appError = new AppError(
      'A record with these values already exists',
      409,
      'CONFLICT',
    );
  } else if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    appError = new AppError(
      'The requested record was not found',
      404,
      'NOT_FOUND',
    );
  }

  if (!appError) {
    logger.error(
      { err: error, requestId: req.requestId },
      'Unhandled request error',
    );
    appError = new AppError('Internal server error', 500, 'INTERNAL_ERROR');
  }
  res.status(appError.statusCode).json({
    success: false,
    message: appError.message,
    code: appError.code,
    errors: appError.errors ?? [],
    requestId: req.requestId,
    ...(env.NODE_ENV !== 'production' &&
    appError.statusCode >= 500 &&
    error instanceof Error
      ? { detail: error.message }
      : {}),
  });
};
