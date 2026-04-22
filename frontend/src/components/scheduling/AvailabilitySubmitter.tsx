'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Shift, getShifts, getAvailabilities, setAvailability } from '@/lib/api/scheduling';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';

export default function AvailabilitySubmitter() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [availabilities, setAvailabilities] = useState<Record<string, boolean>>({});
  
  // State for current selected month (defaults to first day of current month)
  const [currentDate, setCurrentDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [loading, setLoading] = useState(false);

  const { user } = useAuthStore();

  useEffect(() => {
    loadData();
  }, [currentDate]);

  const getMonthDates = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1);
      // Format as YYYY-MM-DD
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
    try {
      setLoading(true);
      
      const startDate = days[0].dateString;
      const endDate = days[days.length - 1].dateString;

      const [shiftsData, availData] = await Promise.all([
        getShifts(),
        getAvailabilities({ startDate, endDate, userId: user?.id })
      ]);
      
      setShifts(shiftsData);
      
      const availMap: Record<string, boolean> = {};
      availData.forEach(a => {
        availMap[`${a.date}_${a.shiftId}`] = a.isAvailable;
      });
      setAvailabilities(availMap);
    } catch (error) {
      toast.error('Failed to load scheduling data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (date: string, shiftId: string, currentStatus: boolean) => {
    const key = `${date}_${shiftId}`;
    const newStatus = !currentStatus;
    
    // Optimistic UI update
    setAvailabilities(prev => ({ ...prev, [key]: newStatus }));
    
    try {
      await setAvailability({
        shiftId,
        date,
        isAvailable: newStatus
      });
    } catch (error) {
      toast.error('Failed to update availability');
      // Revert on error
      setAvailabilities(prev => ({ ...prev, [key]: currentStatus }));
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Monthly Availability</CardTitle>
          <CardDescription>Indicate your availability for the month.</CardDescription>
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
          <div className="flex justify-center p-8"><p>Loading month data...</p></div>
        ) : shifts.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center">No shifts configured for this restaurant.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b">
                <tr>
                  <th scope="col" className="px-4 py-3 border-r min-w-[100px] sticky left-0 bg-slate-100 z-10">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3 border-r min-w-[60px] sticky left-[100px] bg-slate-100 z-10">
                    Day
                  </th>
                  {shifts.map(shift => (
                    <th key={shift.id} scope="col" className="px-4 py-3 border-r text-center">
                      <div className="font-bold">{shift.name}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{shift.startTime} - {shift.endTime}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day, idx) => {
                  const isWeekend = day.dateObj.getDay() === 0 || day.dateObj.getDay() === 6;
                  
                  return (
                    <tr 
                      key={day.dateString} 
                      className={`border-b hover:bg-slate-50 transition-colors ${isWeekend ? 'bg-slate-50/50' : 'bg-white'}`}
                    >
                      <td className="px-4 py-2 border-r font-medium sticky left-0 bg-inherit z-10">
                        {day.formattedDate}
                      </td>
                      <td className={`px-4 py-2 border-r sticky left-[100px] bg-inherit z-10 ${isWeekend ? 'text-red-500 font-medium' : ''}`}>
                        {day.dayName}
                      </td>
                      {shifts.map(shift => {
                        const key = `${day.dateString}_${shift.id}`;
                        const isAvailable = availabilities[key] ?? false;

                        return (
                          <td key={key} className="px-4 py-2 border-r text-center">
                            <div className="flex justify-center items-center h-full">
                              <Checkbox 
                                id={`avail-${key}`} 
                                checked={isAvailable}
                                onCheckedChange={() => handleToggle(day.dateString, shift.id, isAvailable)}
                                className="data-[state=checked]:bg-green-500 data-[state=checked]:border-green-500 h-5 w-5"
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
