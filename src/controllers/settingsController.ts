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
      operatingHours 
    } = req.body;

    const settings = await prisma.restaurantSettings.update({
      where: { restaurantId },
      data: {
        isReservationEnabled,
        logic,
        defaultDurationMinutes,
        isPaidReservationEnabled,
        depositAmount,
        currency,
        operatingHours
      }
    });

    return successResponse(res, settings);
  } catch (error) {
    console.error('Update settings error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
