import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { generateResetToken, RESET_TOKEN_TTL_MS } from '../utils/resetToken';
import {
  DEFAULT_BUSINESS_TYPE,
  FEATURE_FLAG_KEYS,
  getFeatureProfile,
  isBusinessType,
} from '../config/businessProfiles';
import { generatePublicApiKey } from '../utils/publicApiKey';
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
    let setupToken = null;
    let setupTokenExpiresAt = null;
    let finalPassword = adminPassword;

    if (!finalPassword) {
      isInvite = true;
      finalPassword = Math.random().toString(36).slice(-10) + 'A1!'; // random secure dummy password
      setupToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      setupTokenExpiresAt = new Date();
      setupTokenExpiresAt.setDate(setupTokenExpiresAt.getDate() + 7); // 7 days expiry
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
          setupToken,
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
      return successResponse(res, { ...result, setupLink: `/auth/setup/${setupToken}` }, undefined, 201);
    }
    return successResponse(res, result, undefined, 201);
  } catch (error) {
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
      defaultLanguage,
      showAuditLogToTenant
    } = req.body;

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

    const envSecretToken = process.env.SETUP_SECRET_TOKEN;
    if (!envSecretToken || secretToken !== envSecretToken) {
      return errorResponse(res, 'errors.unauthorized', 403, { message: 'Invalid or unconfigured setup token' });
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
    const { maintenanceMode, publicRegistrationEnabled, enforce2FAForAdmins, measurementSystem } = req.body;

    // Only accept the two supported conventions; anything else falls back to METRIC.
    const normalizedSystem = measurementSystem === 'US' ? 'US' : 'METRIC';

    const settings = await prisma.globalSettings.upsert({
      where: { id: 'global_1' },
      update: { maintenanceMode, publicRegistrationEnabled, enforce2FAForAdmins, measurementSystem: normalizedSystem },
      create: { id: 'global_1', maintenanceMode, publicRegistrationEnabled, enforce2FAForAdmins, measurementSystem: normalizedSystem }
    });

    logAudit({
      req,
      category: 'SYSTEM',
      action: 'GLOBAL_SETTINGS_UPDATED',
      targetType: 'GlobalSettings',
      targetId: 'global_1',
      metadata: { maintenanceMode, publicRegistrationEnabled, enforce2FAForAdmins, measurementSystem: normalizedSystem },
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
        createdAt: true
      }
    });
    return successResponse(res, admins);
  } catch (error) {
    console.error('Get system admins error:', error);
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

import { generateToken } from '../utils/jwt';

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

    // Generate a token for this user
    const token = generateToken(adminUser.id, adminUser.restaurantId, adminUser.role);

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
