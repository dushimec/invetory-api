import { Router } from 'express';
import * as controller from '../controllers/suppliers.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();
router.use(authenticate);
router.get(
  '/',
  requirePermission('suppliers.read'),
  validate(controller.supplierListSchema, 'query'),
  controller.list,
);
router.post(
  '/',
  requirePermission('suppliers.read'),
  validate(controller.supplierCreateSchema),
  controller.create,
);
router.get(
  '/:id/purchases',
  requirePermission('purchases.read'),
  validate(controller.supplierIdSchema, 'params'),
  controller.purchases,
);
router.get(
  '/:id',
  requirePermission('suppliers.manage'),
  validate(controller.supplierIdSchema, 'params'),
  controller.getById,
);
router.patch(
  '/:id',
  requirePermission('suppliers.manage'),
  validate(controller.supplierIdSchema, 'params'),
  validate(controller.supplierUpdateSchema),
  controller.update,
);

export default router;
