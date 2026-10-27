import type { Response } from 'express';

export function success<T>(
  res: Response,
  message: string,
  data: T,
  status = 200,
): void {
  res.status(status).json({ success: true, message, data, meta: null });
}
