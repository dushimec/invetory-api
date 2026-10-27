import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';

export function requirePermission(permission: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
      return;
    }
    if (req.auth.mustChangePassword) {
      next(
        new AppError(
          'Change your temporary password before using organization features',
          403,
          'PASSWORD_CHANGE_REQUIRED',
        ),
      );
      return;
    }
    if (!req.auth.permissions.includes(permission)) {
      next(
        new AppError(
          'You do not have permission to perform this action',
          403,
          'FORBIDDEN',
        ),
      );
      return;
    }
    next();
  };
}
