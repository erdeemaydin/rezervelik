import { Prisma, RestaurantSettings, DaySetting } from '@prisma/client';
import prisma from '../config/prisma';

// 6-digit, never leading-zero — reads unambiguously over the phone and lets
// host-stand staff pull a reservation up by code instead of a name search.
// Shared by every reservation-creating path (public create, waitlist
// offer-accept) so a guest can be looked up by code regardless of which path
// created their reservation.
export const generateConfirmationCode = (): string => String(100000 + Math.floor(Math.random() * 900000));

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
  // MANUAL_AVAILABILITY mode (PROJECT_LOGIC.md §3): "reservations are accepted
  // without strict end times... subsequent reservations rely on staff clearing the
  // table." Pass true when the tenant is in this mode so the check below.
  isManualAvailability?: boolean;
}

/**
 * Returns a truthy conflict if the table can't be booked for [start, end), or null
 * if it's free. In MANUAL_AVAILABILITY mode this ignores the reservation timeline
 * entirely and instead blocks purely on BookableResource.isAvailable — the manual
 * staff toggle is the only signal that mode uses. Otherwise, returns the first
 * reservation that overlaps the window (existing.startTime < end AND
 * existing.endTime > start).
 */
export async function findTableConflict({
  restaurantId, tableId, start, end, excludeReservationId, tx, isManualAvailability,
}: ConflictArgs) {
  const client = tx ?? prisma;

  if (isManualAvailability) {
    const table = await client.bookableResource.findUnique({ where: { id: tableId }, select: { isAvailable: true } });
    return table && !table.isAvailable ? { id: 'MANUAL_AVAILABILITY_OCCUPIED' } : null;
  }

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
 * The UTC instant corresponding to local midnight of `dateStr` (YYYY-MM-DD) in the
 * given timezone. Standard cross-environment-safe technique: format the same guess
 * instant through both the target zone and UTC, take the wall-clock difference (the
 * zone's offset at that instant), and shift the guess back by it.
 *
 * Shared with analyticsController.ts (previously duplicated there as a private
 * helper) — a single DST-sensitive implementation instead of two copies that could
 * silently drift apart.
 */
export function restaurantMidnightUTC(dateStr: string, timezone?: string): Date {
  const tz = timezone || 'Europe/Istanbul';
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const asZoned = new Date(guess.toLocaleString('en-US', { timeZone: tz }));
  const asUTC = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = asZoned.getTime() - asUTC.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Hour (0-23) and day-of-week (0=Sun..6=Sat) of `date` as seen in the restaurant's
 * own timezone, not the server's. Reservation timestamps are stored as absolute
 * instants (UTC internally); reading them back with .getHours()/.getDay() reflects
 * wherever this Node process happens to run, which on a UTC-deployed server for an
 * Istanbul (UTC+3) tenant shifts every bucket by ~3 hours — an 8pm dinner shows up
 * at hour 17, and a day can straddle two server-local dates.
 */
export function restaurantHourAndDay(date: Date, timezone?: string): { hour: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Europe/Istanbul',
    hour: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date);
  const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
  const weekdayShort = parts.find(p => p.type === 'weekday')!.value;
  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);
  return { hour, dayOfWeek };
}

/**
 * Sums guestCount across all currently-active (BLOCKING_STATUSES) reservations
 * whose calendar day (in the restaurant's own timezone) is `dateStr` — the basis
 * for DaySetting.maxCapacityOverride, a total-covers cap for a specific date
 * independent of per-table availability (e.g. a private event or reduced
 * staffing where the restaurant wants to accept fewer total covers than table
 * math alone would allow).
 */
export async function getBookedCoversForDate({
  restaurantId, dateStr, timezone, excludeReservationId, tx,
}: {
  restaurantId: string;
  dateStr: string;
  timezone?: string;
  excludeReservationId?: string;
  tx?: Prisma.TransactionClient;
}): Promise<number> {
  const client = tx ?? prisma;
  const dayStart = restaurantMidnightUTC(dateStr, timezone);
  // Next calendar day's date string via plain UTC arithmetic on the
  // (timezone-agnostic) YYYY-MM-DD string, then re-resolved through
  // restaurantMidnightUTC — NOT `dayStart + 24h`, which would be wrong on a
  // DST transition day (23h/25h of actual wall-clock time).
  const nextDay = new Date(`${dateStr}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dayEnd = restaurantMidnightUTC(nextDay.toISOString().slice(0, 10), timezone);

  const result = await client.reservation.aggregate({
    where: {
      restaurantId,
      status: { in: BLOCKING_STATUSES },
      startTime: { gte: dayStart, lt: dayEnd },
      ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
    },
    _sum: { guestCount: true },
  });
  return result._sum.guestCount ?? 0;
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

const isPositiveInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

export interface OverbookingConfig {
  enabled: boolean;
  maxExtraCovers: number;
  maxExtraReservations: number;
}

/**
 * Resolves whether overbooking (soft-accepting a PENDING, tableless reservation
 * when no table is free but the party could fit somewhere) is active for a given
 * date, and its caps. DaySetting.allowOverbookingOverride is tri-state: true/false
 * take the day's own override numbers as-is (validated to be complete at save
 * time — see daySettingController), null/undefined inherits the restaurant-wide
 * RestaurantSettings fields entirely.
 *
 * Defense in depth: even if bad data ever reached the DB, this only reports
 * `enabled: true` when both caps resolve to valid positive integers — the
 * feature silently stays off rather than misbehave on a malformed value.
 */
export function getEffectiveOverbookingConfig(
  settings: Pick<RestaurantSettings, 'allowOverbooking' | 'overbookingMaxExtraCovers' | 'overbookingMaxExtraReservations'>,
  daySetting?: Pick<DaySetting, 'allowOverbookingOverride' | 'overbookingMaxExtraCoversOverride' | 'overbookingMaxExtraReservationsOverride'> | null,
): OverbookingConfig {
  const override = daySetting?.allowOverbookingOverride;
  const rawEnabled = override === true || override === false ? override : !!settings.allowOverbooking;
  const rawCovers = override === true ? daySetting?.overbookingMaxExtraCoversOverride : settings.overbookingMaxExtraCovers;
  const rawReservations = override === true ? daySetting?.overbookingMaxExtraReservationsOverride : settings.overbookingMaxExtraReservations;

  const enabled = rawEnabled && isPositiveInt(rawCovers) && isPositiveInt(rawReservations);
  return {
    enabled: !!enabled,
    maxExtraCovers: isPositiveInt(rawCovers) ? rawCovers : 0,
    maxExtraReservations: isPositiveInt(rawReservations) ? rawReservations : 0,
  };
}

/**
 * Counts currently-active (BLOCKING_STATUSES) overbooked reservations (isOverbooked
 * = true, i.e. soft-accepted with no table assigned) for `dateStr`, and sums their
 * covers — the running totals getEffectiveOverbookingConfig's caps are checked
 * against. Mirrors getBookedCoversForDate's day-window resolution.
 */
export async function getOverbookedCountsForDate({
  restaurantId, dateStr, timezone, tx,
}: {
  restaurantId: string;
  dateStr: string;
  timezone?: string;
  tx?: Prisma.TransactionClient;
}): Promise<{ count: number; covers: number }> {
  const client = tx ?? prisma;
  const dayStart = restaurantMidnightUTC(dateStr, timezone);
  const nextDay = new Date(`${dateStr}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const dayEnd = restaurantMidnightUTC(nextDay.toISOString().slice(0, 10), timezone);

  const [count, sum] = await Promise.all([
    client.reservation.count({
      where: {
        restaurantId,
        isOverbooked: true,
        status: { in: BLOCKING_STATUSES },
        startTime: { gte: dayStart, lt: dayEnd },
      },
    }),
    client.reservation.aggregate({
      where: {
        restaurantId,
        isOverbooked: true,
        status: { in: BLOCKING_STATUSES },
        startTime: { gte: dayStart, lt: dayEnd },
      },
      _sum: { guestCount: true },
    }),
  ]);
  return { count, covers: sum._sum.guestCount ?? 0 };
}

/**
 * Finds a table that can seat `partySize` and is free for [start, end).
 * Ordered by smallest sufficient capacity first so large tables stay open for
 * larger parties. Returns null when nothing fits (fully booked for the slot).
 * In MANUAL_AVAILABILITY mode, "free" means BookableResource.isAvailable, not "no
 * overlapping reservation" — see findTableConflict's doc comment.
 */
export async function findAvailableTable({
  restaurantId, partySize, start, end, tx, isManualAvailability,
}: { restaurantId: string; partySize: number; start: Date; end: Date; tx?: Prisma.TransactionClient; isManualAvailability?: boolean }) {
  const client = tx ?? prisma;
  return client.bookableResource.findFirst({
    where: {
      restaurantId,
      capacity: { gte: partySize },
      ...(isManualAvailability
        ? { isAvailable: true }
        : {
            reservations: {
              none: {
                status: { in: BLOCKING_STATUSES },
                startTime: { lt: end },
                endTime: { gt: start },
              },
            },
          }),
    },
    orderBy: { capacity: 'asc' },
  });
}
