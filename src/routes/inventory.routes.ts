import { Router } from 'express';
import * as controller from '../controllers/inventory.controller.js';
import transferRoutes from './transfer.routes.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  adjustmentSchema,
  inventoryListSchema,
  issueSchema,
  receiveSchema,
} from '../validators/inventory.validator.js';

const router = Router();
router.use(authenticate);
router.use('/transfers', transferRoutes);
router.get(
  '/balances',
  requirePermission('inventory.read'),
  validate(inventoryListSchema, 'query'),
  controller.balances,
);
router.get(
  '/movements',
  requirePermission('inventory.read'),
  validate(inventoryListSchema, 'query'),
  controller.movements,
);
router.get(
  '/reconciliation',
  requirePermission('reports.view'),
  controller.reconciliation,
);
router.post(
  '/receive',
  requirePermission('inventory.receive'),
  validate(receiveSchema),
  controller.postMovement('receive'),
);
router.post(
  '/issue',
  requirePermission('inventory.issue'),
  validate(issueSchema),
  controller.postMovement('issue'),
);
router.post(
  '/adjustments',
  requirePermission('inventory.adjust.direct'),
  validate(adjustmentSchema),
  controller.postMovement('adjust'),
);

export default router;
