import prisma from '../config/prisma';

// KVKK storage-limitation principle (docs/planning/PRODUCTION_ROADMAP.md §3/§7): don't keep
// customer PII longer than necessary to run the business. "Keep 1 year, then
// anonymize" is the recommended posture — RETENTION_DAYS (env, default 400,
// i.e. ~1 year plus a buffer) controls the cutoff. Anonymizing (nulling PII,
// keeping the row and its aggregate/statistical fields) rather than deleting
// preserves analytics (peak hours, no-show rates, etc.) without keeping the
// personal data behind them.
const DEFAULT_RETENTION_DAYS = 400;

export const getRetentionDays = (): number => {
  const raw = process.env.RETENTION_DAYS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS;
};

export const getCutoffDate = (retentionDays: number, now: Date = new Date()): Date =>
  new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

// Pure selection rule, exported so it can be unit-tested without a database:
// given a list of rows (id + the date field the retention window is measured
// from + their current anonymizedAt) and a cutoff, returns the ids that
// qualify for anonymization — not yet anonymized, and older than the cutoff.
export interface RetentionCandidate {
  id: string;
  anchorDate: Date;
  anonymizedAt: Date | null;
}

export const selectForAnonymization = (rows: RetentionCandidate[], cutoff: Date): string[] =>
  rows.filter((r) => !r.anonymizedAt && r.anchorDate < cutoff).map((r) => r.id);

// Reservation.startTime is the retention anchor — the actual booking date is
// the meaningful "how old is this customer relationship" reference, not
// createdAt (which would anonymize a reservation made a year in advance the
// moment it's created).
async function anonymizeReservations(cutoff: Date): Promise<number> {
  const result = await prisma.reservation.updateMany({
    where: { anonymizedAt: null, startTime: { lt: cutoff } },
    data: {
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      // Free-text fields can carry PII/sensitive data too (e.g. "call my cell
      // instead", dietary/health notes) — cleared along with the identity fields.
      notes: null,
      internalNote: null,
      anonymizedAt: new Date(),
    },
  });
  return result.count;
}

// WaitlistEntry carries the same kind of guest PII (name/phone/notes) via the
// same public booking surface — anonymized on the same schedule.
async function anonymizeWaitlistEntries(cutoff: Date): Promise<number> {
  const result = await prisma.waitlistEntry.updateMany({
    where: { anonymizedAt: null, joinedAt: { lt: cutoff } },
    data: {
      customerName: null,
      customerPhone: null,
      notes: null,
      anonymizedAt: new Date(),
    },
  });
  return result.count;
}

export async function runRetentionAnonymization(): Promise<{ reservations: number; waitlistEntries: number }> {
  const retentionDays = getRetentionDays();
  const cutoff = getCutoffDate(retentionDays);
  const [reservations, waitlistEntries] = await Promise.all([
    anonymizeReservations(cutoff),
    anonymizeWaitlistEntries(cutoff),
  ]);
  if (reservations > 0 || waitlistEntries > 0) {
    console.log(
      `[Retention Worker] Anonymized ${reservations} reservation(s) and ${waitlistEntries} waitlist entr${waitlistEntries === 1 ? 'y' : 'ies'} older than ${retentionDays} days.`
    );
  }
  return { reservations, waitlistEntries };
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day — retention is not time-sensitive like priceUpdater

export const startRetentionAnonymizer = () => {
  console.log(`[Worker] Retention/anonymization worker initialized. Retention window: ${getRetentionDays()} days.`);

  // Run once shortly after boot (not immediately — let the rest of startup
  // settle first) so a long-running server doesn't wait a full day for its
  // first pass, then repeat on the daily interval.
  setTimeout(() => {
    runRetentionAnonymization().catch((err) => console.error('[Retention Worker] Run failed:', err));
  }, 30 * 1000);

  setInterval(() => {
    runRetentionAnonymization().catch((err) => console.error('[Retention Worker] Run failed:', err));
  }, CHECK_INTERVAL_MS);
};
