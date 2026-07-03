import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { findAvailableTable } from '../utils/reservationConflict';

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
          isFullyBooked: daySetting.isFullyBooked,
          autoConfirm: daySetting.autoConfirm,
          maxCapacityOverride: daySetting.maxCapacityOverride
      } : {
          isReservationEnabled: restaurant.settings?.isReservationEnabled ?? true,
          isFullyBooked: false,
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
    const { customerName, customerPhone, partySize, targetDate, notes } = req.body;

    if (!customerName || !customerPhone || !partySize) {
      return errorResponse(res, 'Missing parameters', 400);
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: { waitTimeConfig: true }
    });

    if (!restaurant) return errorResponse(res, 'Restaurant not found', 404);

    const config = restaurant.waitTimeConfig;
    const isDateWaitlist = Boolean(targetDate);

    // The date-based "notify me if a table opens up" waitlist (for fully-booked days)
    // is a separate feature from the real-time walk-in queue, and isn't gated by it.
    if (!isDateWaitlist && (!config || !config.isWaitlistOpen)) {
      return errorResponse(res, 'Waitlist is not currently open', 403);
    }

    let quotedWaitTime = null;
    if (!isDateWaitlist && config?.isWaitTimeCalculated) {
      quotedWaitTime = config.peopleWaiting * config.waitTimePerPersonUpper; // Conservative estimate

      // Auto increment the people waiting so the next person gets a higher quote
      await prisma.waitTimeConfig.update({
        where: { id: config.id },
        data: { peopleWaiting: { increment: parseInt(partySize) } }
      });
    } else if (!isDateWaitlist && config?.manualWaitTimeUpper) {
      quotedWaitTime = config.manualWaitTimeUpper;
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        restaurantId: restaurant.id,
        customerName,
        customerPhone,
        partySize: parseInt(partySize),
        quotedWaitTime,
        status: 'WAITING',
        targetDate: targetDate || null,
        notes: notes || null
      }
    });

    return successResponse(res, entry, undefined, 201);
  } catch (error) {
    console.error('Public join waitlist error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const getOffer = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const entry = await prisma.waitlistEntry.findUnique({
      where: { offerToken: token },
      include: { restaurant: { select: { slug: true, name: true } } }
    });

    if (!entry) return errorResponse(res, 'Offer not found or invalid', 404);
    
    // Check if expired
    if (entry.offerExpiresAt && new Date() > entry.offerExpiresAt) {
      return errorResponse(res, 'This offer has expired', 400);
    }

    if (entry.status !== 'OFFERED') {
      return errorResponse(res, 'This offer is no longer available', 400);
    }

    return successResponse(res, entry);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const acceptOffer = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const entry = await prisma.waitlistEntry.findUnique({
      where: { offerToken: token }
    });

    if (!entry) return errorResponse(res, 'Offer not found', 404);
    if (entry.status !== 'OFFERED') return errorResponse(res, 'Offer no longer available', 400);
    if (entry.offerExpiresAt && new Date() > entry.offerExpiresAt) return errorResponse(res, 'Offer expired', 400);

    // Create a real reservation
    const startTimeStr = entry.offeredTime ? `${entry.targetDate}T${entry.offeredTime}:00+03:00` : `${entry.targetDate}T19:00:00+03:00`;
    const start = new Date(startTimeStr);
    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId: entry.restaurantId } });
    const end = new Date(start.getTime() + (settings?.defaultDurationMinutes || 90) * 60000);

    await prisma.$transaction(async (tx) => {
      // Try to seat the offer on a free table; leave unassigned for staff if none.
      const table = await findAvailableTable({
        restaurantId: entry.restaurantId, partySize: entry.partySize, start, end, tx,
      });
      await tx.reservation.create({
        data: {
          restaurantId: entry.restaurantId,
          tableId: table?.id ?? null,
          customerName: entry.customerName,
          customerPhone: entry.customerPhone,
          guestCount: entry.partySize,
          startTime: start,
          endTime: end,
          status: 'CONFIRMED',
          notes: 'Converted from Waitlist Offer'
        }
      });
      await tx.waitlistEntry.update({
        where: { id: entry.id },
        data: { status: 'ACCEPTED' }
      });
    });

    return successResponse(res, { message: 'Offer accepted' });
  } catch (error) {
    console.error('Accept offer error:', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const declineOffer = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const entry = await prisma.waitlistEntry.findUnique({
      where: { offerToken: token }
    });

    if (!entry) return errorResponse(res, 'Offer not found', 404);
    if (entry.status !== 'OFFERED') return errorResponse(res, 'Offer no longer available', 400);

    await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: 'CANCELED', notes: (entry.notes || '') + ' - Offer declined by customer' }
    });

    return successResponse(res, { message: 'Offer declined' });
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
