import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const bulkUpdatePrices = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { updateType, value, isIncrease, scheduledFor } = req.body;

    if (!updateType || value === undefined || isIncrease === undefined) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing parameters' });
    }

    // If scheduledFor is not provided, apply immediately by setting it to now
    const targetDate = scheduledFor ? new Date(scheduledFor) : new Date();

    const update = await prisma.scheduledPriceUpdate.create({
      data: {
        restaurantId,
        updateType,
        value: parseFloat(value),
        isIncrease,
        scheduledFor: targetDate
      }
    });

    // If it's immediate, the background worker will pick it up within 60 seconds
    return successResponse(res, update, undefined, 201);
  } catch (error) {
    console.error('Bulk update prices error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
