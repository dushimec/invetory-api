import { Router } from 'express';
import * as controller from '../controllers/reports.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';

const router = Router();
router.use(authenticate, requirePermission('reports.view'));
router.get('/inventory-valuation', controller.valuation);
router.get('/inventory-movements', controller.movements);
router.get('/low-stock', controller.lowStock);
router.get('/imports', controller.imports);
router.get('/deliveries', controller.deliveries);
export default router;
