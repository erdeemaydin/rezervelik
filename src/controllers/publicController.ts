import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getRestaurantBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: {
        settings: true,
        waitTimeConfig: true,
        customization: true,
        menus: {
          where: { isActive: true },
          include: {
            categories: {
              where: { parentId: null },
              orderBy: { order: 'asc' },
              include: {
                items: {
                  where: { isAvailable: true },
                  orderBy: { order: 'asc' }
                },
                children: {
                  orderBy: { order: 'asc' },
                  include: {
                    items: {
                      where: { isAvailable: true },
                      orderBy: { order: 'asc' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!restaurant) return errorResponse(res, 'errors.restaurant_not_found', 404);
    return successResponse(res, restaurant);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getDayStatus = async (req: Request, res: Response) => {
  try {
    const { slug, date } = req.query; // YYYY-MM-DD
    if (!slug || !date) return errorResponse(res, 'Missing parameters', 400);

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: slug as string },
      include: { settings: true }
    });

    if (!restaurant) return errorResponse(res, 'Restaurant not found', 404);

    const daySetting = await prisma.daySetting.findUnique({
      where: {
        restaurantId_date: {
          restaurantId: restaurant.id,
          date: date as string
        }
      }
    });

    // Check if any table is available at all on that day (coarse check)
    const tablesCount = await prisma.table.count({ where: { restaurantId: restaurant.id } });

    return successResponse(res, {
      daySetting: daySetting ? {
          isReservationEnabled: daySetting.isReservationEnabled,
          autoConfirm: daySetting.autoConfirm,
          maxCapacityOverride: daySetting.maxCapacityOverride
      } : {
          isReservationEnabled: restaurant.settings?.isReservationEnabled ?? true,
          autoConfirm: false,
      },
      hasTables: tablesCount > 0
    });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const joinPublicWaitlist = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { customerName, customerPhone, partySize } = req.body;

    if (!customerName || !customerPhone || !partySize) {
      return errorResponse(res, 'Missing parameters', 400);
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: { waitTimeConfig: true }
    });

    if (!restaurant) return errorResponse(res, 'Restaurant not found', 404);
    
    const config = restaurant.waitTimeConfig;
    if (!config || !config.isWaitlistOpen) {
      return errorResponse(res, 'Waitlist is not currently open', 403);
    }

    let quotedWaitTime = null;
    if (config.isWaitTimeCalculated) {
      quotedWaitTime = config.peopleWaiting * config.waitTimePerPersonUpper; // Conservative estimate
      
      // Auto increment the people waiting so the next person gets a higher quote
      await prisma.waitTimeConfig.update({
        where: { id: config.id },
        data: { peopleWaiting: { increment: parseInt(partySize) } }
      });
    } else if (config.manualWaitTimeUpper) {
      quotedWaitTime = config.manualWaitTimeUpper;
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId: restaurant.id,
        customerName,
        customerPhone,
        partySize: parseInt(partySize),
        quotedWaitTime,
        status: 'WAITING'
      }
    });

    return successResponse(res, entry, undefined, 201);
  } catch (error) {
    console.error('Public join waitlist error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
