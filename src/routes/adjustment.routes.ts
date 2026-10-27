import { Router } from 'express';
import * as controller from '../controllers/adjustments.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { adjustmentCreateSchema } from '../validators/adjustment.validator.js';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  requirePermission('inventory.read'),
  validate(controller.adjustmentListSchema, 'query'),
  controller.list,
);
router.post(
  '/',
  requirePermission('inventory.adjust'),
  validate(adjustmentCreateSchema),
  controller.create,
);
router.get(
  '/:id',
  requirePermission('inventory.read'),
  validate(controller.adjustmentParamsSchema, 'params'),
  controller.getById,
);
router.post(
  '/:id/submit',
  requirePermission('inventory.adjust'),
  validate(controller.adjustmentParamsSchema, 'params'),
  controller.submit,
);
router.post(
  '/:id/approve',
  requirePermission('inventory.adjust'),
  validate(controller.adjustmentParamsSchema, 'params'),
  controller.approve,
);
router.post(
  '/:id/post',
  requirePermission('inventory.adjust'),
  validate(controller.adjustmentParamsSchema, 'params'),
  controller.post,
);
router.post(
  '/:id/cancel',
  requirePermission('inventory.adjust'),
  validate(controller.adjustmentParamsSchema, 'params'),
  controller.cancel,
);
export default router;
