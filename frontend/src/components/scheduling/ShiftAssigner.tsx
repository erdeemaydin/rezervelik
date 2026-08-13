'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, GripVertical, X, Download, Send, CheckCircle2, Ban, Users, Activity, AlertTriangle, Plus, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { useFormatStore } from '@/store/useFormatStore';
import { formatDate, formatTimeRange } from '@/lib/format';
import { computeWorked, formatHM, workedTone } from '@/lib/workedHours';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useTranslation } from '@/i18n/provider';

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

interface TimeEntry {
  id: string;
  userId: string;
  date: string;
  shiftId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number;
}

const entryKey = (userId: string, date: string, shiftId: string | null) => `${userId}|${date}|${shiftId || ''}`;

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
  onToggleHighlight,
  shiftCount = 0,
  workedLabel
}: {
  staff: Staff;
  isHighlighted: boolean;
  onToggleHighlight: () => void;
  shiftCount?: number;
  workedLabel?: string;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `staff-${staff.id}`,
    data: { staff },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center justify-between p-1.5 bg-white border rounded-md shadow-sm hover:border-blue-400 hover:shadow transition-all relative group",
        isDragging && 'opacity-50',
        isHighlighted ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20' : 'border-slate-200'
      )}
    >
      <div
        {...listeners}
        {...attributes}
        className="cursor-grab active:cursor-grabbing p-0.5 hover:bg-slate-100 rounded mr-0.5 shrink-0"
        title={t('scheduling.assigner.dragToAssign')}
      >
        <GripVertical className="h-3.5 w-3.5 text-slate-400" />
      </div>

      <span className="text-xs font-semibold flex-1 truncate">{staff.firstName} {staff.lastName}</span>

      {workedLabel && (
        <span
          className="h-6 px-1 rounded flex items-center justify-center border border-emerald-200 bg-emerald-50 text-emerald-700 text-[9px] font-black tabular-nums shrink-0 ml-1"
          title={t('scheduling.assigner.hoursCredited')}
        >
          {workedLabel}
        </span>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleHighlight();
        }}
        className={cn(
          "h-6 min-w-6 px-1 rounded flex items-center justify-center gap-0.5 border transition-all shrink-0 ml-1 text-[11px] font-black tabular-nums",
          isHighlighted
            ? "bg-blue-600 text-white border-blue-600 shadow-sm"
            : shiftCount > 0
              ? "bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-400"
              : "bg-slate-50 text-slate-400 border-slate-200 hover:text-blue-600 hover:border-blue-300"
        )}
        // Same behavior as before: toggles highlighting this staff's shifts.
        // The icon is replaced by the live count of shifts they have in this plan (#6).
        title={isHighlighted ? t('scheduling.assigner.clearHighlight') : t('scheduling.assigner.highlightShifts')}
      >
        <CalendarCheck className="h-3.5 w-3.5" />
        {shiftCount}
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
  const { t } = useTranslation();
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
           <div className="text-[10px] text-red-400 opacity-50 italic text-center mt-1 select-none pointer-events-none">{t('scheduling.assigner.dragStaffHere')}</div>
        )}
      </div>
    </td>
  );
}

