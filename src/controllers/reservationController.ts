import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { verifyToken } from '../utils/jwt';

const isStaffRequest = (req: Request): boolean => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    verifyToken(authHeader.split(' ')[1]);
    return true;
  } catch {
    return false;
  }
};

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

    // Per-phone-number history: how many times this guest has visited/no-showed,
    // so repeat no-show patterns are visible directly on the reservation list.
    const phones = [...new Set(reservations.map(r => r.customerPhone))];
    const historyCounts = phones.length ? await prisma.reservation.groupBy({
      by: ['customerPhone', 'status'],
      where: { restaurantId, customerPhone: { in: phones } },
      _count: { _all: true }
    }) : [];

    const historyByPhone = new Map<string, { totalVisits: number; noShowCount: number }>();
    for (const row of historyCounts) {
      const entry = historyByPhone.get(row.customerPhone) || { totalVisits: 0, noShowCount: 0 };
      entry.totalVisits += row._count._all;
      if (row.status === 'NO_SHOW') entry.noShowCount += row._count._all;
      historyByPhone.set(row.customerPhone, entry);
    }

    const withHistory = reservations.map(r => ({
      ...r,
      phoneHistory: historyByPhone.get(r.customerPhone) || { totalVisits: 1, noShowCount: 0 }
    }));

    return successResponse(res, withHistory);
  } catch (error) {
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const createReservation = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const {
      tableId, categoryId, customerName, customerEmail, customerPhone,
      guestCount, startTime, notes, internalNote, isVIP, overrideConflict
    } = req.body;

    if (!customerName || !customerPhone || !guestCount || !startTime) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    const start = new Date(startTime);
    const dateStr = start.toISOString().split('T')[0];
    const partySize = parseInt(guestCount);

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

    // Reservation window: how long a table is considered occupied by this booking.
    // Admin-configurable via Settings > Reservation Logic (defaultDurationMinutes), defaults to 90 minutes.
    const durationMinutes = settings.defaultDurationMinutes || 90;
    const windowEnd = new Date(start.getTime() + durationMinutes * 60000);

    let finalTableId = tableId === 'none' ? null : tableId;
    let possiblyFullyBooked = false;
    const staffInitiated = isStaffRequest(req);

    if (finalTableId) {
       const isTableOccupied = await prisma.reservation.findFirst({
         where: {
           tableId: finalTableId,
           status: { in: ['CONFIRMED', 'PENDING'] },
           startTime: { lt: windowEnd },
           endTime: { gt: start }
         }
       });
       if (isTableOccupied) {
         // Only an authenticated staff member may knowingly override a conflict;
         // public/customer requests are always hard-blocked here.
         if (!staffInitiated || !overrideConflict) {
           return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
         }
       }
    } else {
       // Auto-assign first available table that fits guestCount
       const availableTable = await prisma.table.findFirst({
         where: {
           restaurantId,
           capacity: { gte: partySize },
           reservations: {
             none: {
               status: { in: ['CONFIRMED', 'PENDING'] },
               startTime: { lt: windowEnd },
               endTime: { gt: start }
             }
           }
         }
       });

       if (availableTable) {
         finalTableId = availableTable.id;
       } else {
         // No table is free right now. If no table could ever seat this party,
         // reject outright; otherwise accept as a pending, unassigned request
         // so staff can resolve it manually (matches the fully-booked hint shown to guests).
         const anyTableFitsCapacity = await prisma.table.findFirst({
           where: { restaurantId, capacity: { gte: partySize } }
         });
         if (!anyTableFitsCapacity) {
           return errorResponse(res, 'errors.validation_error', 400, { message: 'No table can accommodate this party size.' });
         }
         possiblyFullyBooked = true;
       }
    }

    let endTime: Date | null = null;
    if (settings.logic === 'DYNAMIC_DURATION') {
      endTime = windowEnd;
    } else {
      endTime = new Date(start.getTime() + 120 * 60000);
    }

    // Auto-confirm requires an actually-assigned, conflict-free table for this slot.
    const isConfirmed = !!daySetting?.autoConfirm && !!finalTableId && !possiblyFullyBooked;

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId,
        tableId: finalTableId,
        categoryId: categoryId === 'none' ? null : categoryId,
        customerName,
        customerEmail,
        customerPhone,
        guestCount: partySize,
        startTime: start,
        endTime,
        notes,
        internalNote,
        isVIP: !!isVIP,
        status: isConfirmed ? 'CONFIRMED' : 'PENDING'
      }
    });

    return successResponse(res, { ...reservation, possiblyFullyBooked }, 'messages.reservation_created', 201);
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
      guestCount, startTime, notes, internalNote, isVIP, status, overrideConflict
    } = req.body;

    const existingRes = await prisma.reservation.findFirst({
      where: { id, restaurantId }
    });

    if (!existingRes) return errorResponse(res, 'errors.validation_error', 404, { message: 'Reservation not found' });

    const finalTableId = tableId === 'none' ? null : tableId;
    const start = new Date(startTime);

    if (finalTableId) {
      const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
      const durationMinutes = settings?.defaultDurationMinutes || 90;
      const windowEnd = new Date(start.getTime() + durationMinutes * 60000);

      const isTableOccupied = await prisma.reservation.findFirst({
        where: {
          id: { not: id },
          tableId: finalTableId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          startTime: { lt: windowEnd },
          endTime: { gt: start }
        }
      });
      // This route is staff-only (authMiddleware + manage_reservations), so an explicit
      // overrideConflict from the confirmed warning dialog is enough to proceed.
      if (isTableOccupied && !overrideConflict) {
        return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
      }
    }

    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        tableId: finalTableId,
        categoryId: categoryId === 'none' ? null : categoryId,
        customerName,
        customerEmail,
        customerPhone,
        guestCount: parseInt(guestCount),
        startTime: start,
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
