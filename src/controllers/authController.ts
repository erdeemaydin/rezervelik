import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/prisma';
import { generateToken, generateOtpChallengeToken, verifyOtpChallengeToken } from '../utils/jwt';
import { successResponse, errorResponse } from '../utils/response';
import { hashResetToken } from '../utils/resetToken';
import { generateOtpSecret, verifyTotp, buildOtpAuthUrl } from '../utils/totp';
import { logAudit } from '../services/auditService';

// Whether a given user is required to complete 2FA at login. The requirement is
// role-based per restaurant (root admin enables the capability; the tenant admin
// picks which roles it applies to). Root/system admins fall back to the legacy
// per-user flag since they aren't scoped to a restaurant's settings.
const userNeedsOtp = async (user: { role: string; restaurantId: string | null; otpRequired: boolean }): Promise<boolean> => {
  if (user.role === 'SUPER_ADMIN') return user.otpRequired;
  if (!user.restaurantId) return false;
  const s = await prisma.restaurantSettings.findUnique({
    where: { restaurantId: user.restaurantId },
    select: { twoFactorEnabled: true, twoFactorRoles: true }
  });
  if (!s?.twoFactorEnabled) return false;
  const roles = s.twoFactorRoles ? s.twoFactorRoles.split(',').map(r => r.trim()).filter(Boolean) : [];
  return roles.includes(user.role);
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, restaurantName } = req.body;

    // Basic validation
    if (!email || !password || !firstName || !lastName || !restaurantName) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'All fields are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email already in use' });
    }

    const globalSettings = await prisma.globalSettings.findUnique({ where: { id: 'global_1' } });
    if (globalSettings && globalSettings.publicRegistrationEnabled === false) {
      return errorResponse(res, 'errors.unauthorized', 403, { message: 'Public registration is currently disabled' });
    }

    // Generate a slug from restaurant name
    const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const existingRestaurant = await prisma.restaurant.findUnique({ where: { slug } });
    if (existingRestaurant) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Restaurant name is already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Restaurant and Admin User in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      const restaurant = await prisma.restaurant.create({
        data: {
          name: restaurantName,
          slug,
          contactEmail: email,
          settings: {
            create: {}
          }
        }
      });

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashedPassword,
          firstName,
          lastName,
          role: 'ADMIN',
          permissions: 'manage_reservations,manage_tables,manage_menu,manage_calendar,manage_staff,manage_settings',
          restaurantId: restaurant.id
        }
      });

      return { restaurant, user };
    });

    const token = generateToken(result.user.id, result.restaurant.id, result.user.role);

    return successResponse(res, {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
        permissions: result.user.permissions
      },
      restaurant: result.restaurant,
      token
    }, 'messages.welcome', 201);

  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    console.log(`[Auth] Login attempt: ${email}`);

    if (!email || !password) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      console.log(`[Auth] User not found: ${email}`);
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      console.log(`[Auth] Invalid password for: ${email}`);
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Invalid credentials' });
    }

    // Two-factor gate: if this user's role requires OTP for their restaurant, the
    // password step alone does not grant a session — return a challenge instead.
    if (await userNeedsOtp(user)) {
      const enrolled = !!user.otpConfirmedAt && !!user.otpSecret;
      if (enrolled) {
        // Already set up: just ask for a code, verified against the stored secret.
        return successResponse(res, {
          otpRequired: true,
          setupRequired: false,
          otpToken: generateOtpChallengeToken(user.id)
        });
      }
      // Not yet enrolled: mint a fresh provisional secret and carry it *inside* the
      // signed challenge token rather than persisting it. Each login attempt gets a
      // new secret, so returning to this screen never re-shows a stale one.
      const secret = generateOtpSecret();
      return successResponse(res, {
        otpRequired: true,
        setupRequired: true,
        otpToken: generateOtpChallengeToken(user.id, secret),
        otpauthUrl: buildOtpAuthUrl(secret, user.email),
        otpSecret: secret
      });
    }

    console.log(`[Auth] Login successful: ${user.id} (${user.role})`);
    const token = generateToken(user.id, user.restaurantId, user.role);

    logAudit({
      req,
      restaurantId: user.restaurantId,
      actorId: user.id,
      actorEmail: user.email,
      actorName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || null,
      actorRole: user.role,
      category: 'AUTH',
      action: 'LOGIN',
    });

    return successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        restaurantId: user.restaurantId,
        permissions: user.permissions
      },
      token
    });

  } catch (error: any) {
    console.error('[Auth] Critical Login Error:', error.message, error.stack);
    return errorResponse(res, 'errors.internal_error', 500, { detail: error.message });
  }
};

