import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  approveReturn,
  cancelReturn,
  createReturn,
  getReturn,
  listReturns,
  postReturn,
  submitReturn,
} from '../services/returns.service.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';
import { returnListSchema } from '../validators/returns.validator.js';

export const returnParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const list: RequestHandler = async (req, res) => {
  const result = await listReturns(
    req.auth!.organizationId,
    returnListSchema.parse(req.query),
  );
  res.json({
    success: true,
    message: 'Returns retrieved successfully',
    ...result,
  });
};

export const create: RequestHandler = async (req, res) => {
  success(
    res,
    'Return created successfully',
    await createReturn(
      req.auth!.organizationId,
      req.auth!.userId,
      req.body,
      req.requestId,
    ),
    201,
  );
};

export const getById: RequestHandler = async (req, res) => {
  success(
    res,
    'Return retrieved successfully',
    await getReturn(req.auth!.organizationId, String(req.params.id)),
  );
};

function transition(
  operation: (
    organizationId: string,
    actorId: string,
    id: string,
    requestId?: string,
  ) => Promise<unknown>,
  message: string,
): RequestHandler {
  return async (req, res) => {
    success(
      res,
      message,
      await operation(
        req.auth!.organizationId,
        req.auth!.userId,
        String(req.params.id),
        req.requestId,
      ),
    );
  };
}

export const submit = transition(submitReturn, 'Return submitted successfully');
export const approve = transition(
  approveReturn,
  'Return approved successfully',
);
export const post: RequestHandler = async (req, res) => {
  success(
    res,
    'Return posted successfully',
    await postReturn(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      req.requestId,
    ),
  );
};
export const cancel = transition(cancelReturn, 'Return cancelled successfully');
