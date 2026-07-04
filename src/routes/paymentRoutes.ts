import { Router } from 'express';
import { getPayments } from '../controllers/paymentController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Tenant-scoped admin view of payments. Mounted behind tenantMiddleware in app.ts.
// Managers keep access by role; STAFF/HOST need the explicit `view_payments` grant.
router.use(authMiddleware);
router.use(requirePermission('view_payments', { allowRoles: ['MANAGER'] }));

router.get('/', getPayments);

export default router;
