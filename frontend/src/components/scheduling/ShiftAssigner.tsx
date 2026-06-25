'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, GripVertical, X, Download, Send, CheckCircle2, Ban, Users, Activity, AlertTriangle, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { useAuthStore } from '@/store/useAuthStore';

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

interface ScheduleWarning {
  userId: string;
  date: string;
  shiftId: string;
  type: 'DOUBLE_SHIFT' | 'CONSECUTIVE_REST' | 'UNAVAILABLE' | 'UNSPECIFIED';
  message: string;
}

// DRAGGABLE STAFF COMPONENT
function DraggableStaff({ 
  staff, 
  isHighlighted, 
  onToggleHighlight 
}: { 
  staff: Staff; 
  isHighlighted: boolean; 
  onToggleHighlight: () => void; 
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `staff-${staff.id}`,
    data: { staff },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center justify-between p-2 mb-2 bg-white border rounded shadow-sm hover:border-blue-400 hover:shadow transition-all relative group",
        isDragging && 'opacity-50',
        isHighlighted ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20' : 'border-slate-200'
      )}
    >
      <div 
        {...listeners} 
        {...attributes} 
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-100 rounded mr-1 shrink-0"
        title="Drag to assign"
      >
        <GripVertical className="h-4 w-4 text-slate-400" />
      </div>

      <span className="text-sm font-medium flex-1 truncate">{staff.firstName} {staff.lastName}</span>
      
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleHighlight();
        }}
        className={cn(
          "h-7 w-7 rounded-md flex items-center justify-center border transition-all shrink-0 ml-1.5",
          isHighlighted 
            ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
            : "bg-slate-50 text-slate-400 border-slate-200 hover:text-blue-600 hover:border-blue-300"
        )}
        title={isHighlighted ? "Clear Highlight" : "Highlight shifts"}
      >
        <Activity className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// DROPPABLE CELL COMPONENT
function DroppableCell({ 
  id, 
  children, 
  isUnderstaffed,
  disabled = false,
  isHighlightedAssigned = false,
  availabilityStatus = null
}: { 
  id: string; 
  children: React.ReactNode; 
  isUnderstaffed: boolean;
  disabled?: boolean;
  isHighlightedAssigned?: boolean;
  availabilityStatus?: 'available' | 'unavailable' | null;
}) {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });

  return (
    <td
      ref={setNodeRef}
      className={cn(
        "px-2 py-2 border-r align-top relative transition-all duration-300",
        isOver 
          ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' 
          : isHighlightedAssigned
            ? 'bg-blue-50/80 ring-2 ring-blue-500 ring-inset shadow-md shadow-blue-500/10'
            : availabilityStatus === 'available'
              ? 'bg-emerald-50/40 border-emerald-300 border-2 border-dashed'
              : availabilityStatus === 'unavailable'
                ? 'bg-red-50/40 border-red-300 border-2 border-dashed'
                : isUnderstaffed && !disabled
                  ? 'bg-red-50/30' 
                  : ''
      )}
    >
      <div className="flex flex-col gap-1 min-h-[50px] w-full">
        {children}
        {isUnderstaffed && !isOver && !disabled && (
           <div className="text-[10px] text-red-400 opacity-50 italic text-center mt-1 select-none pointer-events-none">Drag staff here</div>
        )}
      </div>
    </td>
  );
}

