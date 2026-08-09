import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { errorResponse } from '../utils/response';
import prisma from '../config/prisma';
import { parseCookies } from '../utils/cookies';
import { TOKEN_COOKIE } from '../utils/authCookie';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; restaurantId?: string | null; role: string; impersonatedBy?: string };
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

    // Ensure the user's token matches the requested restaurantId if using multi-tenant middleware
    if (decoded.role !== 'SUPER_ADMIN' && req.restaurantId && req.restaurantId !== decoded.restaurantId) {
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
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { isActive: true } });
    if (!user || !user.isActive) {
      return errorResponse(res, 'errors.unauthorized', 401);
    }
    next();
  } catch {
    return errorResponse(res, 'errors.internal_error', 500);
  }
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

    // Super Admin and Tenant Admin have full access bypass
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
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
