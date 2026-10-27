import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';

const router = Router();
router.use(authenticate, requirePermission('reports.view'));
router.get('/', controller.summary);
export default router;
