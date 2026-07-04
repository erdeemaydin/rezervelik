// Shared worked-hours math so the schedule roster and the timesheet always agree
// on the same numbers (single source of truth over the same TimeEntry data).
//
// Rule (#schedule-timesheet integration):
//  - If a staff member has an explicit TimeEntry (check-in/out) for a shift, their
//    worked time = (checkOut - checkIn) - that entry's break.
//  - If they are merely ASSIGNED to the shift with no entry, they are credited with
//    the shift's scheduled length minus the restaurant's default break.

export interface EntryLike {
  checkIn?: string | null;
  checkOut?: string | null;
  breakMinutes?: number | null;
}

export type WorkedSource = 'ENTRY' | 'SCHEDULED';

export interface WorkedResult {
  minutes: number;          // actual worked minutes to credit
  scheduledMinutes: number; // expected minutes for the shift (length - default break)
  source: WorkedSource;     // ENTRY = from a real check-in/out; SCHEDULED = assumed
}

const toMinutes = (hhmm?: string | null): number | null => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

// Length of a shift/entry window in minutes, tolerating a window that crosses midnight.
export function windowMinutes(start?: string | null, end?: string | null): number | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return null;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff);
}

// Worked minutes from an explicit entry, or null if it lacks check-in/out.
export function entryWorkedMinutes(entry: EntryLike | null | undefined): number | null {
  if (!entry) return null;
  const win = windowMinutes(entry.checkIn, entry.checkOut);
  if (win == null) return null;
  return Math.max(0, win - (entry.breakMinutes || 0));
}

// Resolve the worked time for one shift assignment, preferring the real entry.
export function computeWorked(
  shiftStart: string,
  shiftEnd: string,
  entry: EntryLike | null | undefined,
  defaultBreakMinutes = 0
): WorkedResult {
  const length = windowMinutes(shiftStart, shiftEnd) ?? 0;
  const scheduledMinutes = Math.max(0, length - (defaultBreakMinutes || 0));
  const actual = entryWorkedMinutes(entry);
  if (actual != null) return { minutes: actual, scheduledMinutes, source: 'ENTRY' };
  return { minutes: scheduledMinutes, scheduledMinutes, source: 'SCHEDULED' };
}

// "8:00" style H:MM label for a minutes total.
export function formatHM(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

// Rounded decimal hours, e.g. 7.5.
export function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

// Over/under classification for coloring (small epsilon avoids float noise).
export function workedTone(minutes: number, scheduledMinutes: number): 'over' | 'under' | 'ok' {
  if (minutes > scheduledMinutes + 1) return 'over';
  if (minutes < scheduledMinutes - 1) return 'under';
  return 'ok';
}
