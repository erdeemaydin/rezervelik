import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { generateResetToken, RESET_TOKEN_TTL_MS, generateHashedToken } from '../utils/resetToken';
import { validatePassword } from '../utils/passwordPolicy';

const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
import {
  DEFAULT_BUSINESS_TYPE,
  FEATURE_FLAG_KEYS,
  getFeatureProfile,
  isBusinessType,
} from '../config/businessProfiles';
import { generatePublicApiKey } from '../utils/publicApiKey';
import { bustMaintenanceCache } from '../middlewares/maintenance';
import { logAudit } from '../services/auditService';

// POST /system/users/:userId/reset-link (SUPER_ADMIN only)
// Mints a single-use password reset link for any user. The raw token is returned
// exactly once here; only its SHA-256 hash is persisted.
export const createPasswordResetLink = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorResponse(res, 'errors.validation_error', 404, { message: 'User not found' });

    const { rawToken, tokenHash, expiresAt } = generateResetToken();

    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt }
    });

    logAudit({
      req,
      restaurantId: user.restaurantId,
      category: 'SYSTEM',
      action: 'PASSWORD_RESET_LINK_GENERATED',
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.email,
    });

    return successResponse(res, {
      resetLink: `/auth/reset/${rawToken}`,
      email: user.email,
      expiresAt,
      expiresInMinutes: Math.round(RESET_TOKEN_TTL_MS / 60000)
    });
  } catch (error) {
    console.error('Create password reset link error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// PUT /system/users/:userId/otp (SUPER_ADMIN only)
// Enable/disable the two-factor requirement for a user. Only the root admin can
// flip this. Disabling also wipes any existing enrollment so re-enabling forces
// a fresh setup.
export const setUserOtp = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { required } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorResponse(res, 'errors.validation_error', 404, { message: 'User not found' });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: required
        ? { otpRequired: true }
        : { otpRequired: false, otpSecret: null, otpConfirmedAt: null }
    });

    logAudit({
      req,
      restaurantId: user.restaurantId,
      category: 'SYSTEM',
      action: required ? 'TWO_FACTOR_ENABLED' : 'TWO_FACTOR_DISABLED',
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.email,
    });

    return successResponse(res, {
      id: updated.id,
      otpRequired: updated.otpRequired,
      otpEnrolled: !!updated.otpConfirmedAt
    });
  } catch (error) {
    console.error('Set user OTP error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getAllTenants = async (req: Request, res: Response) => {
  try {
    const tenants = await prisma.restaurant.findMany({
      include: {
        settings: true,
        customization: true,
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            permissions: true,
            otpRequired: true,
            otpConfirmedAt: true
          }
        }
      }
    });
    return successResponse(res, tenants);
  } catch (error) {
    console.error('Get all tenants error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createTenant = async (req: Request, res: Response) => {
  try {
    const { name, contactEmail, adminFirstName, adminLastName, adminPassword } = req.body;

    if (!name || !contactEmail || !adminFirstName || !adminLastName) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Required fields missing' });
    }

    // Vertical/business type drives terminology + the default feature profile.
    const businessType = isBusinessType(req.body.businessType)
      ? req.body.businessType
      : DEFAULT_BUSINESS_TYPE;
    const featureProfile = getFeatureProfile(businessType);

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    const existingRestaurant = await prisma.restaurant.findUnique({ where: { slug } });
    if (existingRestaurant) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Tenant name is already taken' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: contactEmail } });

    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Admin email already exists' });
    }

    let isInvite = false;
    let rawSetupToken: string | null = null;
    let setupTokenHash: string | null = null;
    let setupTokenExpiresAt: Date | null = null;
    let finalPassword = adminPassword;

    if (!finalPassword) {
      isInvite = true;
      // Dummy password the account is created with until setup completes — never
      // shown or sent anywhere, but still a real credential accepted by /auth/login
      // until then, so it needs the same CSPRNG entropy as the setup token itself.
      finalPassword = crypto.randomBytes(16).toString('hex') + 'A1!';
      const setup = generateHashedToken(SETUP_TOKEN_TTL_MS);
      rawSetupToken = setup.rawToken;
      setupTokenHash = setup.tokenHash;
      setupTokenExpiresAt = setup.expiresAt;
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    const result = await prisma.$transaction(async (prisma) => {
      // Default trial to 14 days
      const subscriptionEndsAt = new Date();
      subscriptionEndsAt.setDate(subscriptionEndsAt.getDate() + 14);

      const restaurant = await prisma.restaurant.create({
        data: {
          name,
          slug,
          contactEmail,
          businessType,
          subscriptionPlan: 'TRIAL',
          subscriptionStatus: 'ACTIVE',
          subscriptionEndsAt,
          settings: {
            create: { ...featureProfile }
          },
          customization: {
            create: {}
          }
        }
      });

      const user = await prisma.user.create({
        data: {
          email: contactEmail,
          passwordHash: hashedPassword,
          firstName: adminFirstName,
          lastName: adminLastName,
          role: 'ADMIN',
          permissions: 'manage_reservations,manage_tables,edit_floor_plan,manage_menu,manage_calendar,manage_staff,manage_settings,manage_events',
          restaurantId: restaurant.id,
          setupTokenHash,
          setupTokenExpiresAt
        }
      });

      return { restaurant, adminUser: user };
    });

    logAudit({
      req,
      restaurantId: result.restaurant.id,
      category: 'TENANT',
      action: 'TENANT_PROVISIONED',
      targetType: 'Restaurant',
      targetId: result.restaurant.id,
      targetLabel: result.restaurant.name,
      metadata: { businessType, contactEmail },
    });

    if (isInvite) {
      return successResponse(res, { ...result, setupLink: `/auth/setup/${rawSetupToken}` }, undefined, 201);
    }
    return successResponse(res, result, undefined, 201);
  } catch (error: any) {
    // The findUnique checks above are fail-fast convenience, not the real guard —
    // Restaurant.slug and User.email are both DB-unique, so two near-simultaneous
    // provisioning requests can both pass those checks and race to create(). Same
    // pattern already fixed in authController.register / staffController.createStaffMember.
    if (error?.code === 'P2002') {
      const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(',') : String(error?.meta?.target ?? '');
      if (target.includes('slug')) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'Tenant name is already taken' });
      }
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Admin email already exists' });
    }
    console.error('Create tenant error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateTenantSubscription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { subscriptionPlan, subscriptionStatus, subscriptionEndsAt, sysAdminNotes } = req.body;

    const updated = await prisma.restaurant.update({
      where: { id },
      data: {
        subscriptionPlan,
        subscriptionStatus,
        subscriptionEndsAt: subscriptionEndsAt ? new Date(subscriptionEndsAt) : null,
        sysAdminNotes
      }
    });

    logAudit({
      req,
      restaurantId: id,
      category: 'SUBSCRIPTION',
      action: 'SUBSCRIPTION_UPDATED',
      targetType: 'Restaurant',
      targetId: id,
      targetLabel: updated.name,
      metadata: { subscriptionPlan, subscriptionStatus },
    });

    return successResponse(res, updated);
  } catch (error) {
    console.error('Update tenant subscription error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateTenantSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      currency,
      twoFactorEnabled,
      twoFactorRoles,
      defaultLanguage,
      showAuditLogToTenant
    } = req.body;

    // 2FA is a root-admin-only control: the SysAdmin decides both whether the
    // tenant uses 2FA (`twoFactorEnabled`) and which roles it applies to
    // (`twoFactorRoles`). Normalize the roles to a comma-separated string; when
    // 2FA is switched off, clear the role list so a later re-enable starts clean.
    let twoFactorRolesUpdate: string | undefined;
    if (twoFactorEnabled === false) {
      twoFactorRolesUpdate = '';
    } else if (twoFactorRoles !== undefined) {
      twoFactorRolesUpdate = Array.isArray(twoFactorRoles)
        ? twoFactorRoles.join(',')
        : String(twoFactorRoles || '');
    }

    // When the SysAdmin switches the tenant's businessType, seed the vertical's
    // default feature profile — but any flag explicitly present in this request
    // wins over the profile default.
    const businessTypeProvided = isBusinessType(req.body.businessType);
    const profile = businessTypeProvided ? getFeatureProfile(req.body.businessType) : null;

    const featureData: Record<string, boolean> = {};
    for (const key of FEATURE_FLAG_KEYS) {
      if (req.body[key] !== undefined) {
        featureData[key] = Boolean(req.body[key]);
      } else if (profile) {
        featureData[key] = profile[key];
      }
    }

    // Commercial add-on packages + custom domain (SysAdmin-only). Booleans for the
    // two packages, the tenant's custom domain, and publishable-key rotation.
    const {
      hasHostedFrontend,
      hasReservationWidget,
      customDomain,
      rotatePublicApiKey,
    } = req.body;

    const restaurantData: Record<string, unknown> = {};
    if (businessTypeProvided) restaurantData.businessType = req.body.businessType;
    if (hasHostedFrontend !== undefined) restaurantData.hasHostedFrontend = Boolean(hasHostedFrontend);
    if (hasReservationWidget !== undefined) restaurantData.hasReservationWidget = Boolean(hasReservationWidget);

    // Normalize a custom domain to a bare, lowercase host (strip scheme, path,
    // trailing slash). Changing it invalidates any prior verification.
    if (customDomain !== undefined) {
      const normalized = typeof customDomain === 'string' && customDomain.trim()
        ? customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
        : null;
      restaurantData.customDomain = normalized;
      restaurantData.customDomainVerifiedAt = null;
    }

    // Mint a publishable key when the widget is switched on and none exists yet,
    // or whenever the SysAdmin explicitly asks to rotate it.
    if (rotatePublicApiKey === true) {
      restaurantData.publicApiKey = generatePublicApiKey();
    } else if (Boolean(hasReservationWidget) === true) {
      const existing = await prisma.restaurant.findUnique({
        where: { id },
        select: { publicApiKey: true },
      });
      if (!existing?.publicApiKey) restaurantData.publicApiKey = generatePublicApiKey();
    }

    if (Object.keys(restaurantData).length > 0) {
      await prisma.restaurant.update({ where: { id }, data: restaurantData });
    }

    const updated = await prisma.restaurantSettings.update({
      where: { restaurantId: id },
      data: {
        ...featureData,
        // Currency, the 2FA capability flag and the default language are
        // root-admin-only controls.
        ...(currency !== undefined ? { currency } : {}),
        ...(twoFactorEnabled !== undefined ? { twoFactorEnabled } : {}),
        ...(twoFactorRolesUpdate !== undefined ? { twoFactorRoles: twoFactorRolesUpdate } : {}),
        ...(defaultLanguage !== undefined ? { defaultLanguage } : {}),
        ...(showAuditLogToTenant !== undefined ? { showAuditLogToTenant: Boolean(showAuditLogToTenant) } : {})
      }
    });

    if (req.body.layoutStyle) {
      await prisma.frontendCustomization.upsert({
        where: { restaurantId: id },
        update: { layoutStyle: req.body.layoutStyle },
        create: { restaurantId: id, layoutStyle: req.body.layoutStyle }
      });
    }

    // Scope this to the tenant so it also surfaces in that tenant's own audit view.
    const tenant = await prisma.restaurant.findUnique({ where: { id }, select: { name: true } });
    logAudit({
      req,
      restaurantId: id,
      category: 'SETTINGS',
      action: 'TENANT_SETTINGS_UPDATED',
      targetType: 'Restaurant',
      targetId: id,
      targetLabel: tenant?.name,
      metadata: { ...featureData, ...(req.body.layoutStyle ? { layoutStyle: req.body.layoutStyle } : {}) },
    });

    return successResponse(res, updated);
  } catch (error) {
    console.error('Update tenant settings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateTenantUserPermissions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        permissions: Array.isArray(permissions) ? permissions.join(',') : permissions
      }
    });

    logAudit({
      req,
      restaurantId: updatedUser.restaurantId,
      category: 'PERMISSIONS',
      action: 'PERMISSIONS_UPDATED',
      targetType: 'User',
      targetId: updatedUser.id,
      targetLabel: updatedUser.email,
      metadata: { permissions: updatedUser.permissions },
    });

    return successResponse(res, updatedUser);
  } catch (error) {
    console.error('Update tenant user permissions error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createSuperAdmin = async (req: Request, res: Response) => {
  // NOTE: In production, this should be a CLI script or heavily protected.
  // We leave it open for initial setup, but ideally you check for a secret token.
  try {
    const { email, password, firstName, lastName, secretToken } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Required fields missing' });
    }

    // Security-audit finding: this endpoint mints the highest-privilege
    // account in the system (SUPER_ADMIN) and was gated only by a plain `!==`
    // string comparison with zero rate limiting — a timing side-channel
    // (leaking how many leading characters matched) combined with unlimited
    // guesses. Every other secret comparison in this codebase (TOTP, PayTR
    // callback hash) already uses crypto.timingSafeEqual; this one didn't.
    // Route-level rate limiting is added alongside this in systemRoutes.ts.
    const envSecretToken = process.env.SETUP_SECRET_TOKEN;
    const providedToken = typeof secretToken === 'string' ? secretToken : '';
    const tokenMatches =
      !!envSecretToken &&
      Buffer.byteLength(providedToken) === Buffer.byteLength(envSecretToken) &&
      crypto.timingSafeEqual(Buffer.from(providedToken), Buffer.from(envSecretToken));
    if (!tokenMatches) {
      return errorResponse(res, 'errors.unauthorized', 403, { message: 'Invalid or unconfigured setup token' });
    }

    const policy = validatePassword(password);
    if (!policy.valid) {
      return errorResponse(res, 'errors.password_policy', 400, { failed: policy.failed });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        role: 'SUPER_ADMIN'
        // restaurantId remains null
      }
    });

    // Minting a platform-level SUPER_ADMIN is one of the most sensitive actions
    // in the system — this bootstrap path (token-gated, no logged-in actor)
    // was the one creation path that left no audit trail at all, unlike its
    // sibling createSystemAdmin below.
    logAudit({
      req,
      category: 'SYSTEM',
      action: 'SUPER_ADMIN_BOOTSTRAPPED',
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.email,
    });

    return successResponse(res, user, undefined, 201);
  } catch (error) {
    console.error('Create super admin error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /system/admins (SUPER_ADMIN only)
// Add another platform administrator from within the console. Unlike
// createSuperAdmin (the token-gated bootstrap for the very first admin), this is
// already behind authMiddleware + roleMiddleware(['SUPER_ADMIN']) in the router,
// so no setup token is required.
export const createSystemAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Required fields missing' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Password must be at least 8 characters' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        role: 'SUPER_ADMIN'
        // restaurantId remains null — platform-level admin, not tenant-scoped
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true }
    });

    logAudit({
      req,
      category: 'SYSTEM',
      action: 'SYSTEM_ADMIN_CREATED',
      targetType: 'User',
      targetId: user.id,
      targetLabel: user.email,
    });

    return successResponse(res, user, undefined, 201);
  } catch (error) {
    console.error('Create system admin error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getGlobalSettings = async (req: Request, res: Response) => {
  try {
    let settings = await prisma.globalSettings.findUnique({ where: { id: 'global_1' } });
    if (!settings) {
      settings = await prisma.globalSettings.create({ data: { id: 'global_1' } });
    }
    return successResponse(res, settings);
  } catch (error) {
    console.error('Get global settings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateGlobalSettings = async (req: Request, res: Response) => {
  try {
    const { maintenanceMode, publicRegistrationEnabled, enforce2FAForAdmins, measurementSystem, dashboardTheme } = req.body;

    // Only accept the two supported conventions; anything else falls back to METRIC.
    const normalizedSystem = measurementSystem === 'US' ? 'US' : 'METRIC';

    // Theme for the system-admin surface. Whitelist to the ids in
    // frontend/src/lib/themes.ts; ignore an unknown value rather than persisting it.
    const ALLOWED_THEMES = ['default', 'terracotta', 'forest', 'burgundy', 'amber'];
    const themeUpdate =
      dashboardTheme !== undefined && ALLOWED_THEMES.includes(dashboardTheme)
        ? { dashboardTheme }
        : {};

    const settings = await prisma.globalSettings.upsert({
      where: { id: 'global_1' },
      update: { maintenanceMode, publicRegistrationEnabled, enforce2FAForAdmins, measurementSystem: normalizedSystem, ...themeUpdate },
      create: { id: 'global_1', maintenanceMode, publicRegistrationEnabled, enforce2FAForAdmins, measurementSystem: normalizedSystem, ...themeUpdate }
    });

    // Drop the maintenance-flag cache so the toggle takes effect immediately
    // instead of after the cache TTL.
    bustMaintenanceCache();

    logAudit({
      req,
      category: 'SYSTEM',
      action: 'GLOBAL_SETTINGS_UPDATED',
      targetType: 'GlobalSettings',
      targetId: 'global_1',
      metadata: { maintenanceMode, publicRegistrationEnabled, enforce2FAForAdmins, measurementSystem: normalizedSystem, ...themeUpdate },
    });

    return successResponse(res, settings);
  } catch (error) {
    console.error('Update global settings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getSystemAdmins = async (req: Request, res: Response) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });
    return successResponse(res, admins);
  } catch (error) {
    console.error('Get system admins error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// PUT /system/admins/:id/active — revoke or restore a SUPER_ADMIN account.
// Security-audit finding: there was previously no way to revoke a
// compromised/offboarded SysAdmin credential through the product at all,
// only directly in the DB. Deactivating blocks new logins immediately
// (authController.login) and any already-issued token on its very next
// system-admin request (requireActiveSuperAdmin below) — unlike a tenant
// staff token, which is stateless until it expires, this one is checked live
// specifically because SUPER_ADMIN is the highest-privilege role in the system.
export const setSystemAdminActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'isActive must be a boolean' });
    }
    if (id === req.user!.userId && !isActive) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'You cannot deactivate your own account' });
    }

    const target = await prisma.user.findFirst({ where: { id, role: 'SUPER_ADMIN' } });
    if (!target) return errorResponse(res, 'errors.not_found', 404);

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
    });

    logAudit({
      req,
      category: 'SYSTEM',
      action: isActive ? 'SUPER_ADMIN_REACTIVATED' : 'SUPER_ADMIN_DEACTIVATED',
      targetType: 'User',
      targetId: updated.id,
      targetLabel: updated.email,
    });

    return successResponse(res, updated);
  } catch (error) {
    console.error('Set system admin active error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getSystemMetrics = async (req: Request, res: Response) => {
  try {
    const totalTenants = await prisma.restaurant.count();
    const totalUsers = await prisma.user.count();
    const totalReservations = await prisma.reservation.count();
    
    return successResponse(res, {
      totalTenants,
      totalUsers,
      totalReservations,
    });
  } catch (error) {
    console.error('Get system metrics error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

import { generateToken, verifyToken } from '../utils/jwt';
import { setAuthCookie, setAdminStashCookie, clearAdminStashCookie } from '../utils/authCookie';
import { parseCookies } from '../utils/cookies';
import { ADMIN_STASH_COOKIE } from '../utils/authCookie';

export const impersonateTenant = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Find the primary admin of this restaurant
    const adminUser = await prisma.user.findFirst({
      where: {
        restaurantId: id,
        role: 'ADMIN'
      }
    });

    if (!adminUser) {
      return errorResponse(res, 'errors.not_found', 404, { message: 'No admin user found for this tenant.' });
    }

    // impersonatedBy links every action taken during this session back to the
    // real SUPER_ADMIN driving it (see logAudit, which reads this claim off
    // req.user) — previously the only trace was the single audit row below;
    // every subsequent action was indistinguishable from the tenant admin's own.
    const token = generateToken(adminUser.id, adminUser.restaurantId, adminUser.role, req.user!.userId);
    setAuthCookie(res, token);
    // Stash the SUPER_ADMIN's own current token server-side (also httpOnly)
    // so stop-impersonation can restore it without a fresh login. req.token is
    // the raw token this very request authenticated with (set by authMiddleware).
    if (req.token) setAdminStashCookie(res, req.token);

    logAudit({
      req,
      restaurantId: id,
      category: 'SYSTEM',
      action: 'IMPERSONATION_STARTED',
      targetType: 'User',
      targetId: adminUser.id,
      targetLabel: adminUser.email,
    });

    return successResponse(res, {
      user: {
        id: adminUser.id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        role: adminUser.role,
        restaurantId: adminUser.restaurantId,
        permissions: adminUser.permissions
      },
      token
    });
  } catch (error) {
    console.error('Impersonate tenant error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /system/stop-impersonation — restores the stashed SUPER_ADMIN session
// set aside by impersonateTenant. Reads the adminToken cookie directly (not
// req.user) since the caller's *current* session is the impersonated tenant
// admin's, not the SUPER_ADMIN's — this endpoint's whole job is switching back.
export const stopImpersonation = async (req: Request, res: Response) => {
  try {
    const stashed = parseCookies(req.headers.cookie)[ADMIN_STASH_COOKIE];
    if (!stashed) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'No impersonation session to return from' });
    }

    let decoded;
    try {
      decoded = verifyToken(stashed);
    } catch {
      clearAdminStashCookie(res);
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Stashed session is no longer valid' });
    }
    if (decoded.role !== 'SUPER_ADMIN') {
      clearAdminStashCookie(res);
      return errorResponse(res, 'errors.unauthorized', 401);
    }

    const admin = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!admin) {
      clearAdminStashCookie(res);
      return errorResponse(res, 'errors.unauthorized', 401);
    }

    setAuthCookie(res, stashed);
    clearAdminStashCookie(res);

    logAudit({
      req,
      actorId: admin.id,
      actorEmail: admin.email,
      actorName: `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim() || null,
      actorRole: admin.role,
      category: 'SYSTEM',
      action: 'IMPERSONATION_STOPPED',
      targetType: 'User',
      targetId: admin.id,
      targetLabel: admin.email,
    });

    return successResponse(res, {
      user: {
        id: admin.id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        restaurantId: admin.restaurantId,
        permissions: admin.permissions,
      },
    });
  } catch (error) {
    console.error('Stop impersonation error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
