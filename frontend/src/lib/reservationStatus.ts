// Single source of truth for reservation status categories, their canonical
// colors, and their i18n label keys. Every surface (reservations list, timeline,
// live & pending, analytics, status dots) must read from here so a status always
// looks the same across the whole app (#4.3). CONFIRMED is blue per the owner's
// example; each status owns exactly one hue.

export type ReservationStatus =
  | 'PENDING'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface StatusStyle {
  /** i18n key under `reservations.status.*` for the human label */
  labelKey: string;
  /** raw hex for dots, heatmap and chart marks */
  hex: string;
  /** solid badge classes (colored background, white text) */
  badge: string;
  /** subtle row-tint classes for table rows */
  row: string;
  /** small solid dot classes */
  dot: string;
  /** timeline block classes */
  block: string;
}

// Display/ordering used by status-count dot rows.
export const STATUS_ORDER: ReservationStatus[] = [
  'PENDING',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

export const STATUS_STYLES: Record<ReservationStatus, StatusStyle> = {
  PENDING: {
    labelKey: 'reservations.status.pending',
    hex: '#f59e0b', // amber-500
    badge: 'bg-amber-500 text-white border-transparent',
    row: 'bg-amber-100/60 hover:bg-amber-200/60',
    dot: 'bg-amber-500',
    block: 'bg-amber-500 border-amber-600',
  },
  AWAITING_PAYMENT: {
    labelKey: 'reservations.status.awaitingPayment',
    hex: '#7c3aed', // violet-600
    badge: 'bg-violet-600 text-white border-transparent',
    row: 'bg-violet-100/60 hover:bg-violet-200/60',
    dot: 'bg-violet-600',
    block: 'bg-violet-600 border-violet-700',
  },
  CONFIRMED: {
    labelKey: 'reservations.status.confirmed',
    hex: '#2563eb', // blue-600
    badge: 'bg-blue-600 text-white border-transparent',
    row: 'bg-blue-50 hover:bg-blue-100/80',
    dot: 'bg-blue-600',
    block: 'bg-blue-600 border-blue-700',
  },
  SEATED: {
    labelKey: 'reservations.status.seated',
    hex: '#0d9488', // teal-600
    badge: 'bg-teal-600 text-white border-transparent',
    row: 'bg-teal-50 hover:bg-teal-100/80',
    dot: 'bg-teal-600',
    block: 'bg-teal-600 border-teal-700',
  },
  COMPLETED: {
    labelKey: 'reservations.status.completed',
    hex: '#64748b', // slate-500
    badge: 'bg-slate-500 text-white border-transparent',
    row: 'bg-slate-100 hover:bg-slate-200',
    dot: 'bg-slate-500',
    block: 'bg-slate-500 border-slate-600',
  },
  CANCELLED: {
    labelKey: 'reservations.status.cancelled',
    hex: '#e11d48', // rose-600
    badge: 'bg-rose-600 text-white border-transparent',
    row: 'bg-rose-100/60 hover:bg-rose-200/60',
    dot: 'bg-rose-600',
    block: 'bg-rose-600 border-rose-700',
  },
  NO_SHOW: {
    labelKey: 'reservations.status.noShow',
    hex: '#0f172a', // slate-900
    badge: 'bg-slate-900 text-white border-transparent',
    row: 'bg-slate-200 hover:bg-slate-300',
    dot: 'bg-slate-900',
    block: 'bg-slate-900 border-black',
  },
};

const FALLBACK: StatusStyle = STATUS_STYLES.PENDING;

export function statusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status as ReservationStatus] ?? FALLBACK;
}
