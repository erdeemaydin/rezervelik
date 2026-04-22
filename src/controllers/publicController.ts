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
      where: { slug: slug as string }
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
      } : null,
      hasTables: tablesCount > 0
    });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
