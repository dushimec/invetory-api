import type { RequestHandler } from 'express';
import { prisma } from '../config/db.js';
import { AppError } from '../utils/app-error.js';
import { success } from '../utils/api-response.js';
import {
  createGoodsReceipt,
  createPurchaseOrder,
  getPurchaseOrder,
  listGoodsReceipts,
  listPurchaseOrders,
  postGoodsReceipt,
  transitionPurchaseOrder,
} from '../services/purchasing.service.js';
import {
  purchaseOrderListSchema,
  goodsReceiptListSchema,
} from '../validators/purchase.validator.js';

export const list: RequestHandler = async (req, res) => {
  const query = purchaseOrderListSchema.parse(req.query);
  const result = await listPurchaseOrders(req.auth!.organizationId, query);
  res.json({
    success: true,
    message: 'Purchase orders retrieved successfully',
    ...result,
  });
};

export const create: RequestHandler = async (req, res) => {
  const order = await createPurchaseOrder(
    req.auth!.organizationId,
    req.auth!.userId,
    req.body,
    req.requestId,
  );
  success(res, 'Purchase order created successfully', order, 201);
};

export const getById: RequestHandler = async (req, res) => {
  success(
    res,
    'Purchase order retrieved successfully',
    await getPurchaseOrder(req.auth!.organizationId, String(req.params.id)),
  );
};

export function transition(
  action: 'submit' | 'approve' | 'reject' | 'cancel',
): RequestHandler {
  return async (req, res) => {
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
    const order = await transitionPurchaseOrder(
      organizationId,
      req.auth!.userId,
      String(req.params.id),
      action,
      settings.requirePurchaseApproval,
      settings.requireSeparationOfDuties,
      req.requestId,
    );
    success(res, `Purchase order ${action} successful`, order);
  };
}

export const createReceipt: RequestHandler = async (req, res) => {
  const receipt = await createGoodsReceipt(
    req.auth!.organizationId,
    req.auth!.userId,
    String(req.params.id),
    req.body,
    req.requestId,
  );
  success(res, 'Goods receipt draft created successfully', receipt, 201);
};

export const receipts: RequestHandler = async (req, res) => {
  const { page, pageSize } = goodsReceiptListSchema.parse(req.query);
  const result = await listGoodsReceipts(
    req.auth!.organizationId,
    page,
    pageSize,
  );
  res.json({
    success: true,
    message: 'Goods receipts retrieved successfully',
    ...result,
  });
};

export const receiptById: RequestHandler = async (req, res) => {
  const receipt = await prisma.goodsReceipt.findFirst({
    where: {
      id: String(req.params.id),
      organizationId: req.auth!.organizationId,
    },
    include: {
      supplier: true,
      warehouse: true,
      purchaseOrder: true,
      items: { include: { product: true, purchaseOrderItem: true } },
    },
  });
  if (!receipt) throw new AppError('Goods receipt not found', 404, 'NOT_FOUND');
  success(res, 'Goods receipt retrieved successfully', receipt);
};

export const postReceipt: RequestHandler = async (req, res) => {
  const receipt = await postGoodsReceipt(
    req.auth!.organizationId,
    req.auth!.userId,
    String(req.params.id),
    req.requestId,
  );
  success(res, 'Goods receipt posted successfully', receipt);
};
