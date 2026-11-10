import { Router } from 'express';
import * as controller from '../controllers/sales.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  dispatchSchema,
  purchaseOrderParamsSchema,
  salesOrderCreateSchema,
  salesDeliveryParamsSchema,
  salesDeliveryUpdateSchema,
  salesPaymentCreateSchema,
  salesOrderListSchema,
} from '../validators/purchase.validator.js';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  requirePermission('sales.read'),
  validate(salesOrderListSchema, 'query'),
  controller.list,
);
router.post(
  '/',
  requirePermission('sales.create'),
  validate(salesOrderCreateSchema),
  controller.create,
);
router.post(
  '/:id/confirm',
  requirePermission('sales.approve'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.confirm,
);
router.post(
  '/:id/reserve',
  requirePermission('sales.approve'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.reserve,
);
router.post(
  '/:id/dispatch',
  requirePermission('sales.approve'),
  validate(purchaseOrderParamsSchema, 'params'),
  validate(dispatchSchema),
  controller.dispatch,
);
router.get(
  '/:id/deliveries',
  requirePermission('sales.read'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.listDeliveries,
);
router.get(
  '/:id/payments',
  requirePermission('sales.read'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.listPayments,
);
router.post(
  '/:id/payments',
  requirePermission('sales.payments.record'),
  validate(purchaseOrderParamsSchema, 'params'),
  validate(salesPaymentCreateSchema),
  controller.recordPayment,
);
router.patch(
  '/:id/deliveries/:deliveryId',
  requirePermission('sales.approve'),
  validate(salesDeliveryParamsSchema, 'params'),
  validate(salesDeliveryUpdateSchema),
  controller.updateDelivery,
);
router.post(
  '/:id/cancel',
  requirePermission('sales.create'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.cancel,
);
router.get(
  '/:id',
  requirePermission('sales.read'),
  validate(purchaseOrderParamsSchema, 'params'),
  controller.getById,
);

export default router;
