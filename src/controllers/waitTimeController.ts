import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getWaitTimeConfig = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    let config = await prisma.waitTimeConfig.findUnique({
      where: { restaurantId }
    });

    if (!config) {
      config = await prisma.waitTimeConfig.create({
        data: { restaurantId }
      });
    }

    return successResponse(res, config);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateWaitTimeConfig = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { 
      isWaitTimeEnabled,
      isWaitTimeCalculated,
      manualWaitTime,
      peopleWaiting,
      waitTimePerPerson
    } = req.body;

    const config = await prisma.waitTimeConfig.upsert({
      where: { restaurantId },
      update: {
        isWaitTimeEnabled,
        isWaitTimeCalculated,
        manualWaitTime,
        peopleWaiting,
        waitTimePerPerson
      },
      create: {
        restaurantId,
        isWaitTimeEnabled,
        isWaitTimeCalculated,
        manualWaitTime,
        peopleWaiting,
        waitTimePerPerson
      }
    });

    return successResponse(res, config);
  } catch (error) {
    console.error('Update wait time config error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
