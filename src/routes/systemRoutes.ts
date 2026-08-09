import { Router } from 'express';
import * as systemController from '../controllers/systemController';
import * as auditController from '../controllers/auditController';
import { authMiddleware, roleMiddleware } from '../middlewares/auth';

const router = Router();

// Open route for initial setup (in reality, protect this via CLI or secret env var)
router.post('/setup-super-admin', systemController.createSuperAdmin);

// Requires a valid session but NOT specifically SUPER_ADMIN — while
// impersonating, the current session's role is the impersonated tenant
// admin's, so the SUPER_ADMIN-only gate below would incorrectly reject this.
// The handler itself re-validates the stashed adminToken cookie is a genuine
// SUPER_ADMIN token before restoring it.
router.post('/stop-impersonation', authMiddleware, systemController.stopImpersonation);

// The rest are protected for SUPER_ADMIN only
router.use(authMiddleware);
router.use(roleMiddleware(['SUPER_ADMIN']));

router.get('/tenants', systemController.getAllTenants);
router.post('/tenants', systemController.createTenant);
router.put('/tenants/:id/subscription', systemController.updateTenantSubscription);
router.put('/tenants/:id/settings', systemController.updateTenantSettings);
router.put('/users/:userId/permissions', systemController.updateTenantUserPermissions);
router.post('/users/:userId/reset-link', systemController.createPasswordResetLink);
router.put('/users/:userId/otp', systemController.setUserOtp);

router.get('/settings/global', systemController.getGlobalSettings);
router.put('/settings/global', systemController.updateGlobalSettings);

router.get('/admins', systemController.getSystemAdmins);
router.post('/admins', systemController.createSystemAdmin);
router.get('/metrics', systemController.getSystemMetrics);
router.get('/audit', auditController.getSystemAuditLogs);

router.post('/tenants/:id/impersonate', systemController.impersonateTenant);

export default router;
