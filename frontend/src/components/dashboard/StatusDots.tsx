"use client"

import { useTranslation } from '@/i18n/provider';
import { STATUS_ORDER, STATUS_STYLES } from '@/lib/reservationStatus';
import { cn } from '@/lib/utils';

interface StatusDotsProps {
  /** reservations (any objects carrying a `status` string) */
  items: { status: string }[];
  className?: string;
  /** when set, clicking a status calls back with it (e.g. to filter) */
  onSelect?: (status: string | null) => void;
  activeStatus?: string | null;
}

/**
 * Compact legend of reservation counts by status, each with its canonical color
 * dot — e.g. "All 43 · Confirmed 22 · Pending 9". Shared by the reservations
 * list and the timeline so the tallies always match and mean the same thing (#5.7).
 */
export function StatusDots({ items, className, onSelect, activeStatus }: StatusDotsProps) {
  const { t } = useTranslation();
  const total = items.length;

  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: items.filter((i) => i.status === status).length,
    style: STATUS_STYLES[status],
  })).filter((c) => c.count > 0);

  const Chip = ({
    label, count, dotClass, value,
  }: { label: string; count: number; dotClass?: string; value: string | null }) => {
    const active = activeStatus === value || (value === null && !activeStatus);
    const content = (
      <span className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700',
        onSelect && 'cursor-pointer hover:bg-slate-200 transition-colors',
        active && onSelect && 'hover:bg-slate-900',
      )}>
        {dotClass ? <span className={cn('w-2 h-2 rounded-full', dotClass)} /> : null}
        <span>{label}</span>
        <span className={cn('tabular-nums font-black', active ? 'text-white' : 'text-slate-900')}>{count}</span>
      </span>
    );
    if (!onSelect) return content;
    return (
      <button type="button" onClick={() => onSelect(value)} className="outline-none">
        {content}
      </button>
    );
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Chip label={t('reservations.totalLabel')} count={total} value={null} />
      {counts.map((c) => (
        <Chip
          key={c.status}
          label={t(c.style.labelKey)}
          count={c.count}
          dotClass={c.style.dot}
          value={c.status}
        />
      ))}
    </div>
  );
}
