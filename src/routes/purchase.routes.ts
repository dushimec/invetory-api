import { Router } from 'express';
import * as controller from '../controllers/purchases.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  purchaseOrderCreateSchema,
  purchaseOrderListSchema,
  purchaseOrderParamsSchema,
  receiptCreateSchema,
} from '../validators/purchase.validator.js';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  requirePermission('purchases.read'),
  validate(purchaseOrderListSchema, 'query'),
  controller.list,
);
router.post(
  '/',
  requirePermission('purchases.create'),
  validate(purchaseOrderCreateSchema),
  controller.create,
);
router.post(
  '/:id/submit',
  requirePermission('purchases.create'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.transition('submit'),
);
router.post(
  '/:id/approve',
  requirePermission('purchases.approve'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.transition('approve'),
);
router.post(
  '/:id/reject',
  requirePermission('purchases.approve'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.transition('reject'),
);
router.post(
  '/:id/cancel',
  requirePermission('purchases.create'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.transition('cancel'),
);
router.post(
  '/:id/receipts',
  requirePermission('purchases.receive'),
  validate(purchaseOrderParamsSchema, 'params'),
  validate(receiptCreateSchema),
  controller.createReceipt,
);
router.get(
  '/:id',
  requirePermission('purchases.read'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.getById,
);

export default router;
