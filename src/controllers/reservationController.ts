import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { verifyToken } from '../utils/jwt';
import { createPaymentForReservation } from '../services/paymentService';
import { sendPaymentRequest, sendBookingConfirmation, formatReservationLabel } from '../services/notificationService';
import { findTableConflict, findAvailableTable, BLOCKING_STATUSES, restaurantDateStr, clearFullyBookedIfSet } from '../utils/reservationConflict';
import { logAudit } from '../services/auditService';

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
      tableId, categoryId, serviceId, customerName, customerEmail, customerPhone,
      guestCount, startTime, notes, internalNote, isVIP, overrideConflict
    } = req.body;

    if (!customerName || !customerPhone || !guestCount || !startTime) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Missing required fields' });
    }

    const start = new Date(startTime);
    const partySize = parseInt(guestCount);
    if (!Number.isInteger(partySize) || partySize < 1) {
      return errorResponse(res, 'errors.validation_error', 400, { message: 'Invalid guestCount' });
    }

    const settings = await prisma.restaurantSettings.findUnique({
      where: { restaurantId }
    });

    // maxPartySize is documented as bounding the *public* booking form (the
    // dashboard only rendered it as a UI hint, e.g. bubble buttons 1..maxPartySize)
    // — nothing rejected a direct API call with a larger value. Staff can still
    // book bigger private/VIP parties manually; only guest-initiated requests are
    // capped here.
    const staffInitiated = isStaffRequest(req);
    if (!staffInitiated && settings?.maxPartySize && partySize > settings.maxPartySize) {
      return errorResponse(res, 'errors.validation_error', 400, { message: `Party size exceeds the maximum of ${settings.maxPartySize}` });
    }

    const dateStr = restaurantDateStr(start, settings?.timezone);

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

    // Reservation window: how long a resource is considered occupied by this booking.
    // Admin-configurable via Settings > Reservation Logic (defaultDurationMinutes), defaults to 90 minutes.
    // Appointment verticals (SALON/CLINIC): if the booking references a service with
    // an intrinsic durationMinutes, that overrides the tenant default. The service is
    // validated to belong to this tenant (via its menu) before it's trusted/stored.
    let durationMinutes = settings.defaultDurationMinutes || 90;
    let finalServiceId: string | null = serviceId && serviceId !== 'none' ? serviceId : null;
    if (finalServiceId) {
      const service = await prisma.menuItem.findFirst({
        where: { id: finalServiceId, category: { menu: { restaurantId } } },
        select: { durationMinutes: true },
      });
      if (!service) {
        finalServiceId = null; // unknown/foreign service → ignore rather than trust it
      } else if (service.durationMinutes && service.durationMinutes > 0) {
        durationMinutes = service.durationMinutes;
      }
    }
    const windowEnd = new Date(start.getTime() + durationMinutes * 60000);

    // The tenant's configured defaultDurationMinutes (or the service's own
    // duration, when set) governs how long a table is considered occupied,
    // regardless of reservation logic mode — FIXED_SLOTS/MANUAL_AVAILABILITY
    // used to hardcode a flat 2h window here, which silently ignored the
    // restaurant's own Settings value.
    const endTime: Date = windowEnd;

    // hasPaymentFeature is the SysAdmin's entitlement (e.g. off by default for
    // CLINIC); isPaidReservationEnabled is the tenant's own toggle within that
    // entitlement. Both must hold — a tenant whose plan doesn't include payments
    // can't turn on deposits by flipping its own setting.
    const paymentEnabled = !!settings.hasPaymentFeature && !!settings.isPaidReservationEnabled && (settings.depositAmount || 0) > 0;

    // Table resolution + conflict re-check + insert all happen inside one
    // transaction so two concurrent bookings can't both pass the availability
    // check and land on the same table (the previous check-then-insert race).
    let finalTableId: string | null = tableId === 'none' ? null : tableId;
    let requiresInstantPayment = false;
    const isManualAvailability = settings.logic === 'MANUAL_AVAILABILITY';

    let reservation;
    try {
      reservation = await prisma.$transaction(async (tx) => {
        if (finalTableId) {
          const conflict = await findTableConflict({
            restaurantId, tableId: finalTableId, start, end: windowEnd, tx, isManualAvailability,
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
            restaurantId, partySize, start, end: windowEnd, tx, isManualAvailability,
          });
          if (availableTable) {
            finalTableId = availableTable.id;
          } else {
            const anyTableFitsCapacity = await tx.bookableResource.findFirst({
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
            serviceId: finalServiceId,
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

    logAudit({
      req,
      restaurantId,
      category: 'RESERVATION',
      action: 'RESERVATION_CREATED',
      targetType: 'Reservation',
      targetId: reservation.id,
      targetLabel: reservation.customerName,
      metadata: { guestCount: reservation.guestCount, startTime: reservation.startTime, status: reservation.status },
    });

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

    // Reservation is confirmed outright (auto-confirm, no deposit needed) —
    // let the guest know immediately. When a deposit is required instead,
    // sendPaymentRequest already covers the outbound message above.
    if (reservation.status === 'CONFIRMED') {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
      await sendBookingConfirmation({
        customerPhone: reservation.customerPhone,
        restaurantName: restaurant?.name || 'Restaurant',
        reservationLabel: formatReservationLabel(reservation.startTime, reservation.guestCount),
      });
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

    // Mirror createReservation's window logic: a service-linked booking keeps its
    // service's duration; otherwise the tenant's configured defaultDurationMinutes
    // applies regardless of logic mode (see createReservation for why the old flat
    // 2h FIXED_SLOTS/MANUAL_AVAILABILITY hardcode was removed). The edit form
    // doesn't let staff change the linked service, so we reuse whatever service was
    // resolved (and tenant-validated) at creation time.
    let durationMinutes = settings?.defaultDurationMinutes || 90;
    if (existingRes.serviceId) {
      const service = await prisma.menuItem.findUnique({
        where: { id: existingRes.serviceId },
        select: { durationMinutes: true },
      });
      if (service?.durationMinutes && service.durationMinutes > 0) {
        durationMinutes = service.durationMinutes;
      }
    }
    const endTime: Date = new Date(start.getTime() + durationMinutes * 60000);

    // Conflict-check + write happen inside one transaction so two concurrent edits
    // (or an edit racing a new booking) can't both pass the availability check and
    // land on the same table — the same race createReservation already guards against.
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        if (finalTableId) {
          const isTableOccupied = await findTableConflict({
            restaurantId, tableId: finalTableId, start, end: endTime, excludeReservationId: id, tx,
            isManualAvailability: settings?.logic === 'MANUAL_AVAILABILITY',
          });
          // This route is staff-only (authMiddleware + manage_reservations), so an explicit
          // overrideConflict from the confirmed warning dialog is enough to proceed.
          if (isTableOccupied && !overrideConflict) {
            throw Object.assign(new Error('TABLE_CONFLICT'), { code: 'TABLE_CONFLICT' });
          }
        }

        return tx.reservation.update({
          where: { id },
          data: {
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
            status
          }
        });
      });
    } catch (txErr: any) {
      if (txErr?.code === 'TABLE_CONFLICT') {
        return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
      }
      throw txErr;
    }

    // The edit may have moved the reservation off its original table/day/status —
    // let the next booking attempt re-derive whether that original day is still full.
    await clearFullyBookedIfSet({ restaurantId, dateStr: restaurantDateStr(existingRes.startTime, settings?.timezone) });

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

    // Deleting a reservation frees whatever table it held — the day may no longer
    // actually be fully booked, so let the next booking attempt re-derive that.
    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId }, select: { timezone: true } });
    await clearFullyBookedIfSet({ restaurantId, dateStr: restaurantDateStr(existingRes.startTime, settings?.timezone) });

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

    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
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
      end = new Date(start.getTime() + (settings?.defaultDurationMinutes || 90) * 60000);
    }

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        if (finalTableId) {
          const conflict = await findTableConflict({
            restaurantId, tableId: finalTableId, start, end, excludeReservationId: id, tx,
            isManualAvailability: settings?.logic === 'MANUAL_AVAILABILITY',
          });
          if (conflict && !overrideConflict) {
            throw Object.assign(new Error('TABLE_CONFLICT'), { code: 'TABLE_CONFLICT' });
          }
        }

        return tx.reservation.update({
          where: { id },
          data: { tableId: finalTableId, startTime: start, endTime: end },
          include: { table: true, category: true }
        });
      });
    } catch (txErr: any) {
      if (txErr?.code === 'TABLE_CONFLICT') {
        return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
      }
      throw txErr;
    }

    // The reservation may have moved off its original table/day — let the next
    // booking attempt re-derive whether that original day is still full.
    await clearFullyBookedIfSet({ restaurantId, dateStr: restaurantDateStr(existingRes.startTime, settings?.timezone) });

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

    const settings = await prisma.restaurantSettings.findUnique({ where: { restaurantId } });
    const isManualAvailability = settings?.logic === 'MANUAL_AVAILABILITY';

    // Normalize like every other reservation handler: undefined = leave unchanged,
    // 'none' = explicitly clear, otherwise the given id. Writing the literal string
    // 'none' into the tableId column (as this endpoint previously did) fails the FK.
    const finalTableId: string | null | undefined =
      tableId === undefined ? undefined : (tableId === 'none' ? null : tableId);
    const conflictEnd = existingRes.endTime ?? new Date(existingRes.startTime.getTime() + 90 * 60000);

    // If this status change assigns/keeps a table on a booking that will occupy it,
    // make sure we're not overlapping another active booking on that table. This is
    // a fail-fast check so we don't generate a payment link for a doomed request;
    // the authoritative check happens again inside the transaction right before the
    // write, closing the race window between here and the eventual write.
    const targetTableId = finalTableId !== undefined ? finalTableId : existingRes.tableId;
    if (targetTableId && status && BLOCKING_STATUSES.includes(status)) {
      const conflict = await findTableConflict({
        restaurantId, tableId: targetTableId, start: existingRes.startTime, end: conflictEnd, excludeReservationId: id, isManualAvailability,
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
      // hasPaymentFeature is the SysAdmin's entitlement; isPaidReservationEnabled
      // is the tenant's own toggle within it — both must hold, same as createReservation.
      const paymentEnabled = !!settings?.hasPaymentFeature && !!settings?.isPaidReservationEnabled && (settings.depositAmount || 0) > 0;
      if (paymentEnabled) {
        // Eligibility (isPaid/status) is re-checked from a fresh read *inside*
        // the transaction, and the Payment row is created inside it too — two
        // concurrent "Accept" clicks on the same reservation used to both pass
        // the isPaid check above, both create a Payment row + payment link, and
        // both text the guest a separate deposit link. Whichever request loses
        // the re-check below is treated as a no-op, not an error.
        //
        // The re-check alone isn't sufficient: a plain `findFirst` takes no row
        // lock under Postgres' default READ COMMITTED isolation, so two
        // concurrent transactions can both read the pre-race "not yet paid"
        // state before either commits, and both proceed to create a Payment
        // row. A Postgres advisory lock scoped to this reservation id (same
        // pattern as the RSVP dedup lock in publicController.ts) makes the
        // second transaction block until the first commits, so it then
        // correctly observes the post-commit state and no-ops.
        let txResult: { updated: typeof existingRes; pay: NonNullable<Awaited<ReturnType<typeof createPaymentForReservation>>> } | null;
        try {
          txResult = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservation-accept:${id}`}))`;
            const fresh = await tx.reservation.findFirst({ where: { id, restaurantId } });
            if (!fresh || fresh.isPaid || fresh.status === 'AWAITING_PAYMENT') {
              return null;
            }
            if (targetTableId) {
              const conflict = await findTableConflict({
                restaurantId, tableId: targetTableId, start: existingRes.startTime, end: conflictEnd, excludeReservationId: id, tx, isManualAvailability,
              });
              if (conflict && !overrideConflict) {
                throw Object.assign(new Error('TABLE_CONFLICT'), { code: 'TABLE_CONFLICT' });
              }
            }
            const pay = await createPaymentForReservation(fresh, settings!, tx);
            if (!pay) return null;
            const updated = await tx.reservation.update({
              where: { id },
              data: { status: 'AWAITING_PAYMENT', paymentId: pay.paymentId, ...(finalTableId !== undefined ? { tableId: finalTableId } : {}) },
            });
            return { updated, pay };
          });
        } catch (txErr: any) {
          if (txErr?.code === 'TABLE_CONFLICT') {
            return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
          }
          throw txErr;
        }

        if (txResult) {
          const { updated, pay } = txResult;
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
        // Lost the race (or deposit amount was zeroed out concurrently) — a
        // sibling request already moved this reservation on. Return its
        // current state instead of falling through to the generic update
        // below, which would otherwise force `status` back to CONFIRMED and
        // silently skip the payment the sibling request just required.
        const current = await prisma.reservation.findFirst({ where: { id, restaurantId } });
        return successResponse(res, current);
      }
    }

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        if (targetTableId) {
          const conflict = await findTableConflict({
            restaurantId, tableId: targetTableId, start: existingRes.startTime, end: conflictEnd, excludeReservationId: id, tx, isManualAvailability,
          });
          if (conflict && !overrideConflict) {
            throw Object.assign(new Error('TABLE_CONFLICT'), { code: 'TABLE_CONFLICT' });
          }
        }
        return tx.reservation.update({
          where: { id },
          data: { status, ...(finalTableId !== undefined ? { tableId: finalTableId } : {}) }
        });
      });
    } catch (txErr: any) {
      if (txErr?.code === 'TABLE_CONFLICT') {
        return errorResponse(res, 'errors.table_conflict', 409, { code: 'TABLE_CONFLICT' });
      }
      throw txErr;
    }

    // If this transition freed a table (e.g. CANCELLED/NO_SHOW/EXPIRED, previously
    // blocking), the day may no longer actually be fully booked.
    if (status && existingRes.status !== status &&
        BLOCKING_STATUSES.includes(existingRes.status) && !BLOCKING_STATUSES.includes(status)) {
      await clearFullyBookedIfSet({ restaurantId, dateStr: restaurantDateStr(existingRes.startTime, settings?.timezone) });
    }

    // Staff manually accepted a request straight to CONFIRMED (no deposit
    // required, or skipPayment) — the payment-request branch above already
    // handles the deposit-required path, so this only fires for the direct case.
    if (status === 'CONFIRMED' && existingRes.status !== 'CONFIRMED') {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
      await sendBookingConfirmation({
        customerPhone: updated.customerPhone,
        restaurantName: restaurant?.name || 'Restaurant',
        reservationLabel: formatReservationLabel(updated.startTime, updated.guestCount),
      });
    }

    logAudit({
      req,
      restaurantId,
      category: 'RESERVATION',
      action: 'RESERVATION_STATUS_CHANGED',
      targetType: 'Reservation',
      targetId: updated.id,
      targetLabel: updated.customerName,
      metadata: { from: existingRes.status, to: updated.status },
    });

    return successResponse(res, updated);
  } catch (error) {
    console.error('Update reservation status error', error);
    return errorResponse(res, 'errors.internal_error', 500);
  }
};
