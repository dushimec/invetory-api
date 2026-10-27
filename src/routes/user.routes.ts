import { Router } from 'express';
import * as controller from '../controllers/users.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { userCreateSchema } from '../validators/user.validator.js';

const router = Router();
router.use(authenticate, requirePermission('users.manage'));
router.get('/', validate(controller.usersListSchema, 'query'), controller.list);
router.post('/', validate(userCreateSchema), controller.create);
router.patch(
  '/:id',
  validate(controller.userParamsSchema, 'params'),
  validate(controller.membershipUpdateSchema),
  controller.updateMembership,
);
export default router;
