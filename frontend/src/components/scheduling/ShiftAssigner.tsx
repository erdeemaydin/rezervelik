'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import api from '@/lib/api';
import { 
  Shift, 
  EmployeeAvailability, 
  ShiftAssignment, 
  getShifts, 
  getAvailabilities, 
  getAssignments, 
  assignShift, 
  removeAssignment 
} from '@/lib/api/scheduling';
import { toast } from 'sonner';

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default function ShiftAssigner() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [currentDate]);

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
    try {
      setLoading(true);
      const startDate = days[0].dateString;
      const endDate = days[days.length - 1].dateString;

      const [shiftsData, availData, assignData, staffRes] = await Promise.all([
        getShifts(),
        getAvailabilities({ startDate, endDate }),
        getAssignments({ startDate, endDate }),
        api.get('/staff')
      ]);

      setShifts(shiftsData);
      setAvailabilities(availData);
      setAssignments(assignData);
      setStaff(staffRes.data.data || []);
    } catch (error) {
      toast.error('Failed to load roster data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (shiftId: string, userId: string, date: string) => {
    try {
      const newAssignment = await assignShift({ shiftId, userId, date });
      toast.success('Assigned successfully');
      // Update local state without full reload
      setAssignments(prev => [...prev, { ...newAssignment, user: staff.find(s => s.id === userId) }]);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to assign staff');
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    try {
      await removeAssignment(id);
      toast.success('Assignment removed');
      setAssignments(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      toast.error('Failed to remove assignment');
    }
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // Helper to find assignments for a specific cell
  const getCellAssignments = (dateString: string, shiftId: string) => {
    return assignments.filter(a => a.date === dateString && a.shiftId === shiftId);
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Monthly Roster</CardTitle>
          <CardDescription>Assign staff to shifts for the entire month.</CardDescription>
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
          <div className="flex justify-center p-8"><p>Loading roster data...</p></div>
        ) : shifts.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center">No shifts configured for this restaurant.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b">
                <tr>
                  <th scope="col" className="px-4 py-3 border-r min-w-[100px] sticky left-0 bg-slate-100 z-20">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3 border-r min-w-[60px] sticky left-[100px] bg-slate-100 z-20">
                    Day
                  </th>
                  {shifts.map(shift => (
                    <th key={shift.id} scope="col" className="px-4 py-3 border-r min-w-[200px]">
                      <div className="font-bold">{shift.name}</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        {shift.startTime} - {shift.endTime} | Req: {shift.requiredStaff}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
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
                        const cellAssignments = getCellAssignments(day.dateString, shift.id);
                        const isUnderstaffed = cellAssignments.length < shift.requiredStaff;
                        
                        return (
                          <td key={`${day.dateString}_${shift.id}`} className="px-2 py-2 border-r align-top relative group">
                            <div className="flex flex-col gap-1 min-h-[40px]">
                              {cellAssignments.map(assignment => (
                                <Badge 
                                  key={assignment.id} 
                                  variant="secondary" 
                                  className="flex justify-between items-center py-1 px-2 text-xs"
                                >
                                  <span className="truncate max-w-[120px]">
                                    {assignment.user?.firstName} {assignment.user?.lastName?.charAt(0)}.
                                  </span>
                                  <button 
                                    className="text-slate-400 hover:text-red-500 ml-1"
                                    onClick={() => handleRemoveAssignment(assignment.id)}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}

                              {/* Assignment Popover */}
                              <Popover>
                                <PopoverTrigger
                                  className={`h-6 w-full mt-1 border border-dashed flex justify-center items-center text-xs opacity-0 group-hover:opacity-100 transition-opacity rounded-md cursor-pointer ${
                                    isUnderstaffed && cellAssignments.length === 0 ? 'opacity-100 border-red-300 text-red-500 bg-red-50' : 'text-slate-400 border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Add Staff
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-0" align="start">
                                  <div className="p-3 border-b bg-slate-50">
                                    <h4 className="font-semibold text-sm">Assign Staff</h4>
                                    <p className="text-xs text-muted-foreground">{shift.name} - {day.formattedDate}</p>
                                  </div>
                                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                                    {staff.length === 0 ? (
                                      <p className="text-xs text-center py-2 text-slate-500">No staff members found.</p>
                                    ) : (
                                      staff.map(s => {
                                        const isAlreadyAssigned = cellAssignments.some(a => a.userId === s.id);
                                        if (isAlreadyAssigned) return null;

                                        // Find if this specific staff indicated availability
                                        const availRecord = availabilities.find(a => a.shiftId === shift.id && a.date === day.dateString && a.userId === s.id);
                                        const isAvailable = availRecord?.isAvailable;

                                        return (
                                          <button
                                            key={s.id}
                                            onClick={() => handleAssign(shift.id, s.id, day.dateString)}
                                            className="w-full flex items-center justify-between text-left px-2 py-2 text-sm rounded hover:bg-slate-100 transition-colors"
                                          >
                                            <span className="font-medium">{s.firstName} {s.lastName}</span>
                                            {isAvailable && (
                                              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200 ml-2">Available</Badge>
                                            )}
                                          </button>
                                        );
                                      })
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
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
