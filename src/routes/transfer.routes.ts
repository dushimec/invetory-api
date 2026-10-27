import { Router } from 'express';
import * as controller from '../controllers/transfers.controller.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  transferCreateSchema,
  transferParamsSchema,
  transferReceiveSchema,
} from '../validators/transfer.validator.js';

const router = Router();
router.get('/', requirePermission('inventory.read'), controller.list);
router.post(
  '/',
  requirePermission('inventory.transfer'),
  validate(transferCreateSchema),
  controller.create,
);
router.get(
  '/:id',
  requirePermission('inventory.read'),
  validate(transferParamsSchema, 'params'),
  controller.getById,
);
router.post(
  '/:id/submit',
  requirePermission('inventory.transfer'),
  validate(transferParamsSchema, 'params'),
  controller.submit,
);
router.post(
  '/:id/approve',
  requirePermission('inventory.transfer'),
  validate(transferParamsSchema, 'params'),
  controller.approve,
);
router.post(
  '/:id/dispatch',
  requirePermission('inventory.transfer'),
  validate(transferParamsSchema, 'params'),
  controller.dispatch,
);
router.post(
  '/:id/receive',
  requirePermission('inventory.transfer'),
  requirePermission('inventory.receive'),
  validate(transferParamsSchema, 'params'),
  validate(transferReceiveSchema),
  controller.receive,
);
router.post(
  '/:id/cancel',
  requirePermission('inventory.transfer'),
  validate(transferParamsSchema, 'params'),
  controller.cancel,
);

export default router;
