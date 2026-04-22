import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { errorResponse } from '../utils/response';
import prisma from '../config/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; restaurantId?: string; role: string };
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`[AuthMiddleware] Missing or invalid authorization header: ${authHeader}`);
    return errorResponse(res, 'errors.unauthorized', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    
    // Ensure the user's token matches the requested restaurantId if using multi-tenant middleware
    if (decoded.role !== 'SUPER_ADMIN' && req.restaurantId && req.restaurantId !== decoded.restaurantId) {
      console.log(`[AuthMiddleware] Tenant mismatch. Request tenant: ${req.restaurantId}, Token tenant: ${decoded.restaurantId}`);
      return errorResponse(res, 'errors.unauthorized', 403);
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.log(`[AuthMiddleware] Token verification failed:`, error);
    return errorResponse(res, 'errors.unauthorized', 401);
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

export const requirePermission = (requiredPermission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return errorResponse(res, 'errors.unauthorized', 401);
    }

    // Super Admin has full access bypass
    if (req.user.role === 'SUPER_ADMIN') {
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
