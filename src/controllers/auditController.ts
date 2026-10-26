import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

const clampLimit = (raw: unknown, def = 100, max = 500): number => {
  const n = parseInt(String(raw ?? ''), 10);
  if (Number.isNaN(n) || n <= 0) return def;
  return Math.min(n, max);
};

// GET /system/audit  (SUPER_ADMIN only)
// Platform-wide activity trail. Optional filters: restaurantId, category, actorId.
// Returns newest first, with the related restaurant name for display.
export const getSystemAuditLogs = async (req: Request, res: Response) => {
  try {
    const { restaurantId, category, actorId } = req.query;
    const limit = clampLimit(req.query.limit);

    const where: Record<string, unknown> = {};
    if (typeof restaurantId === 'string' && restaurantId) where.restaurantId = restaurantId;
    if (typeof category === 'string' && category) where.category = category;
    if (typeof actorId === 'string' && actorId) where.actorId = actorId;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });

    return successResponse(res, logs);
  } catch (error) {
    console.error('Get system audit logs error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

// GET /audit  (tenant ADMIN/MANAGER, scoped by X-Restaurant-ID)
// Returns the calling tenant's own activity trail — but only if the root/system
// admin has enabled showAuditLogToTenant for this restaurant. Otherwise 403.
export const getTenantAuditLogs = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;

    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId },
      select: { showAuditLogToTenant: true },
    });

    if (!settings?.showAuditLogToTenant) {
      return errorResponse(res, 'errors.forbidden', 403, {
        message: 'Audit log access is not enabled for this account',
      });
    }

    const { category } = req.query;
    const limit = clampLimit(req.query.limit);

    const where: Record<string, unknown> = {
      restaurantId,
      OR: [
        { actorRole: { not: 'SUPER_ADMIN' } },
        { actorRole: null }
      ]
    };
    if (typeof category === 'string' && category) where.category = category;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return successResponse(res, logs);
  } catch (error) {
    console.error('Get tenant audit logs error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
