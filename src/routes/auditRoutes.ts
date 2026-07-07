import { Router } from 'express';
import * as auditController from '../controllers/auditController';
import { authMiddleware, roleMiddleware } from '../middlewares/auth';

const router = Router();

// Tenant-facing audit trail. Mounted behind tenantMiddleware in app.ts, so every
// query is already scoped to X-Restaurant-ID. Requires an authenticated session.
router.use(authMiddleware);

// Viewing the audit log is an oversight tool: ADMIN only. Access is
// additionally gated server-side by the tenant's showAuditLogToTenant flag.
router.get('/', roleMiddleware(['ADMIN']), auditController.getTenantAuditLogs);

export default router;
