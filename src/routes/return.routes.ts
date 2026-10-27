import { Router } from 'express';
import * as controller from '../controllers/returns.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  returnCreateSchema,
  returnParamsSchema,
  returnListSchema,
} from '../validators/returns.validator.js';

const router = Router();
router.use(authenticate, requirePermission('returns.process'));
router.get('/', validate(returnListSchema, 'query'), controller.list);
router.post('/', validate(returnCreateSchema), controller.create);
router.get('/:id', validate(returnParamsSchema, 'params'), controller.getById);
router.post(
  '/:id/submit',
  validate(returnParamsSchema, 'params'),
  controller.submit,
);
router.post(
  '/:id/approve',
  validate(returnParamsSchema, 'params'),
  controller.approve,
);
router.post(
  '/:id/post',
  validate(returnParamsSchema, 'params'),
  controller.post,
);
router.post(
  '/:id/cancel',
  validate(returnParamsSchema, 'params'),
  controller.cancel,
);
export default router;
