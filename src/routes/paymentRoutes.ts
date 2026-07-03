import { Router } from 'express';
import { getPayments } from '../controllers/paymentController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Tenant-scoped admin view of payments. Mounted behind tenantMiddleware in app.ts.
router.use(authMiddleware);
router.use(requirePermission('manage_reservations'));

router.get('/', getPayments);

export default router;
