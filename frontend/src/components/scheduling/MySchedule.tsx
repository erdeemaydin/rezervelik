'use client';

import React, { useEffect, useState, useMemo } from 'react';
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

export default function MySchedule() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    loadData();
  }, [currentDate, user?.id]);

  const getMonthDates = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      const dateString = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        dateObj: d,
        dateString,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        formattedDate: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
      };
    });
  };

  const days = useMemo(() => getMonthDates(currentDate), [currentDate]);

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const startDate = days[0].dateString;
      const endDate = days[days.length - 1].dateString;

      const data = await getAssignments({ startDate, endDate, userId: user.id });
      setAssignments(data);
    } catch (error) {
      toast.error('Failed to load your schedule');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // Get assignments for a specific day
  const getDayAssignments = (dateString: string) => {
    return assignments.filter(a => a.date === dateString);
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>My Schedule</CardTitle>
          <CardDescription>View your assigned shifts for the month.</CardDescription>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold w-40 text-center">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center p-8"><p>Loading schedule...</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {days.map((day) => {
              const dayAssignments = getDayAssignments(day.dateString);
              const isWeekend = day.dateObj.getDay() === 0 || day.dateObj.getDay() === 6;
              const isToday = day.dateString === new Date().toISOString().split('T')[0];
              
              if (dayAssignments.length === 0) return null; // Only show days with shifts for a cleaner view

              return (
                <Card key={day.dateString} className={`${isToday ? 'border-blue-500 shadow-md ring-1 ring-blue-500' : ''}`}>
                  <div className={`p-3 border-b flex justify-between items-center ${isWeekend ? 'bg-slate-50' : 'bg-slate-100/50'}`}>
                    <div className="flex items-center gap-2">
                      <CalendarIcon className={`h-4 w-4 ${isToday ? 'text-blue-500' : 'text-slate-500'}`} />
                      <span className={`font-semibold ${isWeekend ? 'text-red-600' : ''} ${isToday ? 'text-blue-600' : ''}`}>
                        {day.dayName}, {day.formattedDate.split(',')[0]}
                      </span>
                    </div>
                    {isToday && <Badge className="bg-blue-500 hover:bg-blue-600 text-[10px]">TODAY</Badge>}
                  </div>
                  <div className="p-3 space-y-3">
                    {dayAssignments.map((assignment) => (
                      <div key={assignment.id} className="flex flex-col gap-1 p-2 bg-blue-50 rounded-md border border-blue-100">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-blue-900">{assignment.shift?.name}</span>
                          <Badge variant="outline" className="bg-white text-[10px]">Assigned</Badge>
                        </div>
                        <div className="flex items-center text-sm text-blue-700">
                          <Clock className="h-3 w-3 mr-1.5" />
                          {assignment.shift?.startTime} - {assignment.shift?.endTime}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}

            {assignments.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 border border-dashed rounded-lg">
                <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>You have no shifts assigned for this month.</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
