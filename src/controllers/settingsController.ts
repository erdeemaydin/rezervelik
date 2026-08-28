import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { logAudit } from '../services/auditService';

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
    // businessType lives on Restaurant (set by the SysAdmin); surface it here so the
    // dashboard can pick per-vertical terminology labels without a SUPER_ADMIN call.
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessType: true, hasOnlineOrdering: true },
    });
    return successResponse(res, {
      ...settings,
      measurementSystem: global?.measurementSystem || 'METRIC',
      businessType: restaurant?.businessType || 'RESTAURANT',
      // Commercial add-on flag (lives on Restaurant, not RestaurantSettings —
      // see docs/packaging/README.md). Surfaced here the same way
      // businessType is above, so AdminLayout's opt-in feature gating
      // (hasFeature('hasOnlineOrdering')) has something to read.
      hasOnlineOrdering: restaurant?.hasOnlineOrdering === true,
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
      dashboardTheme,
      allowOverbooking,
      overbookingMaxExtraCovers,
      overbookingMaxExtraReservations
    } = req.body;
    // Note: `currency` is intentionally NOT read here — it is a root-admin-only
    // (system) setting. Tenant admins can view it but cannot change it.
    //
    // 2FA (`twoFactorEnabled` + `twoFactorRoles`) is likewise root-admin-only —
    // it is set exclusively via the system-admin per-tenant settings endpoint, so
    // it is deliberately NOT read from this tenant-facing request. A tenant admin
    // can neither enable/disable 2FA nor choose which roles it applies to.

    // Whitelist of selectable admin dashboard themes (must match the ids in
    // frontend/src/lib/themes.ts). Reject anything else so a bad value can't reach
    // the client and break theme lookup.
    const ALLOWED_THEMES = ['default', 'terracotta', 'forest', 'burgundy', 'amber'];
    const themeUpdate =
      dashboardTheme !== undefined && ALLOWED_THEMES.includes(dashboardTheme)
        ? dashboardTheme
        : undefined;

    // Clamp the service window to valid whole hours (0-23), opening strictly before closing.
    const clampHour = (v: any, fallback: number) => {
      const n = parseInt(v);
      if (isNaN(n)) return fallback;
      return Math.min(23, Math.max(0, n));
    };

    // Overbooking (see PROJECT_LOGIC.md / getEffectiveOverbookingConfig): the
    // feature must only ever be "on" with both caps validly set, so we reject
    // the whole request rather than silently saving a half-configured state.
    const isPositiveInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

    let overbookingCoversValue: number | undefined;
    if (overbookingMaxExtraCovers !== undefined) {
      const n = parseInt(overbookingMaxExtraCovers);
      if (!isPositiveInt(n)) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'overbookingMaxExtraCovers must be a positive integer' });
      }
      overbookingCoversValue = n;
    }

    let overbookingReservationsValue: number | undefined;
    if (overbookingMaxExtraReservations !== undefined) {
      const n = parseInt(overbookingMaxExtraReservations);
      if (!isPositiveInt(n)) {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'overbookingMaxExtraReservations must be a positive integer' });
      }
      overbookingReservationsValue = n;
    }

    if (allowOverbooking === true) {
      const existing = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
      const resolvedCovers = overbookingCoversValue ?? existing?.overbookingMaxExtraCovers;
      const resolvedReservations = overbookingReservationsValue ?? existing?.overbookingMaxExtraReservations;
      if (!isPositiveInt(resolvedCovers) || !isPositiveInt(resolvedReservations)) {
        return errorResponse(res, 'errors.validation_error', 400, {
          message: 'Overbooking requires both overbookingMaxExtraCovers and overbookingMaxExtraReservations to be set as positive integers.'
        });
      }
    }

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
        allowOverbooking,
        overbookingMaxExtraCovers: overbookingCoversValue,
        overbookingMaxExtraReservations: overbookingReservationsValue,
        ...(themeUpdate !== undefined ? { dashboardTheme: themeUpdate } : {})
      }
    });

    logAudit({
      req,
      restaurantId,
      category: 'SETTINGS',
      action: 'RESTAURANT_SETTINGS_UPDATED',
      targetType: 'RestaurantSettings',
      targetId: settings.id,
    });

    return successResponse(res, settings);
  } catch (error) {
    console.error('Update settings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