export default function ShiftAssigner({ viewMode = 'MONTHLY' }: { viewMode?: 'WEEKLY' | 'MONTHLY' }) {
  const { user } = useAuthStore();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const confirm = useConfirm();
  // Read the platform date/time convention as a stable primitive so memoized
  // day/label builders don't churn every render.
  const system = useFormatStore(s => s.system);
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [availabilities, setAvailabilities] = useState<EmployeeAvailability[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [defaultBreak, setDefaultBreak] = useState(0);
  const [loading, setLoading] = useState(false);

  // Drag state
  const [activeStaff, setActiveStaff] = useState<Staff | null>(null);

  // Highlighting and Quick Assign Selector Popover
  const [highlightedStaffId, setHighlightedStaffId] = useState<string | null>(null);
  const [openPopoverCellId, setOpenPopoverCellId] = useState<string | null>(null);

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
          dayName: curr.toLocaleDateString(dateLocale, { weekday: 'short' }),
          formattedDate: formatDate(curr, system)
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
        dayName: d.toLocaleDateString(dateLocale, { weekday: 'short' }),
        formattedDate: formatDate(d, system)
      };
    });
  }, [viewMode, system, dateLocale]);

  const days = useMemo(() => getMonthDates(currentDate), [currentDate, getMonthDates]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = days[0].dateString;
      const endDate = days[days.length - 1].dateString;

      // Pull actual worked-time entries (all staff for managers) + the restaurant's
      // default break so each assignment can show real/credited hours (#integration).
      const entriesUrl = isAdminOrManager
        ? `/time-entries?from=${startDate}&to=${endDate}&all=1`
        : `/time-entries?from=${startDate}&to=${endDate}`;
      const [shiftsData, availData, assignData, staffRes, entriesRes, settingsRes] = await Promise.all([
        getShifts(),
        getAvailabilities({ startDate, endDate }),
        getAssignments({ startDate, endDate }),
        api.get('/staff'),
        api.get(entriesUrl),
        api.get('/settings')
      ]);

      setShifts(shiftsData);
      setAvailabilities(availData);
      setAssignments(assignData);
      setStaff(staffRes.data.data || []);
      setTimeEntries(entriesRes.data.data || []);
      setDefaultBreak(settingsRes.data.data?.defaultBreakMinutes ?? 0);
    } catch (error) {
      toast.error(t('scheduling.assigner.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [days, isAdminOrManager]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAssign = async (shiftId: string, userId: string, date: string, force: boolean = false) => {
    // Prevent duplicate assignment in the UI first
    if (assignments.some(a => a.shiftId === shiftId && a.userId === userId && a.date === date)) {
      toast.warning(t('scheduling.assigner.alreadyAssigned'));
      return;
    }

    try {
      const newAssignment = await assignShift({ shiftId, userId, date, force });
      toast.success(t('scheduling.assigner.assigned'));
      setAssignments(prev => [...prev, { ...newAssignment, user: staff.find(s => s.id === userId) }]);
    } catch (error: any) {
      // The server now authoritatively enforces DOUBLE_SHIFT/CONSECUTIVE_REST/
      // UNAVAILABLE (previously these were only ever computed client-side for
      // display). Offer the same "assign anyway" override the UI already offers
      // for the unavailable-staff case, driven by what the server actually found.
      const violations = error.response?.data?.details?.violations as { type: string; message: string }[] | undefined;
      if (error.response?.status === 409 && violations?.length && !force) {
        const staffMember = staff.find(s => s.id === userId);
        const ok = await confirm({
          title: t('scheduling.assigner.forceTitle'),
          description: violations.map(v => v.message).join(' '),
          tone: 'danger',
          confirmText: t('scheduling.assigner.forceConfirm'),
        });
        if (ok) {
          await handleAssign(shiftId, userId, date, true);
        }
        return;
      }
      toast.error(error.response?.data?.message || t('scheduling.assigner.assignFailed'));
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    try {
      await removeAssignment(id);
      toast.success(t('scheduling.assigner.assignmentRemoved'));
      setAssignments(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      toast.error(t('scheduling.assigner.removeFailed'));
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

  // Dialog selection removed. Availability popover triggers inline.

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
              message: t('scheduling.assigner.warnUnavailable')
            });
          }
        } else {
          warnings.push({
            userId,
            date: current.date,
            shiftId: current.shiftId,
            type: 'UNSPECIFIED',
            message: t('scheduling.assigner.warnUnspecified')
          });
        }

        if (i < enrichedAssigns.length - 1) {
          const next = enrichedAssigns[i + 1];
          const diffMs = next.startDt.getTime() - current.endDt.getTime();
          const diffHours = diffMs / (1000 * 60 * 60);

          if (current.date === next.date) {
            const msg = `${t('scheduling.assigner.warnDoubleShift')} (${current.shift?.name} & ${next.shift?.name}).`;
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
            const msg = `${t('scheduling.assigner.warnConsecutiveRestPrefix')} ${roundedHours}${t('scheduling.assigner.warnConsecutiveRestSuffix')} (${current.shift?.name} ${t('scheduling.assigner.warnConsecutiveRestAnd')} ${next.shift?.name}).`;
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
  }, [assignments, shifts, availabilities, t]);

  // Number of shifts each staff member has in the currently-displayed plan range,
  // shown live on their card (#6).
  const shiftCountByStaff = useMemo(() => {
    const counts: Record<string, number> = {};
    const inRange = new Set(days.map(d => d.dateString));
    assignments.forEach(a => {
      if (inRange.has(a.date)) counts[a.userId] = (counts[a.userId] || 0) + 1;
    });
    return counts;
  }, [assignments, days]);

  // Actual worked-time entries indexed by user|date|shift for O(1) lookup.
  const entryMap = useMemo(() => {
    const m = new Map<string, TimeEntry>();
    for (const e of timeEntries) m.set(entryKey(e.userId, e.date, e.shiftId), e);
    return m;
  }, [timeEntries]);

  // Worked time for one assignment: real check-in/out if entered, otherwise the
  // scheduled shift length minus the default break (#schedule-timesheet integration).
  const workedForAssignment = useCallback((a: ShiftAssignment) => {
    const sh = a.shift || shifts.find(s => s.id === a.shiftId);
    if (!sh) return { minutes: 0, scheduledMinutes: 0, source: 'SCHEDULED' as const };
    const entry = entryMap.get(entryKey(a.userId, a.date, a.shiftId));
    return computeWorked(sh.startTime, sh.endTime, entry, defaultBreak);
  }, [entryMap, shifts, defaultBreak]);

  // Total credited minutes per day and per staff member across the visible range.
  const dayTotalMinutes = useCallback((dateString: string) =>
    assignments.filter(a => a.date === dateString).reduce((sum, a) => sum + workedForAssignment(a).minutes, 0),
    [assignments, workedForAssignment]);

  const workedMinutesByStaff = useMemo(() => {
    const totals: Record<string, number> = {};
    const inRange = new Set(days.map(d => d.dateString));
    assignments.forEach(a => {
      if (inRange.has(a.date)) totals[a.userId] = (totals[a.userId] || 0) + workedForAssignment(a).minutes;
    });
    return totals;
  }, [assignments, days, workedForAssignment]);

  const isCurrentRangePublished = useMemo(() => {
    if (assignments.length === 0) return false;
    const rangeAssignments = assignments.filter(a => days.some(d => d.dateString === a.date));
    if (rangeAssignments.length === 0) return false;
    return rangeAssignments.every(a => a.isPublished);
  }, [assignments, days]);

  const handlePublishSchedule = async () => {
    if (isCurrentRangePublished) {
      toast.info(t('scheduling.assigner.alreadyPublished'));
      return;
    }

    const startDate = days[0].dateString;
    const endDate = days[days.length - 1].dateString;
    const staffWithShifts = new Set(
      assignments.filter(a => days.some(d => d.dateString === a.date)).map(a => a.userId)
    ).size;

    // Confirmation popup before publishing (#7.3).
    const ok = await confirm({
      title: t('scheduling.assigner.publishConfirmTitle'),
      description: t('scheduling.assigner.publishConfirmDesc'),
      details: [
        { label: t('scheduling.assigner.period'), value: startDate === endDate ? startDate : `${startDate} – ${endDate}` },
        { label: t('scheduling.assigner.staffToNotify'), value: `${staffWithShifts}` },
      ],
      confirmText: t('scheduling.assigner.publish'),
    });
    if (!ok) return;

    try {
      const res: any = await publishAssignments({ startDate, endDate });

      // Update local state to reflect published status for the current range
      setAssignments(prev => prev.map(a => {
        if (days.some(d => d.dateString === a.date)) {
           return { ...a, isPublished: true };
        }
        return a;
      }));
      const mins = res?.data?.whatsappDelayMinutes ?? res?.whatsappDelayMinutes ?? 5;
      // Inform the admin about the delayed WhatsApp send (#7.4).
      toast.success(`${t('scheduling.assigner.publishedPrefix')} ${mins} ${t('scheduling.assigner.publishedSuffix')}`);
    } catch (error) {
      console.error(error);
      toast.error(t('scheduling.assigner.publishFailed'));
    }
  };

  const handleUnpublishSchedule = async () => {
    if (!isCurrentRangePublished) return;

    try {
      const startDate = days[0].dateString;
      const endDate = days[days.length - 1].dateString;
      
      toast.info(t('scheduling.assigner.unpublishing'));
      await unpublishAssignments({ startDate, endDate });
      
      // Update local state
      setAssignments(prev => prev.map(a => {
        if (days.some(d => d.dateString === a.date)) {
           return { ...a, isPublished: false };
        }
        return a;
      }));
      toast.success(t('scheduling.assigner.unpublished'));
    } catch (error) {
      console.error(error);
      toast.error(t('scheduling.assigner.unpublishFailed'));
    }
  };

  const handleExportPDF = async () => {
    try {
      toast.info(t('scheduling.assigner.generatingPdf'));

      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      // Calculate dynamic width so columns are never squished
      const pageWidth = Math.max(297, 60 + (shifts.length * 55));
      const doc = new jsPDF({ orientation: 'landscape', format: [pageWidth, 210] });

      // Title
      doc.setFontSize(22);
      doc.text(`${t('scheduling.assigner.pdfTitle')} - ${viewMode}`, 14, 20);
      doc.setFontSize(12);
      doc.text(`${t('scheduling.assigner.generatedOn')}: ${formatDate(new Date(), system)}`, 14, 28);

      // Define table columns
      const tableColumn = [t('scheduling.assigner.colDate'), ...shifts.map(s => `${s.name}\n(${formatTimeRange(s.startTime, s.endTime, system)})`)];
      
      // Define table rows
      const tableRows: any[][] = [];

      days.forEach(day => {
        const rowData: any[] = [
          `${day.dayName}, ${day.formattedDate}`
        ];

        shifts.forEach(shift => {
          const shiftAssignments = assignments.filter(a => a.date === day.dateString && a.shiftId === shift.id);
          if (shiftAssignments.length === 0) {
            rowData.push(t('scheduling.assigner.unassigned'));
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
      toast.success(t('scheduling.assigner.pdfExported'));
    } catch (error) {
      console.error('PDF Export Error:', error);
      toast.error(t('scheduling.assigner.pdfFailed'));
    }
  };

  const handleExportPNG = async () => {
    const input = document.getElementById('roster-table-container');
    if (!input) return;

    try {
      toast.info(t('scheduling.assigner.generatingPng'));
      
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
      
      toast.success(t('scheduling.assigner.pngExported'));
    } catch (error) {
      console.error('PNG Export Error:', error);
      toast.error(t('scheduling.assigner.pngFailed'));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-3 w-full max-w-[95vw] mx-auto">

        {/* DRAGGABLE STAFF SECTION — compact single strip (no big header/titles) */}
        {isAdminOrManager && (
          <Card className="w-full">
            <CardContent className="p-2.5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-600">
                  <Users className="h-4 w-4 text-blue-600" />
                  {t('scheduling.assigner.staffPool')}
                  <span className="text-slate-400 font-bold normal-case">· {staff.length}</span>
                </div>
                {highlightedStaffId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setHighlightedStaffId(null)}
                    className="h-6 text-[9px] font-black uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700"
                  >
                    {t('scheduling.assigner.clearHighlight')}
                  </Button>
                )}
              </div>
              <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1 hide-scrollbar">
                {staff.map(s => (
                  <div key={s.id} className="shrink-0 w-[150px]">
                    <DraggableStaff
                      staff={s}
                      isHighlighted={highlightedStaffId === s.id}
                      onToggleHighlight={() => setHighlightedStaffId(prev => prev === s.id ? null : s.id)}
                      shiftCount={shiftCountByStaff[s.id] || 0}
                      workedLabel={workedMinutesByStaff[s.id] ? formatHM(workedMinutesByStaff[s.id]) : undefined}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* MAIN ROSTER GRID */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="flex flex-col lg:flex-row items-start lg:items-center justify-between p-3 gap-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <CardTitle className="text-base">{t('scheduling.assigner.scheduleBuilder')}</CardTitle>
              <CardDescription className="hidden md:block text-xs">{t('scheduling.assigner.scheduleBuilderDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-white border rounded-md p-1 shadow-sm mr-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h3 className="text-sm font-bold px-2 min-w-[140px] text-center">
                  {viewMode === 'WEEKLY'
                    ? `${t('scheduling.mySchedule.weekOf')} ${days[0]?.dateObj.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}`
                    : currentDate.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })
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
                        <><CheckCircle2 className="h-4 w-4 mr-2" /> {t('scheduling.assigner.published')}</>
                      ) : (
                        <><Send className="h-4 w-4 mr-2" /> {t('scheduling.assigner.publish')}</>
                      )}
                    </Button>

                    {isCurrentRangePublished && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-9 px-2 text-red-600 hover:bg-red-50 hover:text-red-700 text-[9px] font-black uppercase"
                        onClick={handleUnpublishSchedule}
                      >
                        <Ban className="h-3.5 w-3.5 mr-1" /> {t('scheduling.assigner.unpublish')}
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
              <div className="flex justify-center p-12"><p className="text-slate-500 animate-pulse">{t('scheduling.assigner.loadingRoster')}</p></div>
            ) : shifts.length === 0 ? (
              <div className="p-12 text-center bg-slate-50">
                <p className="text-muted-foreground">{t('scheduling.assigner.noShiftsConfigured')}</p>
                <Button variant="link" className="mt-2 text-blue-600">{t('scheduling.assigner.setupShifts')}</Button>
              </div>
            ) : (
              <div id="roster-table-container" className="w-full bg-white p-4">
                <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                  <thead className="text-[10px] text-slate-700 uppercase bg-slate-50 sticky top-0 z-30">
                    <tr>
                      <th scope="col" className="px-3 py-3 border-b border-slate-100 min-w-[100px] sticky left-0 bg-slate-50 z-40">
                        {t('scheduling.assigner.dateWeekday')}
                      </th>
                      {shifts.map(shift => (
                        <th key={shift.id} scope="col" className="px-2 py-3 border-b border-slate-100 min-w-[140px]">
                          <div className="font-bold text-center text-slate-900 leading-tight">{shift.name}</div>
                          <div className="text-[9px] text-slate-500 font-normal text-center mt-1 bg-white/50 rounded-sm py-0.5 border border-slate-100">
                            {formatTimeRange(shift.startTime, shift.endTime, system)}
                          </div>

                        </th>
                      ))}
                      {isAdminOrManager && (
                        <th scope="col" className="px-3 py-3 border-b border-slate-100 min-w-[70px] text-right bg-slate-50">
                          <div className="font-bold text-slate-900">{t('scheduling.assigner.total')}</div>
                          <div className="text-[9px] text-slate-400 font-normal mt-1">h:mm</div>
                        </th>
                      )}
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
                              <span className="text-sm font-bold">{day.dateObj.getDate()} {day.dateObj.toLocaleDateString(dateLocale, { month: 'short' })}</span>
                              <span className="text-[10px] text-muted-foreground uppercase font-semibold">{day.dayName}</span>
                            </div>
                          </td>

                          {/* Shift Columns (Droppable Areas) */}
                          {shifts.map(shift => {
                            const cellAssignments = getCellAssignments(day.dateString, shift.id);
                            const requiredForDay = shift.dayRequirements?.find(r => r.dayOfWeek === day.dateObj.getDay())?.requiredStaff || 0;
                            const isUnderstaffed = cellAssignments.length < requiredForDay;
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
                                {isAdminOrManager && (
                                  <div className="flex justify-between items-center text-[10px] text-slate-500 font-semibold mb-1 w-full uppercase">
                                    <span>{t('scheduling.assigner.assignedCount')}: {cellAssignments.length}</span>
                                    <span className={cn(isUnderstaffed ? "text-red-500" : "text-emerald-500")}>
                                      {t('scheduling.assigner.req')}: {requiredForDay}
                                    </span>
                                  </div>
                                )}
                                {cellAssignments.map(assignment => {
                                  const warnings = assignmentWarnings[assignment.id] || [];
                                  const hasCritical = warnings.some(w => ['UNAVAILABLE', 'DOUBLE_SHIFT', 'CONSECUTIVE_REST'].includes(w.type));
                                  const hasUnspecified = warnings.some(w => w.type === 'UNSPECIFIED');
                                  const tooltipWarnings = warnings.filter(w => w.type !== 'UNSPECIFIED');

                                  const isHighlighted = highlightedStaffId === assignment.userId;
                                  const isDimmed = highlightedStaffId && !isHighlighted;

                                  // Credited worked time for this assignment (real entry or scheduled).
                                  const worked = workedForAssignment(assignment);
                                  const wTone = worked.source === 'ENTRY' ? workedTone(worked.minutes, worked.scheduledMinutes) : 'ok';

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
                                        {tooltipWarnings.length > 0 && !isDimmed && (
                                          <span 
                                            title={tooltipWarnings.map(w => w.message).join('\n')}
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
                                      <span
                                        className={cn(
                                          "shrink-0 tabular-nums font-black text-[10px] mr-1",
                                          isHighlighted
                                            ? "text-white"
                                            : wTone === 'over'
                                              ? "text-red-600"
                                              : wTone === 'under'
                                                ? "text-amber-600"
                                                : worked.source === 'ENTRY'
                                                  ? "text-emerald-600"
                                                  : "text-slate-400"
                                        )}
                                        title={worked.source === 'ENTRY' ? t('scheduling.assigner.fromActual') : t('scheduling.assigner.fromScheduled')}
                                      >
                                        {formatHM(worked.minutes)}
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

                                {isAdminOrManager && (() => {
                                  // Compute inline availability for this cell
                                  const available: Staff[] = [];
                                  const unspecified: Staff[] = [];
                                  const unavailable: Staff[] = [];

                                  staff.forEach(s => {
                                    const record = cellAvailabilities.find(a => a.userId === s.id);
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

                                  return (
                                    <Popover 
                                      open={openPopoverCellId === cellId} 
                                      onOpenChange={(open) => setOpenPopoverCellId(open ? cellId : null)}
                                    >
                                       <PopoverTrigger
                                         className={cn(
                                           "text-[9px] font-black uppercase tracking-wider rounded px-1.5 py-0.5 mt-1 w-full text-center flex items-center justify-center gap-1 transition-all border cursor-pointer",
                                           availableCount > 0
                                             ? "bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100"
                                             : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                         )}
                                       >
                                         <Plus className="w-2.5 h-2.5" />
                                         <span>{availableCount > 0 ? `${availableCount} ${t('scheduling.assigner.avail')}` : t('scheduling.assigner.add')}</span>
                                       </PopoverTrigger>
                                      <PopoverContent className="w-64 p-0 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden z-50">
                                        <div className="bg-slate-900 p-3 text-white">
                                          <div className="text-xs font-black uppercase tracking-wider">
                                            {t('scheduling.assigner.assignStaff')}
                                          </div>
                                          <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                            {shift.name} • {day.dateString}
                                          </div>
                                        </div>
                                        
                                        <div className="p-3 space-y-4 max-h-[300px] overflow-y-auto">
                                          {/* 1. AVAILABLE STAFF */}
                                          <div className="space-y-1">
                                            <h4 className="text-[9px] font-black uppercase text-emerald-600 tracking-wider">
                                              🟢 {t('scheduling.assigner.available')} ({available.length})
                                            </h4>
                                            {available.length === 0 ? (
                                              <p className="text-[9px] text-slate-400 italic pl-1 uppercase font-bold">{t('scheduling.assigner.noneAvailable')}</p>
                                            ) : (
                                              <div className="space-y-1">
                                                {available.map(s => {
                                                  const isAssigned = assignments.some(a => a.date === day.dateString && a.shiftId === shift.id && a.userId === s.id);
                                                  const others = assignments.filter(a => a.date === day.dateString && a.shiftId !== shift.id && a.userId === s.id);
                                                  
                                                  return (
                                                    <div key={s.id} className="flex items-center justify-between p-1.5 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 gap-2">
                                                      <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="text-[10px] font-bold text-slate-800 truncate">{s.firstName} {s.lastName}</span>
                                                        {others.length > 0 && (
                                                          <span className="text-[8px] text-amber-600 font-black uppercase tracking-tight truncate mt-0.5">
                                                            {t('scheduling.assigner.worksOtherShift')}
                                                          </span>
                                                        )}
                                                      </div>
                                                      {isAssigned ? (
                                                        <span className="text-[8px] font-black uppercase text-slate-400 shrink-0">{t('scheduling.assigner.assignedTag')}</span>
                                                      ) : (
                                                        <Button 
                                                          size="sm" 
                                                          className="h-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[8px] px-2 rounded shrink-0"
                                                          onClick={() => {
                                                            handleAssign(shift.id, s.id, day.dateString);
                                                            setOpenPopoverCellId(null);
                                                          }}
                                                        >
                                                          {t('scheduling.assigner.add')}
                                                        </Button>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>

                                          {/* 2. OTHER STAFF (NO EXPLICIT AVAILABILITY) */}
                                          <div className="space-y-1 pt-2 border-t border-slate-100">
                                            <h4 className="text-[9px] font-black uppercase text-slate-600 tracking-wider">
                                              ⚪ {t('scheduling.assigner.otherStaff')} ({unspecified.length})
                                            </h4>
                                            {unspecified.length === 0 ? (
                                              <p className="text-[9px] text-slate-400 italic pl-1 uppercase font-bold">{t('scheduling.assigner.allAccounted')}</p>
                                            ) : (
                                              <div className="space-y-1">
                                                {unspecified.map(s => {
                                                  const isAssigned = assignments.some(a => a.date === day.dateString && a.shiftId === shift.id && a.userId === s.id);
                                                  const others = assignments.filter(a => a.date === day.dateString && a.shiftId !== shift.id && a.userId === s.id);
                                                  
                                                  return (
                                                    <div key={s.id} className="flex items-center justify-between p-1.5 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 gap-2">
                                                      <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="text-[10px] font-bold text-slate-700 truncate">{s.firstName} {s.lastName}</span>
                                                        {others.length > 0 && (
                                                          <span className="text-[8px] text-amber-600 font-black uppercase tracking-tight truncate mt-0.5">
                                                            {t('scheduling.assigner.worksOtherShift')}
                                                          </span>
                                                        )}
                                                      </div>
                                                      {isAssigned ? (
                                                        <span className="text-[8px] font-black uppercase text-slate-400 shrink-0">{t('scheduling.assigner.assignedTag')}</span>
                                                      ) : (
                                                        <Button 
                                                          size="sm" 
                                                          variant="outline"
                                                          className="h-6 border-amber-200 bg-amber-50/30 text-amber-700 hover:bg-amber-100 font-black uppercase text-[8px] px-2 rounded shrink-0"
                                                          onClick={() => {
                                                            handleAssign(shift.id, s.id, day.dateString);
                                                            setOpenPopoverCellId(null);
                                                          }}
                                                        >
                                                          {t('scheduling.assigner.add')}
                                                        </Button>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>

                                          {/* 3. EXPLICITLY UNAVAILABLE */}
                                          <div className="space-y-1 pt-2 border-t border-slate-100">
                                            <h4 className="text-[9px] font-black uppercase text-red-600 tracking-wider">
                                              🔴 {t('scheduling.assigner.unavailable')} ({unavailable.length})
                                            </h4>
                                            {unavailable.length === 0 ? (
                                              <p className="text-[9px] text-slate-400 italic pl-1 uppercase font-bold">{t('scheduling.assigner.noUnavailable')}</p>
                                            ) : (
                                              <div className="space-y-1">
                                                {unavailable.map(s => {
                                                  const isAssigned = assignments.some(a => a.date === day.dateString && a.shiftId === shift.id && a.userId === s.id);
                                                  const others = assignments.filter(a => a.date === day.dateString && a.shiftId !== shift.id && a.userId === s.id);
                                                  const availRecord = cellAvailabilities.find(a => a.userId === s.id);
                                                  
                                                  return (
                                                    <div key={s.id} className="flex flex-col p-1.5 rounded-lg border border-red-100 bg-red-50/10 hover:bg-red-50/30 gap-1">
                                                      <div className="flex items-center justify-between gap-2 w-full">
                                                        <span className="text-[10px] font-bold text-red-955 truncate flex-1">{s.firstName} {s.lastName}</span>
                                                        {isAssigned ? (
                                                          <span className="text-[8px] font-black uppercase text-slate-400 shrink-0">{t('scheduling.assigner.assignedTag')}</span>
                                                        ) : (
                                                          <Button 
                                                            size="sm" 
                                                            variant="destructive"
                                                            className="h-6 bg-red-600 hover:bg-red-700 font-black uppercase text-[8px] px-1.5 rounded shrink-0"
                                                            onClick={async () => {
                                                              const ok = await confirm({
                                                                title: t('scheduling.assigner.forceTitle'),
                                                                description: `${s.firstName} ${t('scheduling.assigner.forceDesc')}`,
                                                                tone: 'danger',
                                                                confirmText: t('scheduling.assigner.forceConfirm'),
                                                              });
                                                              if (ok) {
                                                                handleAssign(shift.id, s.id, day.dateString, true);
                                                                setOpenPopoverCellId(null);
                                                              }
                                                            }}
                                                          >
                                                            {t('scheduling.assigner.force')}
                                                          </Button>
                                                        )}
                                                      </div>
                                                      {availRecord?.notes && (
                                                        <span className="text-[8px] text-red-500 font-medium italic mt-0.5 block bg-red-50/50 p-1 rounded border border-red-100/50 truncate" title={availRecord.notes}>
                                                          "{availRecord.notes}"
                                                        </span>
                                                      )}
                                                      {others.length > 0 && (
                                                        <span className="text-[8px] text-amber-600 font-black uppercase tracking-tight truncate">
                                                          ⚠️ {t('scheduling.assigner.worksOtherShift')}
                                                        </span>
                                                      )}
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  );
                                })()}
                              </DroppableCell>
                            );
                          })}
                          {isAdminOrManager && (() => {
                            const total = dayTotalMinutes(day.dateString);
                            return (
                              <td className={cn(
                                "px-3 py-2 border-b border-slate-100 text-right align-top font-black tabular-nums",
                                isToday ? 'bg-blue-50/40' : isWeekend ? 'bg-slate-50/50' : 'bg-white'
                              )}>
                                {total > 0 ? <span className="text-slate-900">{formatHM(total)}</span> : <span className="text-slate-300">—</span>}
                              </td>
                            );
                          })()}
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

      {/* Availability popovers render inline next to triggers */}
    </DndContext>
  );
}
