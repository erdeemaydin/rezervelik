// Platform-wide date/time formatting.
//
// The root system admin picks one convention for the whole platform
// (GlobalSettings.measurementSystem), surfaced to the tenant dashboard via
// GET /settings. These helpers render numeric dates and clock times to match it,
// independently of the viewer's browser locale, so the display is deterministic:
//
//   METRIC (European / Turkish) -> DD/MM/YYYY  +  24-hour clock ("14:30")
//   US     (United States)       -> MM/DD/YYYY  +  12-hour clock ("2:30 PM")
//
// Weekday / month *names* still follow the UI language (tr/en); only the numeric
// layout and the 12h/24h choice are governed by the measurement system.

export type MeasurementSystem = 'METRIC' | 'US';

export const DEFAULT_SYSTEM: MeasurementSystem = 'METRIC';

const pad = (n: number) => String(n).padStart(2, '0');

// Accepts a Date, a "YYYY-MM-DD" date string, or a "YYYY-MM-DDTHH:mm..." string.
// A bare date string is interpreted as local midnight (no timezone shift).
function toDate(input: Date | string): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input !== 'string' || !input) return null;
  const s = /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T00:00:00` : input;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Numeric date: DD/MM/YYYY (METRIC) or MM/DD/YYYY (US).
export function formatDate(input: Date | string, system: MeasurementSystem = DEFAULT_SYSTEM): string {
  const d = toDate(input);
  if (!d) return typeof input === 'string' ? input : '';
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  return system === 'US' ? `${mm}/${dd}/${yyyy}` : `${dd}/${mm}/${yyyy}`;
}

// Short numeric date without the year: DD/MM (METRIC) or MM/DD (US).
export function formatDateShort(input: Date | string, system: MeasurementSystem = DEFAULT_SYSTEM): string {
  const d = toDate(input);
  if (!d) return typeof input === 'string' ? input : '';
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  return system === 'US' ? `${mm}/${dd}` : `${dd}/${mm}`;
}

// Split an "HH:mm" wall-clock string (or Date) into hours/minutes.
function toHM(input: Date | string): { h: number; m: number } | null {
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : { h: input.getHours(), m: input.getMinutes() };
  }
  if (typeof input !== 'string' || !input) return null;
  const [hStr, mStr] = input.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return null;
  return { h, m };
}

// Clock time: "14:30" (METRIC / 24h) or "2:30 PM" (US / 12h).
export function formatTime(input: Date | string, system: MeasurementSystem = DEFAULT_SYSTEM): string {
  const hm = toHM(input);
  if (!hm) return typeof input === 'string' ? input : '';
  const { h, m } = hm;
  if (system === 'US') {
    const ampm = h < 12 ? 'AM' : 'PM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${pad(m)} ${ampm}`;
  }
  return `${pad(h)}:${pad(m)}`;
}

// A time range, e.g. "09:00 – 17:00" or "9:00 AM – 5:00 PM".
export function formatTimeRange(start: string, end: string, system: MeasurementSystem = DEFAULT_SYSTEM): string {
  return `${formatTime(start, system)} – ${formatTime(end, system)}`;
}

// "YYYY-MM-DD" -> "HH:mm" options at 5-minute (default) intervals across a full
// day, each labelled per the measurement system. Value stays canonical 24h "HH:mm".
export function timeOptions(system: MeasurementSystem = DEFAULT_SYSTEM, stepMinutes = 5): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let mins = 0; mins < 24 * 60; mins += stepMinutes) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${pad(h)}:${pad(m)}`;
    out.push({ value, label: formatTime(value, system) });
  }
  return out;
}
