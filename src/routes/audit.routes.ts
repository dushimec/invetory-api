import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requirePermission } from '../middlewares/permission.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { listAuditLogs } from '../services/audit.service.js';

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    actorId: z.string().uuid().optional(),
    entityType: z.string().trim().min(1).max(100).optional(),
    entityId: z.string().uuid().optional(),
    action: z.string().trim().min(1).max(120).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

const router = Router();
router.use(authenticate, requirePermission('audit_logs.read'));
router.get('/', validate(querySchema, 'query'), async (req, res) => {
  const result = await listAuditLogs(
    req.auth!.organizationId,
    querySchema.parse(req.query),
  );
  res.json({
    success: true,
    message: 'Audit log entries retrieved',
    ...result,
  });
});
export default router;
