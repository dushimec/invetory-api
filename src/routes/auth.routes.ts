import { Router } from 'express';
import * as controller from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { authRateLimit } from '../middlewares/rate-limit.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  passwordChangeSchema,
} from '../validators/auth.validator.js';

const router = Router();
router.post(
  '/register',
  authRateLimit,
  validate(registerSchema),
  controller.register,
);
router.post('/login', authRateLimit, validate(loginSchema), controller.login);
router.post(
  '/refresh',
  authRateLimit,
  validate(refreshSchema),
  controller.refresh,
);
router.post('/logout', authenticate, controller.logout);
router.post(
  '/password/change',
  authenticate,
  validate(passwordChangeSchema),
  controller.changePassword,
);
router.get('/me', authenticate, controller.me);

export default router;
