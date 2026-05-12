'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, GripVertical, X, Download, Send, CheckCircle2, Ban, Users, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { 
  Shift, 
  EmployeeAvailability, 
  ShiftAssignment, 
  getShifts, 
  getAvailabilities, 
  getAssignments, 
  assignShift, 
  publishAssignments,
  unpublishAssignments,
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

export default function ShiftAssigner({ viewMode = 'MONTHLY' }: { viewMode?: 'WEEKLY' | 'MONTHLY' }) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
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
        const dateString = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
        return {
          dateObj: curr,
          dateString,
          dayName: curr.toLocaleDateString('en-US', { weekday: 'short' }),
          formattedDate: curr.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
        };
      });
    }
    
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
  }, [viewMode]);

  const days = useMemo(() => getMonthDates(currentDate), [currentDate, getMonthDates]);

  const loadData = useCallback(async () => {
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
  }, [days]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const handlePrevMonth = () => {
    if (viewMode === 'WEEKLY') {
        const d = new Date(currentDate);
        d.setDate(d.getDate() - 7);
        setCurrentDate(d);
    } else {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    }
  };
  const handleNextMonth = () => {
    if (viewMode === 'WEEKLY') {
        const d = new Date(currentDate);
        d.setDate(d.getDate() + 7);
        setCurrentDate(d);
    } else {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }
  };

  // Helper to find assignments for a specific cell
  const getCellAssignments = (dateString: string, shiftId: string) => {
    return assignments.filter(a => a.date === dateString && a.shiftId === shiftId);
  };

  const isCurrentRangePublished = useMemo(() => {
    if (assignments.length === 0) return false;
    const rangeAssignments = assignments.filter(a => days.some(d => d.dateString === a.date));
    if (rangeAssignments.length === 0) return false;
    return rangeAssignments.every(a => a.isPublished);
  }, [assignments, days]);

  const handlePublishSchedule = async () => {
    if (isCurrentRangePublished) {
      toast.info('This schedule is already published to staff.');
      return;
    }

    try {
      const startDate = days[0].dateString;
      const endDate = days[days.length - 1].dateString;
      
      toast.info('Publishing schedule to staff...');
      await publishAssignments({ startDate, endDate });
      
      // Update local state to reflect published status for the current range
      setAssignments(prev => prev.map(a => {
        if (days.some(d => d.dateString === a.date)) {
           return { ...a, isPublished: true };
        }
        return a;
      }));
      toast.success('Schedule published successfully!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to publish schedule');
    }
  };

  const handleUnpublishSchedule = async () => {
    if (!isCurrentRangePublished) return;

    try {
      const startDate = days[0].dateString;
      const endDate = days[days.length - 1].dateString;
      
      toast.info('Unpublishing schedule...');
      await unpublishAssignments({ startDate, endDate });
      
      // Update local state
      setAssignments(prev => prev.map(a => {
        if (days.some(d => d.dateString === a.date)) {
           return { ...a, isPublished: false };
        }
        return a;
      }));
      toast.success('Schedule unpublished. It is no longer visible to staff.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to unpublish schedule');
    }
  };

  const handleExportPDF = async () => {
    try {
      toast.info('Generating PDF document...');
      
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF({ orientation: 'landscape' });

      // Title
      doc.setFontSize(18);
      doc.text(`Staff Schedule - ${viewMode}`, 14, 20);
      doc.setFontSize(11);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 28);

      // Define table columns
      const tableColumn = ["Date", ...shifts.map(s => `${s.name} (${s.startTime}-${s.endTime})`)];
      
      // Define table rows
      const tableRows: any[][] = [];

      days.forEach(day => {
        const rowData = [
          `${day.dayName}, ${day.formattedDate}`
        ];

        shifts.forEach(shift => {
          const shiftAssignments = assignments.filter(a => a.date === day.dateString && a.shiftId === shift.id);
          const staffNames = shiftAssignments.map(a => {
            const user = a.user || staff.find(s => s.id === a.userId);
            return `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
          }).join('\\n');
          rowData.push(staffNames || 'Unassigned');
        });

        tableRows.push(rowData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { valign: 'top' },
      });

      doc.save(`roster_${viewMode}_${currentDate.toISOString().split('T')[0]}.pdf`);
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('PDF Export Error:', error);
      toast.error('Failed to export PDF');
    }
  };

  const handleExportPNG = async () => {
    const input = document.getElementById('roster-table-container');
    if (!input) return;

    try {
      toast.info('Generating PNG image...');
      
      const originalBg = input.style.backgroundColor;
      input.style.backgroundColor = '#ffffff';

      await new Promise(resolve => setTimeout(resolve, 500));

      const { toPng } = await import('html-to-image');

      const dataUrl = await toPng(input, { 
        pixelRatio: 3, // Higher scale for better quality PNG
        backgroundColor: '#ffffff',
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        }
      });

      input.style.backgroundColor = originalBg;

      const link = document.createElement('a');
      link.download = `roster_${viewMode}_${currentDate.toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
      
      toast.success('PNG exported successfully');
    } catch (error) {
      console.error('PNG Export Error:', error);
      toast.error('Failed to export PNG');
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-6 w-full max-w-[95vw] mx-auto">
        
        {/* DRAGGABLE STAFF SECTION - NOW ON TOP */}
        <Card className="w-full">
          <CardHeader className="pb-4 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center">
                  <Users className="h-5 w-5 mr-2 text-blue-600" />
                  Staff Pool
                </CardTitle>
                <CardDescription className="text-xs">Drag members onto the shifts below.</CardDescription>
              </div>
              <Badge variant="outline" className="text-[10px] font-normal border-slate-200">
                {staff.length} Members Available
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-6">
            <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 max-h-40">
              {staff.map(s => (
                <div key={s.id} className="shrink-0 min-w-[140px]">
                  <DraggableStaff staff={s} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* MAIN ROSTER GRID */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between pb-6 gap-4">
            <div>
              <CardTitle className="text-xl">Schedule Builder</CardTitle>
              <CardDescription>Plan and manage restaurant shifts.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-white border rounded-md p-1 shadow-sm mr-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h3 className="text-sm font-bold px-2 min-w-[140px] text-center">
                  {viewMode === 'WEEKLY' 
                    ? `Week of ${days[0]?.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  }
                </h3>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant={isCurrentRangePublished ? "outline" : "default"} 
                  size="sm"
                  className={cn(
                    "h-9 px-3",
                    isCurrentRangePublished 
                      ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800" 
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  )} 
                  onClick={handlePublishSchedule}
                >
                  {isCurrentRangePublished ? (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> Published</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> Publish</>
                  )}
                </Button>

                {isCurrentRangePublished && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-9 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 text-[9px] font-black uppercase"
                    onClick={handleUnpublishSchedule}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" /> Unpublish
                  </Button>
                )}
                
                <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>
                
                <Button variant="outline" size="sm" className="h-9 border-slate-300" onClick={handleExportPDF}>
                  <Download className="h-4 w-4 mr-2" /> PDF
                </Button>
                <Button variant="outline" size="sm" className="h-9 border-slate-300" onClick={handleExportPNG}>
                  <Activity className="h-4 w-4 mr-2" /> PNG
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
            {loading ? (
              <div className="flex justify-center p-12"><p className="text-slate-500 animate-pulse">Loading roster data...</p></div>
            ) : shifts.length === 0 ? (
              <div className="p-12 text-center bg-slate-50">
                <p className="text-muted-foreground">No shifts configured for this restaurant.</p>
                <Button variant="link" className="mt-2 text-blue-600">Setup Shifts</Button>
              </div>
            ) : (
              <div id="roster-table-container" className="w-full bg-white p-4">
                <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                  <thead className="text-[10px] text-slate-700 uppercase bg-slate-50 sticky top-0 z-30">
                    <tr>
                      <th scope="col" className="px-3 py-3 border-b border-slate-100 min-w-[100px] sticky left-0 bg-slate-50 z-40">
                        Date & Weekday
                      </th>
                      {shifts.map(shift => (
                        <th key={shift.id} scope="col" className="px-2 py-3 border-b border-slate-100 min-w-[140px]">
                          <div className="font-bold text-center text-slate-900 leading-tight">{shift.name}</div>
                          <div className="text-[9px] text-slate-500 font-normal text-center mt-1 bg-white/50 rounded-sm py-0.5 border border-slate-100">
                            {shift.startTime} - {shift.endTime}
                          </div>
                          <div className="text-[8px] text-blue-600 font-semibold text-center mt-1 uppercase">
                            Required: {shift.requiredStaff}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day) => {
                      const isWeekend = day.dateObj.getDay() === 0 || day.dateObj.getDay() === 6;
                      const isToday = new Date().toISOString().split('T')[0] === day.dateString;
                      
                      return (
                        <tr 
                          key={day.dateString} 
                          className={cn(
                            "border-b transition-colors",
                            isToday ? 'bg-blue-50/40' : isWeekend ? 'bg-slate-50/50' : 'bg-white',
                            "hover:bg-slate-100/50"
                          )}
                        >
                          {/* Date Column */}
                          <td className={cn(
                            "px-3 py-2 border-b border-slate-100 font-medium sticky left-0 z-20",
                            isToday ? 'bg-blue-50 text-blue-700' : isWeekend ? 'bg-slate-50 text-red-500' : 'bg-white'
                          )}>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold">{day.dateObj.getDate()} {day.dateObj.toLocaleDateString('en-US', { month: 'short' })}</span>
                              <span className="text-[10px] text-muted-foreground uppercase font-semibold">{day.dayName}</span>
                            </div>
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
                                    className="flex justify-between items-center py-1 px-2 text-[10px] bg-slate-50 text-slate-700 shadow-none w-full mb-1 group rounded-md hover:bg-blue-50 transition-all border-none"
                                  >
                                    <span className="truncate mr-1 flex-1 font-medium">
                                      {assignment.user?.firstName} {assignment.user?.lastName}
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
