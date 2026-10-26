import { Router } from 'express';
import { getPayments, refundPaymentHandler } from '../controllers/paymentController';
import { authMiddleware, requirePermission } from '../middlewares/auth';
import { requireFeature } from '../middlewares/feature';

const router = Router();

// Tenant-scoped admin view of payments. Mounted behind tenantMiddleware in app.ts.
// Managers keep access by role; STAFF/HOST need the explicit `view_payments` grant.
router.use(authMiddleware);
router.use(requireFeature('hasPaymentFeature'));
router.use(requirePermission('view_payments', { allowRoles: ['MANAGER'] }));

router.get('/', getPayments);

// Refunding actually moves money, so this is gated tighter than viewing the
// list — ADMIN/SUPER_ADMIN (via requirePermission's built-in bypass) or MANAGER;
// no STAFF/HOST permission string grants this, unlike view_payments.
router.post('/:id/refund', requirePermission('manage_payments', { allowRoles: ['MANAGER'] }), refundPaymentHandler);

export default router;
