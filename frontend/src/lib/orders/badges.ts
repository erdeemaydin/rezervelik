// Shared status → badge-colour map for the staff-facing order surfaces (the
// dashboard order history table, the Active Orders table and the customer
// detail dialog all render the same statuses and must not drift apart).
//
// Dashboard palette only — slate/blue base with per-status accents; the
// terminal failures stay warm/red so a row that ended badly reads as such at a
// glance, and NOT_PICKED_UP gets its own orange rather than sharing the
// cancelled red: it's a customer failure, not a restaurant one.
export const orderStatusBadgeClass = (status: string): string => {
  if (status === 'NEW') return 'bg-blue-100 text-blue-700';
  if (status === 'ACCEPTED') return 'bg-sky-100 text-sky-700';
  if (status === 'PREPARING') return 'bg-amber-100 text-amber-700';
  if (status === 'READY') return 'bg-emerald-100 text-emerald-700';
  if (status === 'OUT_FOR_DELIVERY') return 'bg-purple-100 text-purple-700';
  if (status === 'COMPLETED') return 'bg-green-100 text-green-700';
  if (status === 'NOT_PICKED_UP') return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700'; // CANCELLED / REJECTED
};

/** "12m ago" / "1h 05m ago" / "Just now" for a staff table's age column.
 *  Composed with .replace() rather than i18n interpolation — this app's t()
 *  takes no params. */
export const elapsedSince = (
  iso: string,
  t: (key: string) => string,
  keyPrefix = 'orders.active'
): string => {
  const totalMinutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (totalMinutes < 1) return t(`${keyPrefix}.justNow`);
  if (totalMinutes < 60) return t(`${keyPrefix}.minutesAgo`).replace('{minutes}', String(totalMinutes));
  return t(`${keyPrefix}.hoursAgo`)
    .replace('{hours}', String(Math.floor(totalMinutes / 60)))
    .replace('{minutes}', String(totalMinutes % 60));
};
