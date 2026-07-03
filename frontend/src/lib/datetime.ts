// Timezone-aware date/time helpers.
//
// The restaurant has an authoritative IANA timezone (RestaurantSettings.timezone).
// Wall-clock values the guest picks (a date + a time) must be interpreted in THAT
// zone, then converted to a real UTC instant for storage — otherwise a customer
// booking from another timezone would shift the slot. These helpers centralise
// that conversion so the whole public flow stays consistent.

export const DEFAULT_TZ = 'Europe/Istanbul';

// "YYYY-MM-DD" for the given instant, as seen in `tz`.
export function formatDateInTZ(date: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// Today's calendar date ("YYYY-MM-DD") in `tz`.
export function getTodayInTZ(tz: string = DEFAULT_TZ): string {
  return formatDateInTZ(new Date(), tz);
}

// Offset (ms) between `tz` local time and UTC at the given instant: tzWall - UTC.
function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour === '24' ? '0' : map.hour), Number(map.minute), Number(map.second)
  );
  return asUTC - date.getTime();
}

// Interpret a wall-clock date ("YYYY-MM-DD") + time ("HH:mm") as being in `tz`,
// and return the corresponding real UTC Date instant.
export function zonedWallTimeToUTC(dateStr: string, timeStr: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naiveAsUTC = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset = tzOffsetMs(new Date(naiveAsUTC), tz);
  return new Date(naiveAsUTC - offset);
}

// 24h "HH:mm" for the given instant, as seen in `tz`.
export function formatTimeInTZ(date: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat([], {
    timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit',
  }).format(date);
}

// Human label ("Saturday, July 11") for a "YYYY-MM-DD" date, rendered stably.
export function formatDateLabel(dateStr: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], opts);
}
