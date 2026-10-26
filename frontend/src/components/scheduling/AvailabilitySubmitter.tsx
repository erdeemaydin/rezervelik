'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { Shift, getShifts, getAvailabilities, setAvailability } from '@/lib/api/scheduling';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { useFormat } from '@/store/useFormatStore';
import { useTranslation } from '@/i18n/provider';

export default function AvailabilitySubmitter({ viewMode = 'MONTHLY' }: { viewMode?: 'WEEKLY' | 'MONTHLY' }) {
  const { formatTimeRange } = useFormat();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [availabilities, setAvailabilities] = useState<Record<string, boolean>>({});
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  const getMonthDates = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();

    if (viewMode === 'WEEKLY') {
      const d = new Date(date);
      const dayNum = d.getDay();
      const diff = d.getDate() - dayNum + (dayNum === 0 ? -6 : 1); 
      const startOfWeek = new Date(d.setDate(diff));
      
      return Array.from({ length: 7 }, (_, i) => {
        const curr = new Date(startOfWeek);
        curr.setDate(startOfWeek.getDate() + i);
        return {
          dateObj: curr,
          dateString: `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`,
          dayName: curr.toLocaleDateString(dateLocale, { weekday: 'short' }),
          formattedDate: curr.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
        };
      });
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return {
        dateObj: d,
        dateString: `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
        dayName: d.toLocaleDateString(dateLocale, { weekday: 'short' }),
        formattedDate: d.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
      };
    });
  }, [viewMode]);

  const days = useMemo(() => getMonthDates(currentDate), [currentDate, getMonthDates]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const startDate = days[0].dateString;
        const endDate = days[days.length - 1].dateString;

        const [shiftsData, availData] = await Promise.all([
          getShifts(),
          getAvailabilities({ startDate, endDate, userId: user?.id })
        ]);

        setShifts(shiftsData);
        
        // Convert array to record for easy lookup: { "date-shiftId": true }
        const availRecord: Record<string, boolean> = {};
        availData.forEach(a => {
          availRecord[`${a.date}-${a.shiftId}`] = a.isAvailable;
        });
        setAvailabilities(availRecord);
      } catch (error) {
        toast.error(t('scheduling.availability.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      loadData();
    }
  }, [days, user?.id]);

  const handleToggle = (dateString: string, shiftId: string) => {
    const key = `${dateString}-${shiftId}`;
    setAvailabilities(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      // In a real app, you might want to only send changed ones or send the whole block
      // For simplicity, we'll iterate and send. Ideally, backend accepts a batch.
      const promises = Object.entries(availabilities).map(([key, isAvailable]) => {
        const [date, shiftId] = [key.substring(0, 10), key.substring(11)];
        return setAvailability({ date, shiftId, isAvailable });
      });

      await Promise.all(promises);
      toast.success(t('scheduling.availability.saved'));
    } catch (error) {
      toast.error(t('scheduling.availability.saveFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePrev = () => {
    if (viewMode === 'WEEKLY') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'WEEKLY') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }
  };

  return (
    <div className="space-y-4">
      <Card size="sm" className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>{t('scheduling.availability.title')}</CardTitle>
            <CardDescription>{t('scheduling.availability.desc')}</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {/* min-w (not a fixed w-40) so a longer localized month/week label can
                still grow instead of clipping, same fix as the host console header. */}
            <h3 className="text-sm font-semibold min-w-[110px] text-center whitespace-nowrap px-1">
              {viewMode === 'WEEKLY'
                ? `${t('scheduling.mySchedule.weekOf')} ${days[0]?.formattedDate}`
                : currentDate.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })
              }
            </h3>
            <Button variant="outline" size="icon" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button onClick={handleSave} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white sm:ml-2">
              <Save className="h-4 w-4 mr-2" /> {t('scheduling.availability.saveChanges')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Bounded + scrollable (like the roster grid in ShiftAssigner) so a full
              month of days scrolls within this panel instead of pushing the whole
              page down — that full-page scroll was the actual "empty space, still
              have to scroll a lot" complaint for this tab. */}
          <div className="overflow-auto max-h-[calc(100vh-360px)]">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="border-b bg-muted">
                  <th className="px-3 py-2 font-bold text-foreground text-[10px] border-r sticky left-0 bg-muted z-30">{t('scheduling.availability.date')}</th>
                  {shifts.map(shift => (
                    <th key={shift.id} className="px-3 py-2 font-bold text-foreground text-[10px] text-center">
                      {shift.name}
                      <div className="text-[9px] font-normal text-muted-foreground lowercase mt-0.5">{formatTimeRange(shift.startTime, shift.endTime)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map(day => (
                  <tr key={day.dateString} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-3 py-2 font-medium border-r sticky left-0 bg-card z-10 shadow-[1px_0_0_0_#e2e8f0]">
                      <div className="flex flex-col">
                        <span className="text-sm">{day.formattedDate}</span>
                        <span className="text-[10px] text-muted-foreground">{day.dayName}</span>
                      </div>
                    </td>
                    {shifts.map(shift => {
                      const isAvailable = availabilities[`${day.dateString}-${shift.id}`] || false;
                      return (
                        <td key={shift.id} className="px-3 py-2 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={isAvailable}
                              onCheckedChange={() => handleToggle(day.dateString, shift.id)}
                              className="h-5 w-5 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
