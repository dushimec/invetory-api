import { Router } from 'express';
import * as controller from '../controllers/organization.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { organizationSettingsUpdateSchema } from '../validators/organization.validator.js';

const router = Router();
router.use(authenticate, requirePermission('settings.manage'));
router.get('/settings', controller.getSettings);
router.patch(
  '/settings',
  validate(organizationSettingsUpdateSchema),
  controller.updateSettings,
);

export default router;
