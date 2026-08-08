import { Prisma } from '@prisma/client';
import prisma from '../config/prisma';

// A reservation in any of these statuses actively occupies its table for its
// [startTime, endTime) window. AWAITING_PAYMENT and SEATED were previously
// missing from the occupancy check, which let a second guest be booked onto a
// table already held by an accepted-but-unpaid reservation. CANCELLED / NO_SHOW /
// EXPIRED release the table.
export const BLOCKING_STATUSES = ['PENDING', 'CONFIRMED', 'AWAITING_PAYMENT', 'SEATED', 'COMPLETED'];

interface ConflictArgs {
  restaurantId: string;
  tableId: string;
  start: Date;
  end: Date;
  excludeReservationId?: string;
  tx?: Prisma.TransactionClient;
}

/**
 * Returns the first reservation that overlaps [start, end) on the given table,
 * or null if the slot is free. Two windows overlap when existing.startTime < end
 * AND existing.endTime > start.
 */
export async function findTableConflict({
  restaurantId, tableId, start, end, excludeReservationId, tx,
}: ConflictArgs) {
  const client = tx ?? prisma;
  return client.reservation.findFirst({
    where: {
      restaurantId,
      tableId,
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      status: { in: BLOCKING_STATUSES },
      startTime: { lt: end },
      // endTime may be null on legacy rows; those can't be range-compared, so they
      // are treated as non-blocking. All new rows always set endTime.
      endTime: { gt: start },
    },
  });
}

/**
 * The reservation's calendar day, resolved in the restaurant's own timezone (not
 * UTC) so a booking near midnight lands on the day the guest actually picked and
 * lines up with the DaySetting the admin manages for that date.
 */
export function restaurantDateStr(date: Date, timezone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/**
 * DaySetting.isFullyBooked is a coarse, manually-managed gate: createReservation
 * sets it when a public request finds no table free for its requested slot, but
 * that says nothing about whether the day is *still* full once a reservation that
 * held a table is deleted, canceled, marked no-show, or moved off that day. We
 * don't try to recompute true full-day capacity here (that's slot-dependent and
 * expensive); we just clear the gate so the next booking attempt re-derives it
 * accurately. Worst case we under-flag for a moment and the very next request that
 * genuinely can't find a table re-sets it — better than the previous behavior of
 * never clearing and hard-blocking the day indefinitely after a cancellation.
 */
export async function clearFullyBookedIfSet({
  restaurantId, dateStr, tx,
}: { restaurantId: string; dateStr: string; tx?: Prisma.TransactionClient }) {
  const client = tx ?? prisma;
  await client.daySetting.updateMany({
    where: { restaurantId, date: dateStr, isFullyBooked: true },
    data: { isFullyBooked: false },
  });
}

/**
 * Finds a table that can seat `partySize` and is free for [start, end).
 * Ordered by smallest sufficient capacity first so large tables stay open for
 * larger parties. Returns null when nothing fits (fully booked for the slot).
 */
export async function findAvailableTable({
  restaurantId, partySize, start, end, tx,
}: { restaurantId: string; partySize: number; start: Date; end: Date; tx?: Prisma.TransactionClient }) {
  const client = tx ?? prisma;
  return client.bookableResource.findFirst({
    where: {
      restaurantId,
      capacity: { gte: partySize },
      reservations: {
        none: {
          status: { in: BLOCKING_STATUSES },
          startTime: { lt: end },
          endTime: { gt: start },
        },
      },
    },
    orderBy: { capacity: 'asc' },
  });
}
