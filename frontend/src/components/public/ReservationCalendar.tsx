'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTodayInTZ, DEFAULT_TZ } from '@/lib/datetime';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Compact month calendar for the public booking form. Theme-adaptive: neutral
// text/borders inherit the surrounding `currentColor`, so it blends into light
// or dark layouts, and highlights use the passed `accent` color. Past days
// (relative to "today" in the restaurant timezone) are disabled.
export default function ReservationCalendar({
  value,
  onChange,
  tz = DEFAULT_TZ,
  className,
  accent = '#0f172a',
  accentText = '#ffffff',
}: {
  value: string;
  onChange: (dateStr: string) => void;
  tz?: string;
  className?: string;
  accent?: string;
  accentText?: string;
}) {
  const today = getTodayInTZ(tz); // YYYY-MM-DD in restaurant tz
  const [vy, vm] = value ? value.split('-').map(Number) : today.split('-').map(Number);
  const [view, setView] = useState({ year: vy, month: (vm ?? 1) - 1 }); // month is 0-based

  const weekdays = useMemo(() => {
    // Monday-first short weekday names in the active locale.
    const base = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) =>
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + i).toLocaleDateString([], { weekday: 'narrow' })
    );
  }, []);

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const firstDow = (new Date(view.year, view.month, 1).getDay() + 6) % 7; // Mon=0 … Sun=6

  const shiftMonth = (delta: number) => {
    const d = new Date(view.year, view.month + delta, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  // Restrict paging back beyond the current month.
  const [ty, tm] = today.split('-').map(Number);
  const atCurrentMonth = view.year === ty && view.month === tm - 1;

  return (
    <div className={cn('w-full select-none', className)}>
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={atCurrentMonth}
          className="h-8 w-8 flex items-center justify-center rounded-full border border-current/15 hover:bg-current/10 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-semibold capitalize">{monthLabel}</div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="h-8 w-8 flex items-center justify-center rounded-full border border-current/15 hover:bg-current/10 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((w, i) => (
          <div key={i} className="h-7 flex items-center justify-center text-[10px] font-bold opacity-50">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const dateStr = ymd(view.year, view.month, day);
          const isPast = dateStr < today;
          const isToday = dateStr === today;
          const isSelected = dateStr === value;
          return (
            <button
              key={day}
              type="button"
              disabled={isPast}
              onClick={() => onChange(dateStr)}
              style={
                isSelected ? { background: accent, color: accentText }
                : isToday ? { boxShadow: `inset 0 0 0 1px ${accent}`, color: accent }
                : undefined
              }
              className={cn(
                'aspect-square flex items-center justify-center rounded-xl text-sm font-medium transition-all',
                isPast && 'opacity-25 cursor-not-allowed',
                !isPast && !isSelected && !isToday && 'hover:bg-current/10',
                (isToday || isSelected) && 'font-bold'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
