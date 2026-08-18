import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { errorResponse } from '../utils/response';
import prisma from '../config/prisma';
import { parseCookies } from '../utils/cookies';
import { TOKEN_COOKIE } from '../utils/authCookie';
import { SystemPermissionKey } from '../config/systemPermissions';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        restaurantId?: string | null;
        role: string;
        // Only meaningful when role === 'SUPER_ADMIN'. Set from the JWT by
        // authMiddleware, then overwritten with a live DB value by
        // requireActiveSuperAdmin for every /api/system/* request — see that
        // function for why. Undefined/true is treated as root for any
        // SUPER_ADMIN token minted before this field existed.
        isRootAdmin?: boolean;
        impersonatedBy?: string;
      };
      // The raw bearer token this request authenticated with — only used by
      // the impersonate flow to stash the SUPER_ADMIN's own token server-side
      // before switching to the impersonated user's. Nothing else should need
      // the raw token; use req.user for everything else.
      token?: string;
    }
  }
}

// The session cookie (httpOnly, invisible to JS — see utils/authCookie.ts) is
// the primary credential for the browser SPA. The Authorization header stays
// supported as a fallback for non-browser API callers (scripts/smoke-test.mjs,
// curl/Postman, a future mobile client) that choose to manage their own token;
// that is those callers' own risk tradeoff, not a gap in the SPA's own storage.
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const cookieToken = parseCookies(req.headers.cookie)[TOKEN_COOKIE];
  const authHeader = req.headers.authorization;
  const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const token = cookieToken || headerToken;

  if (!token) {
    console.log('[AuthMiddleware] No session cookie or Authorization header present');
    return errorResponse(res, 'errors.unauthorized', 401);
  }

  try {
    const decoded = verifyToken(token);

    // Only a full root SUPER_ADMIN (isRootAdmin !== false) may reach a tenant's
    // scoped routes with an arbitrary X-Restaurant-ID and no restaurantId of
    // their own — a restricted sub-admin has no tenant data access at all, only
    // whatever the /api/system/* console grants them (see requireSystemPermission
    // and requireRootSystemAdmin below). Without this check, any SUPER_ADMIN-role
    // token — including a deliberately restricted sub-admin's — would bypass
    // tenant scoping entirely on every tenant route in the app.
    const isRootSuperAdmin = decoded.role === 'SUPER_ADMIN' && decoded.isRootAdmin !== false;
    if (!isRootSuperAdmin && req.restaurantId && req.restaurantId !== decoded.restaurantId) {
      console.log(`[AuthMiddleware] Tenant mismatch. Request tenant: ${req.restaurantId}, Token tenant: ${decoded.restaurantId}`);
      return errorResponse(res, 'errors.unauthorized', 403);
    }

    req.user = decoded;
    req.token = token;
    next();
  } catch (error) {
    console.log(`[AuthMiddleware] Token verification failed:`, error);
    return errorResponse(res, 'errors.unauthorized', 401);
  }
};

// Re-checks that the SUPER_ADMIN behind this token is still active, live,
// against the DB — unlike every other role, whose tokens are trusted as
// stateless until they expire. SUPER_ADMIN is the highest-privilege role in
// the system, and deactivating one (systemController.setSystemAdminActive)
// is meant to take effect immediately, not just block future logins; mount
// after authMiddleware + roleMiddleware(['SUPER_ADMIN']).
export const requireActiveSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { isActive: true, isRootAdmin: true } });
    if (!user || !user.isActive) {
      return errorResponse(res, 'errors.unauthorized', 401);
    }
    // Overwrite the JWT's (possibly stale) claim with the live DB value so a
    // root admin who gets demoted to a restricted sub-admin mid-session loses
    // root access on their very next /api/system/* request, same as isActive
    // above — not after their token happens to expire.
    req.user!.isRootAdmin = user.isRootAdmin;
    next();
  } catch {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// Root-only gate for platform-administrator management (create/list/deactivate/
// change permissions of other SUPER_ADMIN accounts). Deliberately not a
// permission a sub-admin can ever be granted (see systemPermissions.ts) —
// letting a sub-admin manage admin accounts would let it create a new root, or
// grant itself more permissions, defeating the whole restriction. Mount after
// requireActiveSuperAdmin so req.user.isRootAdmin reflects the live DB value.
export const requireRootSystemAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.isRootAdmin === false) {
    return errorResponse(res, 'errors.forbidden', 403, { message: 'Root administrator access required' });
  }
  next();
};

// Per-capability gate for the rest of the /api/system/* console. A root admin
// (isRootAdmin !== false) always passes; a restricted sub-admin only passes if
// `key` is present in their (whitelisted, sys_*-namespaced) User.permissions.
// Mount after requireActiveSuperAdmin.
export const requireSystemPermission = (key: SystemPermissionKey) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return errorResponse(res, 'errors.unauthorized', 401);
    }
    if (req.user.isRootAdmin !== false) {
      return next();
    }
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { permissions: true },
      });
      if (!user) {
        return errorResponse(res, 'errors.unauthorized', 401);
      }
      const perms = user.permissions ? user.permissions.split(',') : [];
      if (!perms.includes(key)) {
        return errorResponse(res, 'errors.forbidden', 403, { message: 'Missing required permission: ' + key });
      }
      next();
    } catch {
      return errorResponse(res, 'errors.internal_error', 500);
    }
  };
};

export const roleMiddleware = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return errorResponse(res, 'errors.unauthorized', 403);
    }
    next();
  };
};

export const requirePermission = (
  requiredPermission: string,
  options: { allowRoles?: string[] } = {}
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return errorResponse(res, 'errors.unauthorized', 401);
    }

    // Tenant ADMIN always bypasses; a SUPER_ADMIN only bypasses tenant-module
    // checks (manage_reservations, manage_staff, ...) while acting as a full
    // root admin. A restricted sub-admin (isRootAdmin === false) has no tenant
    // module access at all — falls through to the permissions-string lookup
    // below, where its permissions hold sys_* keys that will never match a
    // tenant module key, so it correctly 403s instead of bypassing.
    if (req.user.role === 'ADMIN' || (req.user.role === 'SUPER_ADMIN' && req.user.isRootAdmin !== false)) {
      return next();
    }

    // Additional roles that are always granted this permission (e.g. MANAGER for
    // back-office "view_*" permissions) without needing it in their permission
    // string. Keeps existing users working without a data migration.
    if (options.allowRoles && options.allowRoles.includes(req.user.role)) {
      return next();
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { permissions: true }
      });

      if (!user) {
        return errorResponse(res, 'errors.unauthorized', 401);
      }

      const userPermissions = user.permissions ? user.permissions.split(',') : [];

      if (!userPermissions.includes(requiredPermission)) {
        return errorResponse(res, 'errors.forbidden', 403, { message: 'Missing required permission: ' + requiredPermission });
      }

      next();
    } catch (error) {
      return errorResponse(res, 'errors.internal_error', 500);
    }
  };
};
