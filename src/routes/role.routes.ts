import { Router } from 'express';
import * as controller from '../controllers/roles.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  roleCreateSchema,
  roleParamsSchema,
  roleUpdateSchema,
} from '../validators/role.validator.js';

const router = Router();
router.use(authenticate, requirePermission('roles.manage'));
router.get('/', controller.list);
router.post('/', validate(roleCreateSchema), controller.create);
router.patch(
  '/:id',
  validate(roleParamsSchema, 'params'),
  validate(roleUpdateSchema),
  controller.update,
);
router.delete(
  '/:id',
  validate(roleParamsSchema, 'params'),
  controller.remove,
);

export default router;