import type { RequestHandler } from 'express';
import {
  approveStockCount,
  createStockCount,
  getStockCount,
  listStockCounts,
  postStockCount,
  recordStockCountQuantity,
  rejectStockCount,
  submitStockCount,
} from '../services/stock-counts.service.js';
import { success } from '../utils/api-response.js';
import {
  stockCountListSchema,
  stockCountQuantitySchema,
  stockCountRejectSchema,
} from '../validators/stock-count.validator.js';

export const list: RequestHandler = async (req, res) => {
  const result = await listStockCounts(
    req.auth!.organizationId,
    stockCountListSchema.parse(req.query),
  );
  res.json({
    success: true,
    message: 'Stock counts retrieved successfully',
    ...result,
  });
};

export const create: RequestHandler = async (req, res) => {
  success(
    res,
    'Stock count created successfully',
    await createStockCount(
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
    'Stock count retrieved successfully',
    await getStockCount(req.auth!.organizationId, String(req.params.id)),
  );
};

export const recordQuantity: RequestHandler = async (req, res) => {
  const { countedQuantity } = stockCountQuantitySchema.parse(req.body);
  success(
    res,
    'Physical quantity recorded successfully',
    await recordStockCountQuantity(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      String(req.params.itemId),
      countedQuantity,
      req.requestId,
    ),
  );
};

export const submit: RequestHandler = async (req, res) => {
  success(
    res,
    'Stock count submitted for review',
    await submitStockCount(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      req.requestId,
    ),
  );
};

export const approve: RequestHandler = async (req, res) => {
  success(
    res,
    'Stock count approved successfully',
    await approveStockCount(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      req.requestId,
    ),
  );
};

export const reject: RequestHandler = async (req, res) => {
  const { reason } = stockCountRejectSchema.parse(req.body);
  success(
    res,
    'Stock count rejected successfully',
    await rejectStockCount(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      reason,
      req.requestId,
    ),
  );
};

export const post: RequestHandler = async (req, res) => {
  success(
    res,
    'Approved stock count posted successfully',
    await postStockCount(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      req.requestId,
    ),
  );
};
