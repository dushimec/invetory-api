import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';
import {
  approveTransfer,
  cancelTransfer,
  createTransfer,
  dispatchTransfer,
  getTransfer,
  listTransfers,
  receiveTransfer,
  submitTransfer,
} from '../services/transfers.service.js';
import { transferListSchema } from '../validators/transfer.validator.js';

function idempotencyKey(req: Parameters<RequestHandler>[0]) {
  const key = req.header('Idempotency-Key');
  if (!key || key.length > 120) {
    throw new AppError(
      'A valid Idempotency-Key header is required',
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  return key;
}

export const list: RequestHandler = async (req, res) => {
  const query = transferListSchema.parse(req.query);
  const result = await listTransfers(req.auth!.organizationId, query);
  res.json({
    success: true,
    message: 'Transfers retrieved successfully',
    ...result,
  });
};

export const create: RequestHandler = async (req, res) => {
  success(
    res,
    'Transfer created successfully',
    await createTransfer(
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
    'Transfer retrieved successfully',
    await getTransfer(req.auth!.organizationId, String(req.params.id)),
  );
};

export const submit: RequestHandler = async (req, res) => {
  success(
    res,
    'Transfer submitted successfully',
    await submitTransfer(
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
    'Transfer approved successfully',
    await approveTransfer(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      req.requestId,
    ),
  );
};

export const dispatch: RequestHandler = async (req, res) => {
  success(
    res,
    'Transfer dispatched successfully',
    await dispatchTransfer(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      idempotencyKey(req),
      req.requestId,
    ),
  );
};

export const receive: RequestHandler = async (req, res) => {
  success(
    res,
    'Transfer receipt posted successfully',
    await receiveTransfer(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      idempotencyKey(req),
      req.body,
      req.requestId,
    ),
  );
};

export const cancel: RequestHandler = async (req, res) => {
  success(
    res,
    'Transfer cancelled successfully',
    await cancelTransfer(
      req.auth!.organizationId,
      req.auth!.userId,
      String(req.params.id),
      req.requestId,
    ),
  );
};
