import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  approveAdjustment,
  cancelAdjustment,
  createAdjustment,
  getAdjustment,
  listAdjustments,
  postAdjustment,
  submitAdjustment,
} from '../services/adjustments.service.js';
import { success } from '../utils/api-response.js';

export const adjustmentListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum([
        'DRAFT',
        'SUBMITTED',
        'APPROVED',
        'POSTED',
        'CANCELLED',
        'REVERSED',
      ])
      .optional(),
  })
  .strict();
export const adjustmentParamsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export const list: RequestHandler = async (req, res) => {
  const result = await listAdjustments(
    req.auth!.organizationId,
    adjustmentListSchema.parse(req.query),
  );
  res.json({
    success: true,
    message: 'Adjustments retrieved successfully',
    ...result,
  });
};
export const create: RequestHandler = async (req, res) => {
  success(
    res,
    'Adjustment request created successfully',
    await createAdjustment(
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
    'Adjustment retrieved successfully',
    await getAdjustment(req.auth!.organizationId, String(req.params.id)),
  );
};

function transition(
  operation: (
    orgId: string,
    actorId: string,
    id: string,
    requestId?: string,
  ) => Promise<unknown>,
  message: string,
): RequestHandler {
  return async (req, res) =>
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
}
export const submit = transition(
  submitAdjustment,
  'Adjustment submitted successfully',
);
export const approve = transition(
  approveAdjustment,
  'Adjustment approved successfully',
);
export const cancel = transition(
  cancelAdjustment,
  'Adjustment cancelled successfully',
);
export const post: RequestHandler = async (req, res) => {
  success(
    res,
    'Adjustment posted successfully',
    await postAdjustment(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      req.requestId,
    ),
  );
};
