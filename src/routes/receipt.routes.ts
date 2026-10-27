import { Router } from 'express';
import * as controller from '../controllers/purchases.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  goodsReceiptListSchema,
  purchaseOrderParamsSchema,
} from '../validators/purchase.validator.js';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  requirePermission('purchases.receive'),
  validate(goodsReceiptListSchema, 'query'),
  controller.receipts,
);
router.get(
  '/:id',
  requirePermission('purchases.receive'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.receiptById,
);
router.post(
  '/:id/post',
  requirePermission('purchases.receive'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.postReceipt,
);

export default router;
