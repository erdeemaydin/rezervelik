import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { errorResponse } from '../utils/response';
import type { FeatureProfile } from '../config/businessProfiles';

// Server-side enforcement of the SysAdmin-controlled module flags on
// RestaurantSettings (see src/config/businessProfiles.ts). These flags were
// previously only consumed by the frontend to hide/show nav — nothing on the
// server rejected a direct API call to a module a tenant's businessType/plan
// doesn't include (e.g. a CLINIC tenant, whose profile defaults
// hasPaymentFeature off, could still hit payment endpoints directly).
// Mount after tenantMiddleware, which sets req.restaurantId.
export const requireFeature = (flag: keyof FeatureProfile) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return errorResponse(res, 'errors.validation_error', 400);

    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId },
      select: { [flag]: true },
    });

    if (!settings || !(settings as Record<string, unknown>)[flag]) {
      return errorResponse(res, 'errors.forbidden', 403, { message: `This feature is not enabled for this account (${flag})` });
    }
    next();
  };
};
