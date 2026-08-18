import { Router } from 'express';
import * as systemController from '../controllers/systemController';
import * as auditController from '../controllers/auditController';
import {
  authMiddleware,
  roleMiddleware,
  requireActiveSuperAdmin,
  requireRootSystemAdmin,
  requireSystemPermission,
} from '../middlewares/auth';
import { rateLimitOrNoop } from '../middlewares/rateLimit';

const router = Router();

// Open route for initial setup (in reality, protect this via CLI or secret env var).
// Security-audit finding: this mints a SUPER_ADMIN account and was previously
// callable at unlimited speed — combined with the secret-token check, that's
// an unthrottled guessing oracle against the single most privileged account
// in the system. Same tight per-IP window as /auth/login.
// exemptAuthenticated: false — this route isn't mounted behind tenantMiddleware,
// so req.restaurantId is never set here, which would otherwise make the shared
// limiter's staff-bypass treat ANY valid JWT (including one from self-registering
// a free account via POST /api/auth/register, on by default) as exempt and
// reopen the unthrottled-guessing-oracle this limiter exists to close. This
// route has no legitimate "staff" caller at all, so throttle by IP only.
const setupRateLimit = rateLimitOrNoop({
  windowMs: 15 * 60_000,
  max: 10,
  keyPrefix: 'setup-super-admin',
  exemptAuthenticated: false
});
router.post('/setup-super-admin', setupRateLimit, systemController.createSuperAdmin);

// Requires a valid session but NOT specifically SUPER_ADMIN — while
// impersonating, the current session's role is the impersonated tenant
// admin's, so the SUPER_ADMIN-only gate below would incorrectly reject this.
// The handler itself re-validates the stashed adminToken cookie is a genuine
// SUPER_ADMIN token before restoring it.
router.post('/stop-impersonation', authMiddleware, systemController.stopImpersonation);

// The rest are protected for SUPER_ADMIN only — and, unlike every other role,
// re-checked live against the DB on every request so deactivating one
// (below) takes effect immediately rather than waiting for the token to expire.
router.use(authMiddleware);
router.use(roleMiddleware(['SUPER_ADMIN']));
router.use(requireActiveSuperAdmin);

router.get('/tenants', requireSystemPermission('sys_manage_tenants'), systemController.getAllTenants);
router.post('/tenants', requireSystemPermission('sys_manage_tenants'), systemController.createTenant);
router.put('/tenants/:id/subscription', requireSystemPermission('sys_manage_subscriptions'), systemController.updateTenantSubscription);
router.put('/tenants/:id/settings', requireSystemPermission('sys_manage_tenants'), systemController.updateTenantSettings);
router.put('/users/:userId/permissions', requireSystemPermission('sys_manage_tenant_users'), systemController.updateTenantUserPermissions);
router.post('/users/:userId/reset-link', requireSystemPermission('sys_manage_tenant_users'), systemController.createPasswordResetLink);
router.put('/users/:userId/otp', requireSystemPermission('sys_manage_tenant_users'), systemController.setUserOtp);

router.get('/settings/global', requireSystemPermission('sys_manage_global_settings'), systemController.getGlobalSettings);
router.put('/settings/global', requireSystemPermission('sys_manage_global_settings'), systemController.updateGlobalSettings);

// Managing other platform administrators is root-only — never gated by a
// grantable sys_* permission, so a sub-admin can never create a new root or
// escalate its own/another admin's access. See requireRootSystemAdmin.
router.get('/admins', requireRootSystemAdmin, systemController.getSystemAdmins);
router.post('/admins', requireRootSystemAdmin, systemController.createSystemAdmin);
router.put('/admins/:id/active', requireRootSystemAdmin, systemController.setSystemAdminActive);
router.put('/admins/:id/permissions', requireRootSystemAdmin, systemController.updateSystemAdminPermissions);

router.get('/metrics', requireSystemPermission('sys_view_metrics'), systemController.getSystemMetrics);
router.get('/audit', requireSystemPermission('sys_view_audit_log'), auditController.getSystemAuditLogs);

router.post('/tenants/:id/impersonate', requireSystemPermission('sys_impersonate_tenants'), systemController.impersonateTenant);

export default router;
