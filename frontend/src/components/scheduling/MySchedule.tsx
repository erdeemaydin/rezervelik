'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import {
  ShiftAssignment,
  getAssignments
} from '@/lib/api/scheduling';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { useFormat } from '@/store/useFormatStore';
import { useTranslation } from '@/i18n/provider';

type DayCell = {
  dateString: string;
  dateObj: Date;
  inMonth: boolean;
};

const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MySchedule({ viewMode = 'MONTHLY', staffScheduleView = 'OWN_ONLY' }: { viewMode?: 'WEEKLY' | 'MONTHLY', staffScheduleView?: string }) {
  const { formatTimeRange } = useFormat();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  // Monday-first weekday header labels, localized.
  const weekdayLabels = useMemo(() => {
    // 2024-01-01 is a Monday — walk 7 days from it for stable Mon..Sun labels.
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, 1 + i);
      return d.toLocaleDateString(dateLocale, { weekday: 'short' });
    });
  }, [dateLocale]);

  // The visible grid: a full weekday-aligned month, or a single Mon..Sun week.
  const cells = useMemo<DayCell[]>(() => {
    if (viewMode === 'WEEKLY') {
      const d = new Date(currentDate);
      const mondayOffset = (d.getDay() + 6) % 7;
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
      return Array.from({ length: 7 }, (_, i) => {
        const curr = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        return { dateString: toDateString(curr), dateObj: curr, inMonth: true };
      });
    }

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const first = new Date(year, month, 1);
    const leading = (first.getDay() + 6) % 7; // blanks before the 1st (Mon-based)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const total = Math.ceil((leading + daysInMonth) / 7) * 7;

    return Array.from({ length: total }, (_, i) => {
      const dayNum = i - leading + 1;
      const curr = new Date(year, month, dayNum);
      return {
        dateString: toDateString(curr),
        dateObj: curr,
        inMonth: dayNum >= 1 && dayNum <= daysInMonth,
      };
    });
  }, [currentDate, viewMode]);

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        setLoading(true);
        const startDate = cells[0].dateString;
        const endDate = cells[cells.length - 1].dateString;

        // The backend enforces visibility from the restaurant's staffScheduleView
        // setting; we still pass userId in OWN_ONLY as a hint.
        const params: any = { startDate, endDate };
        if (staffScheduleView === 'OWN_ONLY') {
          params.userId = user?.id;
        }

        const data = await getAssignments(params);
        setAssignments(data);
      } catch (error) {
        toast.error(t('scheduling.mySchedule.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchAssignments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, user?.id, staffScheduleView]);

  const handlePrev = () => {
    if (viewMode === 'WEEKLY') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'WEEKLY') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }
  };

  const getAssignmentsForDay = (dateString: string) => {
    const dayAssignments = assignments.filter(a => a.date === dateString);

    if (staffScheduleView === 'OWN_ONLY') {
      return dayAssignments.filter(a => a.userId === user?.id);
    }

    if (staffScheduleView === 'SHIFT_TEAM') {
      const userShiftIds = dayAssignments
        .filter(a => a.userId === user?.id)
        .map(a => a.shiftId);
      return dayAssignments.filter(a => userShiftIds.includes(a.shiftId));
    }

    return dayAssignments;
  };

  const todayString = toDateString(new Date());
  const headerLabel = viewMode === 'WEEKLY'
    ? `${t('scheduling.mySchedule.weekOf')} ${cells[0]?.dateObj.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}`
    : currentDate.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold capitalize">{headerLabel}</h3>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        {/* Weekday header */}
        <div className="grid grid-cols-7 bg-muted border-b">
          {weekdayLabels.map((label) => (
            <div key={label} className="px-2 py-2 text-center text-xs md:text-sm font-bold text-muted-foreground">
              {label}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            const dayAssignments = cell.inMonth ? getAssignmentsForDay(cell.dateString) : [];
            const isToday = cell.dateString === todayString;

            return (
              <div
                key={`${cell.dateString}-${idx}`}
                className={[
                  'min-h-[92px] md:min-h-[110px] border-b border-r p-1.5 md:p-2 flex flex-col',
                  !cell.inMonth ? 'bg-muted/60' : '',
                  isToday ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-400' : '',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={[
                    'text-sm md:text-base font-bold',
                    cell.inMonth ? 'text-foreground' : 'text-slate-300',
                    isToday ? 'text-blue-600' : '',
                  ].join(' ')}>
                    {cell.dateObj.getDate()}
                  </span>
                  {isToday && (
                    <Badge className="bg-blue-500 text-[10px] h-4 px-1.5">{t('scheduling.mySchedule.today')}</Badge>
                  )}
                </div>

                <div className="space-y-1 flex-1">
                  {dayAssignments.map((assignment) => {
                    const isOwnShift = assignment.userId === user?.id;
                    const isTeammate = !isOwnShift && staffScheduleView === 'SHIFT_TEAM';
                    return (
                      <div
                        key={assignment.id}
                        className={`rounded-md border px-1.5 py-1 ${isOwnShift ? 'bg-blue-100/70 border-blue-200' : 'bg-muted border-border'}`}
                      >
                        <div className="flex items-center gap-1 text-xs md:text-sm font-semibold text-foreground">
                          <Clock className={`w-3 h-3 shrink-0 ${isOwnShift ? 'text-blue-500' : 'text-muted-foreground'}`} />
                          <span className="truncate">{assignment.shift?.name}</span>
                        </div>
                        <div className="text-[11px] md:text-xs text-muted-foreground mt-0.5 font-medium">
                          {assignment.shift ? formatTimeRange(assignment.shift.startTime, assignment.shift.endTime) : ''}
                        </div>
                        {(staffScheduleView === 'SHIFT_TEAM' || staffScheduleView === 'FULL_ROSTER') && (
                          <div className={`text-[11px] md:text-xs mt-1 truncate ${isOwnShift ? 'text-blue-700 font-bold' : 'text-muted-foreground'}`}>
                            {assignment.user?.firstName} {assignment.user?.lastName}
                            {isOwnShift ? ` (${t('scheduling.mySchedule.you')})` : ''}
                            {isTeammate ? ` · ${t('scheduling.mySchedule.teammate')}` : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cell.inMonth && dayAssignments.length === 0 && (
                    <p className="text-[11px] md:text-xs text-slate-300 italic">{t('scheduling.mySchedule.noShifts')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
