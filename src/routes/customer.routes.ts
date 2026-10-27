import { Router } from 'express';
import * as controller from '../controllers/customers.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  requirePermission('customers.read'),
  validate(controller.customerListSchema, 'query'),
  controller.list,
);
router.post(
  '/',
  requirePermission('customers.read'),
  validate(controller.customerCreateSchema),
  controller.create,
);
router.get(
  '/:id/sales',
  requirePermission('sales.create'),
  validate(controller.customerIdSchema, 'params'),
  controller.salesHistory,
);
router.get(
  '/:id',
  requirePermission('customers.manage'),
  validate(controller.customerIdSchema, 'params'),
  controller.getById,
);
router.patch(
  '/:id',
  requirePermission('customers.manage'),
  validate(controller.customerIdSchema, 'params'),
  validate(controller.customerUpdateSchema),
  controller.update,
);

export default router;
