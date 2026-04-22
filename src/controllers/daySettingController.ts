import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getDaySettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const settings = await prisma.daySetting.findMany({
      where: { restaurantId },
      orderBy: { date: 'asc' }
    });
    return successResponse(res, settings);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const upsertDaySetting = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { date, eventTitle, isReservationEnabled, autoConfirm, maxCapacityOverride } = req.body;

    if (!date) return errorResponse(res, 'errors.validation_error', 400, { message: 'Date is required' });

    const setting = await prisma.daySetting.upsert({
      where: {
        restaurantId_date: { restaurantId, date }
      },
      update: {
        eventTitle,
        isReservationEnabled,
        autoConfirm,
        maxCapacityOverride
      },
      create: {
        restaurantId,
        date,
        eventTitle,
        isReservationEnabled,
        autoConfirm,
        maxCapacityOverride
      }
    });

    return successResponse(res, setting);
  } catch (error) {
    console.error('Upsert day setting error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const bulkUpsertDaySettings = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { dates, eventTitle, isReservationEnabled, autoConfirm } = req.body;

    if (!dates || !Array.isArray(dates)) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Dates array is required' });
    }

    const operations = dates.map(date => 
      prisma.daySetting.upsert({
        where: { restaurantId_date: { restaurantId, date } },
        update: { eventTitle, isReservationEnabled, autoConfirm },
        create: { restaurantId, date, eventTitle, isReservationEnabled, autoConfirm }
      })
    );

    await Promise.all(operations);
    return successResponse(res, null, 'Bulk settings applied');
  } catch (error) {
    console.error('Bulk upsert error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteDaySetting = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { date } = req.params;

    await prisma.daySetting.delete({
      where: {
        restaurantId_date: { restaurantId, date }
      }
    });

    return successResponse(res, null, 'Day setting deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
