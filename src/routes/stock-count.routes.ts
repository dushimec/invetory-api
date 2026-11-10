import { Router } from 'express';
import * as controller from '../controllers/stock-counts.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  stockCountCreateSchema,
  stockCountItemParamsSchema,
  stockCountListSchema,
  stockCountParamsSchema,
} from '../validators/stock-count.validator.js';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  requirePermission('inventory.read'),
  validate(stockCountListSchema, 'query'),
  controller.list,
);
router.post(
  '/',
  requirePermission('inventory.count'),
  validate(stockCountCreateSchema),
  controller.create,
);
router.get(
  '/:id',
  requirePermission('inventory.read'),
  validate(stockCountParamsSchema, 'params'),
  controller.getById,
);
router.patch(
  '/:id/items/:itemId',
  requirePermission('inventory.count'),
  validate(stockCountItemParamsSchema, 'params'),
  controller.recordQuantity,
);
router.post(
  '/:id/submit',
  requirePermission('inventory.count'),
  validate(stockCountParamsSchema, 'params'),
  controller.submit,
);
router.post(
  '/:id/approve',
  requirePermission('inventory.adjust'),
  validate(stockCountParamsSchema, 'params'),
  controller.approve,
);
router.post(
  '/:id/reject',
  requirePermission('inventory.adjust'),
  validate(stockCountParamsSchema, 'params'),
  controller.reject,
);
router.post(
  '/:id/post',
  requirePermission('inventory.adjust'),
  validate(stockCountParamsSchema, 'params'),
  controller.post,
);

export default router;