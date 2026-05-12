'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { 
  ShiftAssignment, 
  getAssignments 
} from '@/lib/api/scheduling';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';

export default function MySchedule({ viewMode = 'MONTHLY' }: { viewMode?: 'WEEKLY' | 'MONTHLY' }) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
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
          dayName: curr.toLocaleDateString('en-US', { weekday: 'short' }),
          formattedDate: curr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        };
      });
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      return {
        dateObj: d,
        dateString: `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        formattedDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      };
    });
  }, [viewMode]);

  const days = useMemo(() => getMonthDates(currentDate), [currentDate, getMonthDates]);

  useEffect(() => {
    const fetchAssignments = async () => {
      try {
        setLoading(true);
        const startDate = days[0].dateString;
        const endDate = days[days.length - 1].dateString;
        const data = await getAssignments({ startDate, endDate, userId: user?.id });
        setAssignments(data);
      } catch (error) {
        toast.error('Failed to load your schedule');
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchAssignments();
    }
  }, [days, user?.id]);

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

  const getAssignmentsForDay = (dateString: string) => {
    return assignments.filter(a => a.date === dateString);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold w-48 text-center">
            {viewMode === 'WEEKLY' 
              ? `Week of ${days[0]?.formattedDate}`
              : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            }
          </h3>
          <Button variant="outline" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {days.map((day) => {
          const dayAssignments = getAssignmentsForDay(day.dateString);
          const isToday = new Date().toISOString().split('T')[0] === day.dateString;

          return (
            <Card key={day.dateString} className={`${isToday ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}>
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                <div>
                  <p className="text-sm font-bold">{day.formattedDate}</p>
                  <p className="text-xs text-muted-foreground uppercase">{day.dayName}</p>
                </div>
                {isToday && <Badge className="bg-blue-500">Today</Badge>}
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-2 mt-2">
                  {dayAssignments.length > 0 ? (
                    dayAssignments.map((assignment) => (
                      <div key={assignment.id} className="p-2 bg-slate-50 rounded-md border border-slate-100">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <Clock className="w-3 h-3 text-blue-500" />
                          {assignment.shift?.name}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 ml-5 font-medium">
                          {assignment.shift?.startTime} - {assignment.shift?.endTime}
                        </div>
                        {assignment.isPublished && (
                           <Badge variant="outline" className="mt-2 text-[8px] h-4 bg-green-50 text-green-600 border-green-100 uppercase font-black">Published</Badge>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400 italic py-2">No shifts assigned</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
