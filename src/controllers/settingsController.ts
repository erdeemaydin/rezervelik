import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getSettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId }
    });
    return successResponse(res, settings);
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
      currency,
      operatingHours,
      schedulingSystem,
      staffScheduleView,
      timezone,
      maxPartySize,
      openingHour,
      closingHour
    } = req.body;

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
        currency,
        operatingHours,
        schedulingSystem,
        staffScheduleView,
        timezone,
        maxPartySize: maxPartySize != null ? parseInt(maxPartySize) : undefined,
        openingHour: openingHour != null ? clampHour(openingHour, 10) : undefined,
        closingHour: closingHour != null ? clampHour(closingHour, 23) : undefined
      }
    });

    return successResponse(res, settings);
  } catch (error) {
    console.error('Update settings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
