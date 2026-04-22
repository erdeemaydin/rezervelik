import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getReservations = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const reservations = await prisma.reservation.findMany({
      where: { restaurantId },
      include: { 
        table: true,
        category: true
      },
      orderBy: [
        { isVIP: 'desc' },
        { startTime: 'asc' }
      ]
    });
    return successResponse(res, reservations);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createReservation = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { 
      tableId, categoryId, customerName, customerEmail, customerPhone, 
      guestCount, startTime, notes, internalNote, isVIP 
    } = req.body;

    if (!customerName || !customerPhone || !guestCount || !startTime) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    const start = new Date(startTime);
    const dateStr = start.toISOString().split('T')[0];

    // Check DaySetting
    const daySetting = await prisma.daySetting.findUnique({
      where: { restaurantId_date: { restaurantId, date: dateStr } }
    });

    if (daySetting && !daySetting.isReservationEnabled) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Reservations are disabled for this day.' });
    }

    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId }
    });

    if (!settings || !settings.isReservationEnabled) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Reservations are currently disabled for this restaurant' });
    }

    // Table Availability Check
    let finalTableId = tableId === 'none' ? null : tableId;

    if (finalTableId) {
       const isTableOccupied = await prisma.reservation.findFirst({
         where: {
           tableId: finalTableId,
           status: { in: ['CONFIRMED', 'PENDING'] },
           startTime: { lt: new Date(start.getTime() + 90 * 60000) }, // Assuming 90 min window
           endTime: { gt: start }
         }
       });
       if (isTableOccupied) return errorResponse(res, 'errors.validation_error', 400, { message: 'Selected table is not available at this time.' });
    } else {
       // Auto-assign first available table that fits guestCount
       const availableTable = await prisma.table.findFirst({
         where: {
           restaurantId,
           capacity: { gte: parseInt(guestCount) },
           reservations: {
             none: {
               status: { in: ['CONFIRMED', 'PENDING'] },
               startTime: { lt: new Date(start.getTime() + 90 * 60000) },
               endTime: { gt: start }
             }
           }
         }
       });
       if (!availableTable) return errorResponse(res, 'errors.validation_error', 400, { message: 'No tables available for this party size at the selected time.' });
       finalTableId = availableTable.id;
    }

    let endTime: Date | null = null;
    if (settings.logic === 'DYNAMIC_DURATION') {
      endTime = new Date(start.getTime() + settings.defaultDurationMinutes * 60000);
    } else {
      endTime = new Date(start.getTime() + 120 * 60000); 
    }

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId,
        tableId: finalTableId,
        categoryId: categoryId === 'none' ? null : categoryId,
        customerName,
        customerEmail,
        customerPhone,
        guestCount: parseInt(guestCount),
        startTime: start,
        endTime,
        notes,
        internalNote,
        isVIP: !!isVIP,
        status: daySetting?.autoConfirm ? 'CONFIRMED' : 'PENDING'
      }
    });

    return successResponse(res, reservation, 'messages.reservation_created', 201);
  } catch (error) {
    console.error('Create reservation error', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateReservation = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { 
      tableId, categoryId, customerName, customerEmail, customerPhone, 
      guestCount, startTime, notes, internalNote, isVIP, status 
    } = req.body;

    const existingRes = await prisma.reservation.findFirst({
      where: { id, restaurantId }
    });

    if (!existingRes) return errorResponse(res, 'errors.validation_error', 404, { message: 'Reservation not found' });

    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        tableId: tableId === 'none' ? null : tableId,
        categoryId: categoryId === 'none' ? null : categoryId,
        customerName,
        customerEmail,
        customerPhone,
        guestCount: parseInt(guestCount),
        startTime: new Date(startTime),
        notes,
        internalNote,
        isVIP: !!isVIP,
        status
      }
    });

    return successResponse(res, updated);
  } catch (error) {
    console.error('Update reservation error', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const deleteReservation = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;

    const existingRes = await prisma.reservation.findFirst({
      where: { id, restaurantId }
    });

    if (!existingRes) return errorResponse(res, 'errors.validation_error', 404, { message: 'Reservation not found' });

    await prisma.reservation.delete({
      where: { id }
    });

    return successResponse(res, null, 'Reservation deleted');
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateReservationStatus = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { status, tableId } = req.body;

    const existingRes = await prisma.reservation.findFirst({
      where: { id, restaurantId }
    });

    if (!existingRes) return errorResponse(res, 'errors.validation_error', 404, { message: 'Reservation not found' });

    const updated = await prisma.reservation.update({
      where: { id },
      data: { status, tableId }
    });

    return successResponse(res, updated);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
