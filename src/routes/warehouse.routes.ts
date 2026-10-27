import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/warehouses.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();
router.use(authenticate);
router.get('/', requirePermission('inventory.read'), controller.warehouseList);
router.post(
  '/',
  requirePermission('settings.manage'),
  validate(controller.warehouseCreateSchema),
  controller.warehouseCreate,
);
router.get(
  '/:id/stock',
  requirePermission('inventory.read'),
  validate(z.object({ id: z.string().uuid() }).strict(), 'params'),
  controller.warehouseStock,
);

export default router;
