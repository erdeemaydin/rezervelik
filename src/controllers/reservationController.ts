import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { verifyToken } from '../utils/jwt';
import { createPaymentForReservation } from '../services/paymentService';
import { sendPaymentRequest } from '../services/notificationService';
import { findTableConflict, findAvailableTable, BLOCKING_STATUSES } from '../utils/reservationConflict';

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
    const partySize = parseInt(guestCount);

    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId }
    });

    // The reservation's calendar day is resolved in the restaurant's own timezone
    // (not UTC), so a booking near midnight lands on the day the guest actually
    // picked and lines up with the DaySetting the admin blocked for that date.
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: settings?.timezone || 'Europe/Istanbul',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(start);

    // Check DaySetting
    const daySetting = await prisma.daySetting.findUnique({
      where: { restaurantId_date: { restaurantId, date: dateStr } }
    });

    if (daySetting && !daySetting.isReservationEnabled) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Reservations are disabled for this day.' });
    }

    if (!settings || !settings.isReservationEnabled) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Reservations are currently disabled for this restaurant' });
    }

    // Reservation window: how long a table is considered occupied by this booking.
    // Admin-configurable via Settings > Reservation Logic (defaultDurationMinutes), defaults to 90 minutes.
    const durationMinutes = settings.defaultDurationMinutes || 90;
    const windowEnd = new Date(start.getTime() + durationMinutes * 60000);

    const staffInitiated = isStaffRequest(req);

    const endTime: Date = settings.logic === 'DYNAMIC_DURATION'
      ? windowEnd
      : new Date(start.getTime() + 120 * 60000);

    const paymentEnabled = !!settings.isPaidReservationEnabled && (settings.depositAmount || 0) > 0;

    // Table resolution + conflict re-check + insert all happen inside one
    // transaction so two concurrent bookings can't both pass the availability
    // check and land on the same table (the previous check-then-insert race).
    let finalTableId: string | null = tableId === 'none' ? null : tableId;
    let requiresInstantPayment = false;

    let reservation;
    try {
      reservation = await prisma.$transaction(async (tx) => {
        if (finalTableId) {
          const conflict = await findTableConflict({
            restaurantId, tableId: finalTableId, start, end: windowEnd, tx,
          });
          if (conflict) {
            // Only an authenticated staff member may knowingly override a conflict;
            // public/customer requests are always hard-blocked here.
            if (!staffInitiated || !overrideConflict) {
              throw Object.assign(new Error('TABLE_CONFLICT'), { code: 'TABLE_CONFLICT' });
            }
          }
        } else {
          // Auto-assign the smallest table that fits and is free for this window.
          const availableTable = await findAvailableTable({
            restaurantId, partySize, start, end: windowEnd, tx,
          });
          if (availableTable) {
            finalTableId = availableTable.id;
          } else {
            const anyTableFitsCapacity = await tx.table.findFirst({
              where: { restaurantId, capacity: { gte: partySize } },
            });
            // No table can ever seat this party → hard reject.
            if (!anyTableFitsCapacity) {
              throw Object.assign(new Error('NO_TABLE_CAPACITY'), { code: 'NO_TABLE_CAPACITY' });
            }
            // Every fitting table is booked for this slot. We never create an
            // overlapping/unassigned booking on the public side; instead we flag
            // the day as fully booked (manual control) and reject so the guest is
            // offered the waitlist. Staff may still force an unassigned pending
            // booking to resolve manually.
            if (!staffInitiated) {
              await tx.daySetting.upsert({
                where: { restaurantId_date: { restaurantId, date: dateStr } },
                create: { restaurantId, date: dateStr, isFullyBooked: true },
                update: { isFullyBooked: true },
              });
              throw Object.assign(new Error('FULLY_BOOKED'), { code: 'FULLY_BOOKED' });
            }
          }
        }

        // Auto-confirm requires an actually-assigned, conflict-free table.
        const isConfirmed = !!daySetting?.autoConfirm && !!finalTableId;

        // Instant deposit rule (Trigger A): paid reservations enabled AND the day
        // auto-confirms AND this is a guest (not staff) booking. Held as
        // AWAITING_PAYMENT until the deposit is paid instead of confirming outright.
        requiresInstantPayment = paymentEnabled && !staffInitiated && isConfirmed;

        return tx.reservation.create({
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
            status: requiresInstantPayment ? 'AWAITING_PAYMENT' : (isConfirmed ? 'CONFIRMED' : 'PENDING'),
          },
        });
      });
    } catch (txErr: any) {
      if (txErr?.code === 'TABLE_CONFLICT') {
        return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
      }
      if (txErr?.code === 'NO_TABLE_CAPACITY') {
        return errorResponse(res, 'errors.validation_error', 400, { message: 'No table can accommodate this party size.' });
      }
      if (txErr?.code === 'FULLY_BOOKED') {
        return errorResponse(res, 'errors.fully_booked', 409, { code: 'FULLY_BOOKED' });
      }
      throw txErr;
    }

    if (requiresInstantPayment) {
      const pay = await createPaymentForReservation(reservation, settings);
      if (pay) {
        await prisma.reservation.update({ where: { id: reservation.id }, data: { paymentId: pay.paymentId } });
        return successResponse(res, {
          ...reservation,
          status: 'AWAITING_PAYMENT',
          payment: { token: pay.rawLinkToken, code: pay.code, url: pay.paymentUrl, amount: pay.amountMinor, currency: pay.currency, expiresAt: pay.expiresAt },
        }, 'messages.reservation_created', 201);
      }
    }

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
      guestCount, startTime, notes, internalNote, isVIP, status, overrideConflict
    } = req.body;

    const existingRes = await prisma.reservation.findFirst({
      where: { id, restaurantId }
    });

    if (!existingRes) return errorResponse(res, 'errors.validation_error', 404, { message: 'Reservation not found' });

    const finalTableId = tableId === 'none' ? null : tableId;
    const start = new Date(startTime);

    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
    const durationMinutes = settings?.defaultDurationMinutes || 90;
    // Keep endTime in sync with the (possibly changed) start time so the timeline
    // and conflict checks reflect the real occupied window instead of a stale value.
    const windowEnd = new Date(start.getTime() + durationMinutes * 60000);

    if (finalTableId) {
      const isTableOccupied = await findTableConflict({
        restaurantId, tableId: finalTableId, start, end: windowEnd, excludeReservationId: id,
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
        endTime: windowEnd,
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

// Lightweight reschedule used by the interactive timeline (drag to move/resize,
// or drop onto another table row). Only touches the schedule fields and enforces
// the same table-overlap rule as create/update so two bookings can't share a
// table for the same window.
export const updateReservationSchedule = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { tableId, startTime, endTime, overrideConflict } = req.body;

    const existingRes = await prisma.reservation.findFirst({
      where: { id, restaurantId }
    });
    if (!existingRes) return errorResponse(res, 'errors.validation_error', 404, { message: 'Reservation not found' });

    if (!startTime) return errorResponse(res, 'errors.validation_error', 400, { message: 'startTime is required' });

    const finalTableId = tableId === 'none' || !tableId ? null : tableId;
    const start = new Date(startTime);
    let end: Date;
    if (endTime) {
      end = new Date(endTime);
    } else if (existingRes.endTime) {
      // Preserve the reservation's current duration when only the start moved.
      const dur = new Date(existingRes.endTime).getTime() - new Date(existingRes.startTime).getTime();
      end = new Date(start.getTime() + dur);
    } else {
      const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
      end = new Date(start.getTime() + (settings?.defaultDurationMinutes || 90) * 60000);
    }

    if (finalTableId) {
      const conflict = await findTableConflict({
        restaurantId, tableId: finalTableId, start, end, excludeReservationId: id,
      });
      if (conflict && !overrideConflict) {
        return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
      }
    }

    const updated = await prisma.reservation.update({
      where: { id },
      data: { tableId: finalTableId, startTime: start, endTime: end },
      include: { table: true, category: true }
    });

    return successResponse(res, updated);
  } catch (error) {
    console.error('Reschedule reservation error', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};

export const updateReservationStatus = async (req: Request, res: Response) => {
  try {
    const restaurantId = req.restaurantId!;
    const { id } = req.params;
    const { status, tableId, skipPayment, overrideConflict } = req.body;

    const existingRes = await prisma.reservation.findFirst({
      where: { id, restaurantId }
    });

    if (!existingRes) return errorResponse(res, 'errors.validation_error', 404, { message: 'Reservation not found' });

    // If this status change assigns/keeps a table on a booking that will occupy it,
    // make sure we're not overlapping another active booking on that table.
    const targetTableId = tableId ?? existingRes.tableId;
    if (targetTableId && status && BLOCKING_STATUSES.includes(status)) {
      const conflictEnd = existingRes.endTime ?? new Date(existingRes.startTime.getTime() + 90 * 60000);
      const conflict = await findTableConflict({
        restaurantId, tableId: targetTableId, start: existingRes.startTime, end: conflictEnd, excludeReservationId: id,
      });
      if (conflict && !overrideConflict) {
        return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
      }
    }

    // Manual-accept payment rule (Trigger B): when staff accept (→ CONFIRMED) a
    // reservation and paid reservations are enabled, we don't confirm outright —
    // we generate a deposit payment link and text/e-mail it to the guest, holding
    // the booking as AWAITING_PAYMENT until they pay. Staff can bypass with
    // `skipPayment` (e.g. a trusted regular / deposit taken in person).
    if (status === 'CONFIRMED' && !skipPayment && !existingRes.isPaid) {
      const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
      const paymentEnabled = !!settings?.isPaidReservationEnabled && (settings.depositAmount || 0) > 0;
      if (paymentEnabled) {
        const pay = await createPaymentForReservation(existingRes, settings!);
        if (pay) {
          const updated = await prisma.reservation.update({
            where: { id },
            data: { status: 'AWAITING_PAYMENT', paymentId: pay.paymentId, ...(tableId ? { tableId } : {}) },
          });
          const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
          const amountLabel = `${(pay.amountMinor / 100).toFixed(2)} ${pay.currency}`;
          const reservationLabel = new Date(existingRes.startTime).toLocaleString('tr-TR') + ` · ${existingRes.guestCount} kişi`;
          await sendPaymentRequest({
            customerName: existingRes.customerName,
            customerPhone: existingRes.customerPhone,
            customerEmail: existingRes.customerEmail,
            restaurantName: restaurant?.name || 'Restaurant',
            amountLabel,
            paymentUrl: pay.paymentUrl,
            code: pay.code,
            reservationLabel,
          });
          return successResponse(res, {
            ...updated,
            paymentRequested: true,
            payment: { token: pay.rawLinkToken, code: pay.code, url: pay.paymentUrl, amount: pay.amountMinor, currency: pay.currency, expiresAt: pay.expiresAt },
          });
        }
      }
    }

    const updated = await prisma.reservation.update({
      where: { id },
      data: { status, tableId }
    });

    return successResponse(res, updated);
  } catch (error) {
    console.error('Update reservation status error', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
