'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, GripVertical, Trash2, X } from 'lucide-react';
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

import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

// DRAGGABLE STAFF COMPONENT
function DraggableStaff({ staff }: { staff: Staff }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `staff-${staff.id}`,
    data: { staff },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center justify-between p-2 mb-2 bg-white border rounded cursor-grab active:cursor-grabbing shadow-sm hover:border-blue-400 hover:shadow transition-all ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="flex items-center">
        <GripVertical className="h-4 w-4 text-slate-400 mr-2" />
        <span className="text-sm font-medium">{staff.firstName} {staff.lastName}</span>
      </div>
    </div>
  );
}

// DROPPABLE CELL COMPONENT
function DroppableCell({ 
  id, 
  children, 
  isUnderstaffed 
}: { 
  id: string; 
  children: React.ReactNode; 
  isUnderstaffed: boolean 
}) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <td
      ref={setNodeRef}
      className={`px-2 py-2 border-r align-top relative transition-colors ${
        isOver 
          ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' 
          : isUnderstaffed 
            ? 'bg-red-50/30' 
            : ''
      }`}
    >
      <div className="flex flex-col gap-1 min-h-[50px] w-full">
        {children}
        {isUnderstaffed && !isOver && (
           <div className="text-[10px] text-red-400 opacity-50 italic text-center mt-1 select-none pointer-events-none">Drag staff here</div>
        )}
      </div>
    </td>
  );
}

export default function ShiftAssigner() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  // Drag state
  const [activeStaff, setActiveStaff] = useState<Staff | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // minimum distance before drag starts
      },
    })
  );

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
    // Prevent duplicate assignment in the UI first
    if (assignments.some(a => a.shiftId === shiftId && a.userId === userId && a.date === date)) {
      toast.warning('Staff is already assigned to this shift');
      return;
    }

    try {
      const newAssignment = await assignShift({ shiftId, userId, date });
      toast.success('Assigned successfully');
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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const staffData = active.data.current?.staff as Staff;
    if (staffData) {
      setActiveStaff(staffData);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveStaff(null);
    const { active, over } = event;

    if (over && active) {
      const staffId = (active.id as string).replace('staff-', '');
      // over.id is formatted as `cell-{dateString}-{shiftId}`
      const dropId = over.id as string;
      
      if (dropId.startsWith('cell-')) {
        const parts = dropId.split('-');
        // Extract cell-YYYY-MM-DD-shiftId
        // e.g., cell-2026-08-01-uuid
        const dateString = `${parts[1]}-${parts[2]}-${parts[3]}`;
        const shiftId = parts.slice(4).join('-');
        
        handleAssign(shiftId, staffId, dateString);
      }
    }
  };

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  // Helper to find assignments for a specific cell
  const getCellAssignments = (dateString: string, shiftId: string) => {
    return assignments.filter(a => a.date === dateString && a.shiftId === shiftId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* DRAGGABLE STAFF SIDEBAR */}
        <Card className="w-full xl:w-64 shrink-0 h-fit sticky top-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Staff Pool</CardTitle>
            <CardDescription className="text-xs">Drag members into the schedule grid.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[70vh] overflow-y-auto pr-2">
            {staff.map(s => (
              <DraggableStaff key={s.id} staff={s} />
            ))}
          </CardContent>
        </Card>

        {/* MAIN ROSTER GRID */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <div>
              <CardTitle>Schedule Builder</CardTitle>
              <CardDescription>Drag staff from the left panel onto the specific shifts.</CardDescription>
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
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center p-8"><p>Loading roster data...</p></div>
            ) : shifts.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center">No shifts configured for this restaurant.</p>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-sm text-left border-collapse min-w-[800px]">
                  <thead className="text-xs text-slate-700 uppercase bg-slate-100 border-b">
                    <tr>
                      <th scope="col" className="px-4 py-3 border-r min-w-[80px] sticky left-0 bg-slate-100 z-20 shadow-[1px_0_0_0_#e2e8f0]">
                        Date
                      </th>
                      {shifts.map(shift => (
                        <th key={shift.id} scope="col" className="px-2 py-3 border-r min-w-[160px] max-w-[200px]">
                          <div className="font-bold text-center">{shift.name}</div>
                          <div className="text-[10px] text-slate-500 font-normal text-center mt-0.5">
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
                          className={`border-b hover:bg-slate-50/50 transition-colors ${isWeekend ? 'bg-slate-50' : 'bg-white'}`}
                        >
                          {/* Date Column */}
                          <td className={`px-4 py-2 border-r text-xs font-medium sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0] ${isWeekend ? 'bg-slate-50 text-red-500' : 'bg-white'}`}>
                            {day.formattedDate.split(',')[0]} <br/>
                            <span className="text-muted-foreground">{day.dayName}</span>
                          </td>

                          {/* Shift Columns (Droppable Areas) */}
                          {shifts.map(shift => {
                            const cellAssignments = getCellAssignments(day.dateString, shift.id);
                            const isUnderstaffed = cellAssignments.length < shift.requiredStaff;
                            const cellId = `cell-${day.dateString}-${shift.id}`;
                            
                            return (
                              <DroppableCell 
                                key={cellId} 
                                id={cellId} 
                                isUnderstaffed={isUnderstaffed && cellAssignments.length === 0}
                              >
                                {cellAssignments.map(assignment => (
                                  <Badge 
                                    key={assignment.id} 
                                    variant="secondary" 
                                    className="flex justify-between items-center py-1 px-2 text-xs bg-slate-100 hover:bg-slate-200 border-slate-200 w-full mb-1 group"
                                  >
                                    <span className="truncate mr-2 flex-1">
                                      {assignment.user?.firstName} {assignment.user?.lastName?.charAt(0)}.
                                    </span>
                                    <button 
                                      className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                      onClick={() => handleRemoveAssignment(assignment.id)}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </DroppableCell>
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
      </div>

      <DragOverlay>
        {activeStaff ? (
          <div className="flex items-center p-2 bg-blue-600 text-white shadow-xl rounded-md opacity-90 scale-105">
            <GripVertical className="h-4 w-4 mr-2" />
            <span className="text-sm font-bold">{activeStaff.firstName} {activeStaff.lastName}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