// POST /auth/login/otp — second step of a two-factor login. Verifies the TOTP
// code against the challenge token from the password step, and (on first use)
// confirms enrollment before issuing the real session token.
export const loginVerifyOtp = async (req: Request, res: Response) => {
  try {
    const { otpToken, code } = req.body;
    if (!otpToken || !code) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'OTP token and code are required' });
    }

    let userId: string;
    let setupSecret: string | undefined;
    try {
      ({ userId, setupSecret } = verifyOtpChallengeToken(otpToken));
    } catch {
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'OTP session expired, please sign in again' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await userNeedsOtp(user))) {
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Invalid credentials' });
    }

    // During first-time setup the secret lives in the challenge token; afterwards
    // it's the confirmed secret stored on the user.
    const secret = setupSecret || user.otpSecret;
    if (!secret) {
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Invalid credentials' });
    }

    if (!verifyTotp(secret, String(code))) {
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Invalid or expired verification code' });
    }

    // Persist the secret + confirm enrollment only now that possession is proven.
    if (setupSecret) {
      await prisma.user.update({ where: { id: user.id }, data: { otpSecret: setupSecret, otpConfirmedAt: new Date() } });
    } else if (!user.otpConfirmedAt) {
      await prisma.user.update({ where: { id: user.id }, data: { otpConfirmedAt: new Date() } });
    }

    const token = generateToken(user.id, user.restaurantId, user.role);
    return successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        restaurantId: user.restaurantId,
        permissions: user.permissions
      },
      token
    });
  } catch (error) {
    console.error('[Auth] OTP verify error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /auth/change-password (authenticated) — universal self-service change for
// any user. Requires the current password; new password is bcrypt-hashed.
export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Current and new password are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'New password must be at least 8 characters long' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorResponse(res, 'errors.unauthorized', 401);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashedPassword } });

    return successResponse(res, { ok: true }, 'messages.password_reset', 200);
  } catch (error) {
    console.error('[Auth] Change password error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// GET /auth/me (authenticated) — current user profile incl. 2FA status, used by
// the profile page.
export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return errorResponse(res, 'errors.unauthorized', 401);
    return successResponse(res, {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      restaurantId: user.restaurantId,
      permissions: user.permissions,
      otpRequired: user.otpRequired,
      otpEnrolled: !!user.otpConfirmedAt
    });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /auth/2fa/setup (authenticated) — begin in-app enrollment: (re)provision a
// secret and return its provisioning URI for the QR code.
export const setupTwoFactor = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) return errorResponse(res, 'errors.unauthorized', 401);

    const secret = generateOtpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { otpSecret: secret, otpConfirmedAt: null } });

    return successResponse(res, {
      otpauthUrl: buildOtpAuthUrl(secret, user.email),
      otpSecret: secret
    });
  } catch (error) {
    console.error('[Auth] 2FA setup error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /auth/2fa/confirm (authenticated) — finish enrollment by verifying a code.
export const confirmTwoFactor = async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || !user.otpSecret) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Start setup before confirming' });
    }
    if (!verifyTotp(user.otpSecret, String(code || ''))) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid or expired verification code' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { otpConfirmedAt: new Date() } });
    return successResponse(res, { otpEnrolled: true });
  } catch (error) {
    console.error('[Auth] 2FA confirm error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const verifyPassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { password } = req.body;

    if (!password) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Password is required' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'User not found' });
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return errorResponse(res, 'errors.unauthorized', 401, { message: 'Invalid password' });
    }

    return successResponse(res, { verified: true });
  } catch (error) {
    console.error('[Auth] Verify password error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const completeSetup = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Token and password required' });
    }

    const user = await prisma.user.findUnique({ where: { setupToken: token } });
    
    if (!user || !user.setupTokenExpiresAt || new Date() > user.setupTokenExpiresAt) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid or expired setup token' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        setupToken: null,
        setupTokenExpiresAt: null
      }
    });

    const authToken = generateToken(user.id, user.restaurantId, user.role);

    return successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        restaurantId: user.restaurantId,
        permissions: user.permissions
      },
      token: authToken
    }, 'messages.welcome', 200);

  } catch (error) {
    console.error('[Auth] Complete setup error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// GET /auth/reset-password/:token — lets the reset page confirm a link is still
// valid (and show whose account it is) before rendering the new-password form.
export const validateResetToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) return errorResponse(res, 'errors.validation_error', 400, { message: 'Token required' });

    const user = await prisma.user.findUnique({ where: { resetTokenHash: hashResetToken(token) } });

    if (!user || !user.resetTokenExpiresAt || new Date() > user.resetTokenExpiresAt) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid or expired reset link' });
    }

    return successResponse(res, { valid: true, email: user.email });
  } catch (error) {
    console.error('[Auth] Validate reset token error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// POST /auth/reset-password — set a new password from a valid reset token.
// The password is bcrypt-hashed; the reset token is consumed (single-use).
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Token and password required' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Password must be at least 8 characters long' });
    }

    const user = await prisma.user.findUnique({ where: { resetTokenHash: hashResetToken(token) } });

    if (!user || !user.resetTokenExpiresAt || new Date() > user.resetTokenExpiresAt) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid or expired reset link' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        // Consume the token so the link cannot be reused.
        resetTokenHash: null,
        resetTokenExpiresAt: null
      }
    });

    return successResponse(res, { email: user.email }, 'messages.password_reset', 200);
  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
