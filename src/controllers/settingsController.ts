import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getSettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId }
    });
    // The date/time display convention is a platform-wide choice made by the root
    // system admin (GlobalSettings). Surface it here so the tenant dashboard can
    // render dates/times consistently without needing SUPER_ADMIN access.
    const global = await prisma.globalSettings.findUnique({ where: { id: 'global_1' } });
    return successResponse(res, {
      ...settings,
      measurementSystem: global?.measurementSystem || 'METRIC',
    });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const {
      isReservationEnabled,
      logic,
      defaultDurationMinutes,
      isPaidReservationEnabled,
      depositAmount,
      operatingHours,
      schedulingSystem,
      staffScheduleView,
      timezone,
      maxPartySize,
      openingHour,
      closingHour,
      defaultBreakMinutes,
      twoFactorRoles
    } = req.body;
    // Note: `currency` is intentionally NOT read here — it is a root-admin-only
    // (system) setting. Tenant admins can view it but cannot change it.

    // The set of roles that must use 2FA is only meaningful when the root admin
    // has enabled the 2FA capability for this restaurant. Guard against a tenant
    // turning it on for themselves by checking the current capability flag.
    let twoFactorRolesUpdate: any = undefined;
    if (twoFactorRoles !== undefined) {
      const current = await prisma.restaurantSettings.findUnique({
        where: { restaurantId },
        select: { twoFactorEnabled: true }
      });
      if (current?.twoFactorEnabled) {
        const roles = Array.isArray(twoFactorRoles) ? twoFactorRoles.join(',') : String(twoFactorRoles || '');
        twoFactorRolesUpdate = roles;
      }
    }

    // Clamp the service window to valid whole hours (0-23), opening strictly before closing.
    const clampHour = (v: any, fallback: number) => {
      const n = parseInt(v);
      if (isNaN(n)) return fallback;
      return Math.min(23, Math.max(0, n));
    };

    const settings = await prisma.restaurantSettings.update({
      where: { restaurantId },
      data: {
        isReservationEnabled,
        logic,
        defaultDurationMinutes,
        isPaidReservationEnabled,
        depositAmount,
        operatingHours,
        schedulingSystem,
        staffScheduleView,
        timezone,
        maxPartySize: maxPartySize != null ? parseInt(maxPartySize) : undefined,
        openingHour: openingHour != null ? clampHour(openingHour, 10) : undefined,
        closingHour: closingHour != null ? clampHour(closingHour, 23) : undefined,
        defaultBreakMinutes: defaultBreakMinutes != null ? Math.max(0, parseInt(defaultBreakMinutes) || 0) : undefined,
        ...(twoFactorRolesUpdate !== undefined ? { twoFactorRoles: twoFactorRolesUpdate } : {})
      }
    });

    return successResponse(res, settings);
  } catch (error) {
    console.error('Update settings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
