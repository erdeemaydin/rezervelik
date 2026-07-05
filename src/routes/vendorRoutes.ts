import { Router } from 'express';
import * as vendorController from '../controllers/vendorController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

router.use(authMiddleware);

// Reads — any authenticated tenant user.
router.get('/', vendorController.getVendors);

// Mutations — gated by manage_events (SUPER_ADMIN/ADMIN bypass requirePermission).
router.use(requirePermission('manage_events'));
router.post('/', vendorController.createVendor);
router.put('/:id', vendorController.updateVendor);
router.delete('/:id', vendorController.deleteVendor);

export default router;
