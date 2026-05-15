import { Router } from 'express';
import * as systemController from '../controllers/systemController';
import { authMiddleware, roleMiddleware } from '../middlewares/auth';

const router = Router();

// Open route for initial setup (in reality, protect this via CLI or secret env var)
router.post('/setup-super-admin', systemController.createSuperAdmin);

// The rest are protected for SUPER_ADMIN only
router.use(authMiddleware);
router.use(roleMiddleware(['SUPER_ADMIN']));

router.get('/tenants', systemController.getAllTenants);
router.post('/tenants', systemController.createTenant);
router.put('/tenants/:id/subscription', systemController.updateTenantSubscription);
router.put('/tenants/:id/settings', systemController.updateTenantSettings);
router.put('/users/:userId/permissions', systemController.updateTenantUserPermissions);

export default router;