export default function ShiftAssigner({ viewMode = 'MONTHLY' }: { viewMode?: 'WEEKLY' | 'MONTHLY' }) {
  const { user } = useAuthStore();
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  // Drag state
  const [activeStaff, setActiveStaff] = useState<Staff | null>(null);

  // Highlighting and Quick Assign Selector
  const [highlightedStaffId, setHighlightedStaffId] = useState<string | null>(null);
  const [isAssignSelectorOpen, setIsAssignSelectorOpen] = useState(false);
  const [selectorDate, setSelectorDate] = useState<string>('');
  const [selectorShift, setSelectorShift] = useState<Shift | null>(null);

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

  const handleOpenAssignSelector = (date: string, shift: Shift) => {
    setSelectorDate(date);
    setSelectorShift(shift);
    setIsAssignSelectorOpen(true);
  };

  const staffByAvailability = useMemo(() => {
    if (!selectorDate || !selectorShift) return { available: [], unspecified: [], unavailable: [] };

    const avail = availabilities.filter(
      a => a.date === selectorDate && a.shiftId === selectorShift.id
    );

    const available: Staff[] = [];
    const unspecified: Staff[] = [];
    const unavailable: Staff[] = [];

    staff.forEach(s => {
      const record = avail.find(a => a.userId === s.id);
      if (record) {
        if (record.isAvailable) {
          available.push(s);
        } else {
          unavailable.push(s);
        }
      } else {
        unspecified.push(s);
      }
    });

    return { available, unspecified, unavailable };
  }, [selectorDate, selectorShift, staff, availabilities]);

  // Compute shift warnings
  const assignmentWarnings = useMemo(() => {
    const warningsMap: Record<string, ScheduleWarning[]> = {};

    const getShiftDateTime = (dateStr: string, timeStr: string) => {
      return new Date(`${dateStr}T${timeStr}:00`);
    };

    const userAssignments: Record<string, typeof assignments> = {};
    assignments.forEach(a => {
      if (!userAssignments[a.userId]) {
        userAssignments[a.userId] = [];
      }
      userAssignments[a.userId].push(a);
    });

    Object.entries(userAssignments).forEach(([userId, userAssigns]) => {
      const enrichedAssigns = userAssigns.map(a => {
        const shift = shifts.find(s => s.id === a.shiftId);
        return {
          id: a.id,
          date: a.date,
          shiftId: a.shiftId,
          userId: a.userId,
          shift,
          startDt: shift ? getShiftDateTime(a.date, shift.startTime) : new Date(0),
          endDt: shift ? getShiftDateTime(a.date, shift.endTime) : new Date(0)
        };
      }).sort((a, b) => a.startDt.getTime() - b.startDt.getTime());

      enrichedAssigns.forEach(ea => {
        if (ea.endDt.getTime() <= ea.startDt.getTime()) {
          const nextDay = new Date(ea.endDt);
          nextDay.setDate(nextDay.getDate() + 1);
          ea.endDt = nextDay;
        }
      });

      for (let i = 0; i < enrichedAssigns.length; i++) {
        const current = enrichedAssigns[i];
        const warnings: ScheduleWarning[] = [];

        const availability = availabilities.find(
          av => av.userId === userId && av.date === current.date && av.shiftId === current.shiftId
        );

        if (availability) {
          if (!availability.isAvailable) {
            warnings.push({
              userId,
              date: current.date,
              shiftId: current.shiftId,
              type: 'UNAVAILABLE',
              message: 'Staff marked this day/shift as Unavailable.'
            });
          }
        } else {
          warnings.push({
            userId,
            date: current.date,
            shiftId: current.shiftId,
            type: 'UNSPECIFIED',
            message: 'Staff did not submit availability for this day.'
          });
        }

        if (i < enrichedAssigns.length - 1) {
          const next = enrichedAssigns[i + 1];
          const diffMs = next.startDt.getTime() - current.endDt.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);

          if (current.date === next.date) {
            const msg = `Double shift on same day (${current.shift?.name} & ${next.shift?.name}).`;
            warnings.push({
              userId,
              date: current.date,
              shiftId: current.shiftId,
              type: 'DOUBLE_SHIFT',
              message: msg
            });
            if (!warningsMap[next.id]) warningsMap[next.id] = [];
            warningsMap[next.id].push({
              userId,
              date: next.date,
              shiftId: next.shiftId,
              type: 'DOUBLE_SHIFT',
              message: msg
            });
          } else if (diffHours >= 0 && diffHours < 11) {
            const roundedHours = Math.round(diffHours * 10) / 10;
            const msg = `Short rest warning: only ${roundedHours}h off between shifts (${current.shift?.name} and tomorrow's ${next.shift?.name}).`;
            warnings.push({
              userId,
              date: current.date,
              shiftId: current.shiftId,
              type: 'CONSECUTIVE_REST',
              message: msg
            });
            if (!warningsMap[next.id]) warningsMap[next.id] = [];
            warningsMap[next.id].push({
              userId,
              date: next.date,
              shiftId: next.shiftId,
              type: 'CONSECUTIVE_REST',
              message: msg
            });
          }
        }

        if (warnings.length > 0) {
          if (!warningsMap[current.id]) {
            warningsMap[current.id] = [];
          }
          warningsMap[current.id].push(...warnings);
        }
      }
    });

    return warningsMap;
  }, [assignments, shifts, availabilities]);

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

      // Calculate dynamic width so columns are never squished
      const pageWidth = Math.max(297, 60 + (shifts.length * 55));
      const doc = new jsPDF({ orientation: 'landscape', format: [pageWidth, 210] });

      // Title
      doc.setFontSize(22);
      doc.text(`Staff Schedule - ${viewMode}`, 14, 20);
      doc.setFontSize(12);
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 28);

      // Define table columns
      const tableColumn = ["Date", ...shifts.map(s => `${s.name}\n(${s.startTime}-${s.endTime})`)];
      
      // Define table rows
      const tableRows: any[][] = [];

      days.forEach(day => {
        const rowData: any[] = [
          `${day.dayName}, ${day.formattedDate}`
        ];

        shifts.forEach(shift => {
          const shiftAssignments = assignments.filter(a => a.date === day.dateString && a.shiftId === shift.id);
          if (shiftAssignments.length === 0) {
            rowData.push('Unassigned');
          } else {
            // Passing an array to autoTable guarantees each element gets its own line
            const staffNames = shiftAssignments.map(a => {
              const user = a.user || staff.find(s => s.id === a.userId);
              return `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
            });
            rowData.push(staffNames.join('\n'));
          }
        });

        tableRows.push(rowData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        theme: 'grid',
        styles: { fontSize: 12, cellPadding: 6, minCellHeight: 14, overflow: 'linebreak' },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'center' },
        bodyStyles: { valign: 'middle' },
        columnStyles: {
          0: { cellWidth: 45, fontStyle: 'bold' }
        }
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
        {isAdminOrManager && (
          <Card className="w-full">
            <CardHeader className="pb-4 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center">
                    <Users className="h-5 w-5 mr-2 text-blue-600" />
                    Staff Pool
                  </CardTitle>
                  <CardDescription className="text-xs">Drag the grip handle to assign or click the highlight pulse icon to analyze shifts.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {highlightedStaffId && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setHighlightedStaffId(null)}
                      className="h-7 text-[9px] font-black uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700"
                    >
                      Clear Highlight
                    </Button>
                  )}
                  <Badge variant="outline" className="text-[10px] font-normal border-slate-200">
                    {staff.length} Members Available
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-6">
              <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 max-h-40">
                {staff.map(s => (
                  <div key={s.id} className="shrink-0 min-w-[180px]">
                    <DraggableStaff 
                      staff={s} 
                      isHighlighted={highlightedStaffId === s.id}
                      onToggleHighlight={() => setHighlightedStaffId(prev => prev === s.id ? null : s.id)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
                {isAdminOrManager && (
                  <>
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
                  </>
                )}
                
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
                          {isAdminOrManager && (
                            <div className="text-[8px] text-blue-600 font-semibold text-center mt-1 uppercase">
                                Required: {shift.requiredStaff}
                            </div>
                          )}
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
                            
                            const isHighlightedStaffAssigned = highlightedStaffId 
                              ? cellAssignments.some(a => a.userId === highlightedStaffId) 
                              : false;
                            
                            const highlightedAvailability = highlightedStaffId
                              ? availabilities.find(av => av.userId === highlightedStaffId && av.date === day.dateString && av.shiftId === shift.id)
                              : null;
                            const availabilityStatus = highlightedAvailability
                              ? (highlightedAvailability.isAvailable ? 'available' as const : 'unavailable' as const)
                              : null;

                            const cellAvailabilities = availabilities.filter(
                              a => a.date === day.dateString && a.shiftId === shift.id
                            );
                            const availableCount = cellAvailabilities.filter(a => a.isAvailable).length;

                            return (
                              <DroppableCell 
                                key={cellId} 
                                id={cellId} 
                                isUnderstaffed={isUnderstaffed && cellAssignments.length === 0}
                                disabled={!isAdminOrManager}
                                isHighlightedAssigned={isHighlightedStaffAssigned}
                                availabilityStatus={availabilityStatus}
                              >
                                {cellAssignments.map(assignment => {
                                  const warnings = assignmentWarnings[assignment.id] || [];
                                  const hasCritical = warnings.some(w => ['UNAVAILABLE', 'DOUBLE_SHIFT', 'CONSECUTIVE_REST'].includes(w.type));
                                  const hasUnspecified = warnings.some(w => w.type === 'UNSPECIFIED');

                                  const isHighlighted = highlightedStaffId === assignment.userId;
                                  const isDimmed = highlightedStaffId && !isHighlighted;

                                  return (
                                    <Badge 
                                      key={assignment.id} 
                                      variant="secondary" 
                                      className={cn(
                                        "flex justify-between items-center py-1 px-2 text-[10px] shadow-none w-full mb-1 group rounded-md transition-all border",
                                        isDimmed 
                                          ? "opacity-30 scale-95" 
                                          : isHighlighted 
                                            ? "bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300 shadow-md animate-pulse"
                                            : hasCritical 
                                              ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" 
                                              : hasUnspecified 
                                                ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100" 
                                                : "bg-slate-50 text-slate-700 border-slate-100 hover:bg-blue-50"
                                      )}
                                    >
                                      <span className="truncate mr-1 flex-1 font-medium flex items-center gap-1">
                                        {assignment.user?.firstName} {assignment.user?.lastName}
                                        {warnings.length > 0 && !isDimmed && (
                                          <span 
                                            title={warnings.map(w => w.message).join('\n')}
                                            className={cn(
                                              "shrink-0 w-3 h-3 flex items-center justify-center rounded-full text-[8px] font-black cursor-help",
                                              hasCritical 
                                                ? (isHighlighted ? "bg-white text-red-600" : "bg-red-500 text-white") 
                                                : (isHighlighted ? "bg-white text-amber-600" : "bg-amber-500 text-white")
                                            )}
                                          >
                                            !
                                          </span>
                                        )}
                                      </span>
                                      {isAdminOrManager && (
                                          <button 
                                            className={cn(
                                              "hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0",
                                              isHighlighted ? "text-blue-200 hover:text-white" : "text-slate-400"
                                            )}
                                            onClick={() => handleRemoveAssignment(assignment.id)}
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                      )}
                                    </Badge>
                                  );
                                })}

                                {isAdminOrManager && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAssignSelector(day.dateString, shift)}
                                    className={cn(
                                      "text-[9px] font-black uppercase tracking-wider rounded px-1.5 py-0.5 mt-1 w-full text-center flex items-center justify-center gap-1 transition-all border",
                                      availableCount > 0
                                        ? "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                        : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    )}
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                    <span>{availableCount > 0 ? `${availableCount} Avail` : "Add"}</span>
                                  </button>
                                )}
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

      {/* QUICK ASSIGN SELECTOR MODAL */}
      <Dialog open={isAssignSelectorOpen} onOpenChange={setIsAssignSelectorOpen}>
        <DialogContent className="max-w-md w-full p-0 rounded-2xl overflow-hidden border-0 bg-white shadow-2xl">
          <div className="bg-slate-900 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400 stroke-[3]" />
                Assign Staff to Shift
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs mt-1 font-bold uppercase tracking-wider">
                {selectorShift?.name} • {selectorDate} ({selectorShift?.startTime} - {selectorShift?.endTime})
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto pr-1">
            {/* 1. AVAILABLE STAFF */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-wider flex items-center gap-1.5">
                🟢 Available Staff ({staffByAvailability.available.length})
              </h4>
              {staffByAvailability.available.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic pl-3 uppercase font-bold">No staff explicitly marked available</p>
              ) : (
                <div className="space-y-1.5">
                  {staffByAvailability.available.map(s => {
                    const isAssigned = assignments.some(a => a.date === selectorDate && a.shiftId === selectorShift?.id && a.userId === s.id);
                    const others = assignments.filter(a => a.date === selectorDate && a.shiftId !== selectorShift?.id && a.userId === s.id);
                    
                    return (
                      <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800">{s.firstName} {s.lastName}</span>
                          {others.length > 0 && (
                            <span className="text-[9px] text-amber-600 font-black uppercase tracking-tight mt-1">
                              ⚠️ Works: {others.map(o => shifts.find(sh => sh.id === o.shiftId)?.name).join(', ')}
                            </span>
                          )}
                        </div>
                        {isAssigned ? (
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Assigned</span>
                        ) : (
                          <Button 
                            size="sm" 
                            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[9px] tracking-wider rounded-lg shadow-sm"
                            onClick={() => {
                              handleAssign(selectorShift!.id, s.id, selectorDate);
                              setIsAssignSelectorOpen(false);
                            }}
                          >
                            Assign
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. UNSPECIFIED AVAILABILITY */}
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <h4 className="text-[10px] font-black uppercase text-amber-600 tracking-wider flex items-center gap-1.5">
                ⚪ Unspecified / No Avail. Submitted ({staffByAvailability.unspecified.length})
              </h4>
              {staffByAvailability.unspecified.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic pl-3 uppercase font-bold">All staff accounted for</p>
              ) : (
                <div className="space-y-1.5">
                  {staffByAvailability.unspecified.map(s => {
                    const isAssigned = assignments.some(a => a.date === selectorDate && a.shiftId === selectorShift?.id && a.userId === s.id);
                    const others = assignments.filter(a => a.date === selectorDate && a.shiftId !== selectorShift?.id && a.userId === s.id);
                    
                    return (
                      <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">{s.firstName} {s.lastName}</span>
                          {others.length > 0 && (
                            <span className="text-[9px] text-amber-600 font-black uppercase tracking-tight mt-1">
                              ⚠️ Works: {others.map(o => shifts.find(sh => sh.id === o.shiftId)?.name).join(', ')}
                            </span>
                          )}
                        </div>
                        {isAssigned ? (
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Assigned</span>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="h-8 border-amber-200 bg-amber-50/30 text-amber-700 hover:bg-amber-100 font-black uppercase text-[9px] tracking-wider rounded-lg shadow-none"
                            onClick={() => {
                              handleAssign(selectorShift!.id, s.id, selectorDate);
                              setIsAssignSelectorOpen(false);
                            }}
                          >
                            Assign
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. EXPLICITLY UNAVAILABLE */}
            <div className="space-y-2 pt-4 border-t border-slate-100">
              <h4 className="text-[10px] font-black uppercase text-red-600 tracking-wider flex items-center gap-1.5">
                🔴 Explicitly Unavailable ({staffByAvailability.unavailable.length})
              </h4>
              {staffByAvailability.unavailable.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic pl-3 uppercase font-bold">No unavailable requests</p>
              ) : (
                <div className="space-y-1.5">
                  {staffByAvailability.unavailable.map(s => {
                    const isAssigned = assignments.some(a => a.date === selectorDate && a.shiftId === selectorShift?.id && a.userId === s.id);
                    const others = assignments.filter(a => a.date === selectorDate && a.shiftId !== selectorShift?.id && a.userId === s.id);
                    const availRecord = availabilities.find(a => a.date === selectorDate && a.shiftId === selectorShift?.id && a.userId === s.id);
                    
                    return (
                      <div key={s.id} className="flex items-center justify-between p-2.5 rounded-xl border border-red-100 bg-red-50/10 hover:bg-red-50/30">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-red-950">{s.firstName} {s.lastName}</span>
                          {availRecord?.notes && (
                            <span className="text-[10px] text-red-500 font-medium italic mt-1 bg-red-50 px-2 py-0.5 rounded border border-red-100 self-start">
                              Reason: "{availRecord.notes}"
                            </span>
                          )}
                          {others.length > 0 && (
                            <span className="text-[9px] text-amber-600 font-black uppercase tracking-tight mt-1">
                              ⚠️ Works: {others.map(o => shifts.find(sh => sh.id === o.shiftId)?.name).join(', ')}
                            </span>
                          )}
                        </div>
                        {isAssigned ? (
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Assigned</span>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            className="h-8 bg-red-600 hover:bg-red-700 font-black uppercase text-[9px] tracking-wider rounded-lg shadow-sm"
                            onClick={() => {
                              if (confirm(`Warning: ${s.firstName} marked themselves as UNAVAILABLE for this shift. Do you still want to assign them?`)) {
                                handleAssign(selectorShift!.id, s.id, selectorDate);
                                setIsAssignSelectorOpen(false);
                              }
                            }}
                          >
                            Force
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsAssignSelectorOpen(false)}
              className="h-12 w-full text-slate-500 font-black uppercase text-[10px] tracking-wider rounded-xl border-slate-200 bg-white"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}
