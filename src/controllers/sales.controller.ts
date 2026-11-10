import type { RequestHandler } from 'express';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';
import {
  cancelSalesOrder,
  confirmSalesOrder,
  createSalesOrder,
  dispatchSalesOrder,
  getSalesOrder,
  listSalesOrders,
  listSalesPayments,
  recordSalesPayment,
  reserveSalesOrder,
  updateSalesDelivery,
} from '../services/sales.service.js';
import {
  salesDeliveryUpdateSchema,
  salesPaymentCreateSchema,
  salesOrderListSchema,
} from '../validators/purchase.validator.js';

export const list: RequestHandler = async (req, res) => {
  const query = salesOrderListSchema.parse(req.query);
  const result = await listSalesOrders(req.auth!.organizationId, query);
  res.json({
    success: true,
    message: 'Sales orders retrieved successfully',
    ...result,
  });
};

export const create: RequestHandler = async (req, res) => {
  const order = await createSalesOrder(
    req.auth!.organizationId,
    req.auth!.userId,
    req.body,
    req.auth!.permissions,
    req.requestId,
  );
  success(res, 'Sales order created successfully', order, 201);
};

export const getById: RequestHandler = async (req, res) => {
  success(
    res,
    'Sales order retrieved successfully',
    await getSalesOrder(req.auth!.organizationId, String(req.params.id)),
  );
};

export const confirm: RequestHandler = async (req, res) => {
  const organizationId = req.auth!.organizationId;
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings)
    throw new AppError(
      'Organization settings are missing',
      500,
      'CONFIGURATION_ERROR',
    );
  const order = await confirmSalesOrder(
    organizationId,
    req.auth!.userId,
    String(req.params.id),
    settings.requireSeparationOfDuties,
    req.requestId,
  );
  success(res, 'Sales order confirmed successfully', order);
};

function idempotencyKey(req: Parameters<RequestHandler>[0]) {
  const key = req.header('Idempotency-Key');
  if (!key || key.length > 120)
    throw new AppError(
      'A valid Idempotency-Key header is required',
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  return key;
}

export const reserve: RequestHandler = async (req, res) => {
  const order = await reserveSalesOrder(
    req.auth!.organizationId,
    req.auth!.userId,
    String(req.params.id),
    idempotencyKey(req),
    req.requestId,
  );
  success(res, 'Sales order stock reserved successfully', order);
};

export const dispatch: RequestHandler = async (req, res) => {
  const order = await dispatchSalesOrder(
    req.auth!.organizationId,
    req.auth!.userId,
    String(req.params.id),
    idempotencyKey(req),
    req.body,
    req.requestId,
  );
  success(res, 'Sales order dispatched successfully', order);
};

export const updateDelivery: RequestHandler = async (req, res) => {
  const input = salesDeliveryUpdateSchema.parse(req.body);
  const delivery = await updateSalesDelivery(
    req.auth!.organizationId,
    req.auth!.userId,
    String(req.params.id),
    String(req.params.deliveryId),
    input,
    req.requestId,
  );
  success(res, 'Sales delivery status updated successfully', delivery);
};

export const listDeliveries: RequestHandler = async (req, res) => {
  const order = await getSalesOrder(
    req.auth!.organizationId,
    String(req.params.id),
  );
  success(res, 'Sales order deliveries retrieved successfully', order.deliveries);
};

export const listPayments: RequestHandler = async (req, res) => {
  success(
    res,
    'Sales payment history retrieved successfully',
    await listSalesPayments(
      req.auth!.organizationId,
      String(req.params.id),
    ),
  );
};

export const recordPayment: RequestHandler = async (req, res) => {
  const input = salesPaymentCreateSchema.parse(req.body);
  const payment = await recordSalesPayment(
    req.auth!.organizationId,
    req.auth!.userId,
    String(req.params.id),
    idempotencyKey(req),
    input,
    req.requestId,
  );
  success(res, 'Customer payment recorded successfully', payment, 201);
};

export const cancel: RequestHandler = async (req, res) => {
  const order = await cancelSalesOrder(
    req.auth!.organizationId,
    req.auth!.userId,
    String(req.params.id),
    idempotencyKey(req),
    req.requestId,
  );
  success(res, 'Sales order cancelled successfully', order);
};
