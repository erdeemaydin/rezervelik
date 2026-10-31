// Weekly open/close windows for online ordering (OrderSettings.orderHours).
//
// The column is an untyped Json?; the shape is whatever
// frontend/src/app/dashboard/orders/settings/page.tsx writes:
//   { mon: { closed: boolean, open: "09:00", close: "22:00" }, ... sun: {...} }
//
// Everything here is defensive: an absent, malformed or half-filled entry
// means "the tenant hasn't configured this day", and an unconfigured day must
// never block ordering — a JSON blob nobody validates on write is not allowed
// to become an accidental kill-switch.

// Index order matches Date.getDay() / Intl's weekday, 0 = Sunday.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DayWindow {
  closed: boolean;
  openMinutes: number | null;
  closeMinutes: number | null;
}

/** "HH:MM" -> minutes since local midnight, or null if unparseable. */
function parseHHMM(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Weekday index (0 = Sunday) and minutes-since-midnight of `date` as seen in
 * the restaurant's own timezone — same reasoning as
 * reservationConflict.restaurantHourAndDay: reading a UTC instant with
 * .getHours() reflects wherever this Node process runs, which shifts every
 * boundary by the server/tenant offset.
 */
export function localWeekdayAndMinutes(date: Date, timezone?: string): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Europe/Istanbul',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
  const dayOfWeek = WEEKDAY_SHORT.indexOf(parts.find((p) => p.type === 'weekday')!.value);
  return { dayOfWeek: dayOfWeek < 0 ? 0 : dayOfWeek, minutes: hour * 60 + minute };
}

function readDay(orderHours: any, dayOfWeek: number): DayWindow | null {
  const entry = orderHours?.[DAY_KEYS[((dayOfWeek % 7) + 7) % 7]];
  if (!entry || typeof entry !== 'object') return null;
  return {
    closed: entry.closed === true,
    openMinutes: parseHHMM(entry.open),
    closeMinutes: parseHHMM(entry.close),
  };
}

/**
 * Is `now` inside the tail of *yesterday's* window that runs past midnight?
 * A window whose close is <= its open (e.g. 18:00–02:00) wraps into the next
 * calendar day, so at 01:00 the relevant entry is yesterday's, not today's.
 */
function inPreviousDayOvernightWindow(orderHours: any, dayOfWeek: number, minutes: number): boolean {
  const day = readDay(orderHours, dayOfWeek - 1);
  if (!day || day.closed || day.openMinutes === null || day.closeMinutes === null) return false;
  if (day.closeMinutes > day.openMinutes) return false; // doesn't wrap
  return minutes < day.closeMinutes;
}

/**
 * True when online ordering should be accepted at `now`.
 *
 * Returns true (permissive) whenever the schedule isn't usably configured:
 * no JSON at all, no entry for the current day, or unparseable times. Only an
 * explicit, well-formed window that `now` falls outside of returns false.
 */
export function isWithinOrderHours(orderHours: unknown, now: Date, timezone?: string): boolean {
  if (!orderHours || typeof orderHours !== 'object' || Array.isArray(orderHours)) return true;

  const { dayOfWeek, minutes } = localWeekdayAndMinutes(now, timezone);
  const today = readDay(orderHours, dayOfWeek);
  if (!today) return true; // no entry for today = unconfigured

  if (today.closed) return inPreviousDayOvernightWindow(orderHours, dayOfWeek, minutes);
  if (today.openMinutes === null || today.closeMinutes === null) return true; // malformed

  if (today.closeMinutes > today.openMinutes) {
    if (minutes >= today.openMinutes && minutes < today.closeMinutes) return true;
    return inPreviousDayOvernightWindow(orderHours, dayOfWeek, minutes);
  }

  // close <= open: the window runs past midnight, so today contributes
  // [open, 24:00) and the pre-midnight remainder is yesterday's tail.
  if (minutes >= today.openMinutes) return true;
  return inPreviousDayOvernightWindow(orderHours, dayOfWeek, minutes);
}
