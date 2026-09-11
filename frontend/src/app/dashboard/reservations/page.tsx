'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Check, X, Clock, Search, Edit2, Trash2,
  Star, MessageSquare, RotateCcw, Calendar as CalendarIcon,
  Timer, CheckCircle2, ListFilter, CalendarDays, ChevronLeft, ChevronRight, Info,
  AlertTriangle
} from 'lucide-react';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from "@/i18n/provider";
import { useTerms } from "@/hooks/useTerms";
import { useConfirm } from '@/components/ui/confirm-dialog';
import { statusStyle } from '@/lib/reservationStatus';
import { StatusDots } from '@/components/dashboard/StatusDots';

interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  startTime: string;
  endTime?: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'AWAITING_PAYMENT';
  table: { id: string, identifier: string, capacity?: number } | null;
  category: { id: string, name: string } | null;
  notes: string | null;
  internalNote: string | null;
  isVIP: boolean;
  phoneHistory?: { totalVisits: number; noShowCount: number };
}

// Time/date helpers — always render 24h and compare against the *local* calendar
// day, not the UTC ISO prefix (which shifts the day boundary in +/- UTC zones).
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function ReservationsPage() {
  const { t } = useTranslation();
  const { term, businessType } = useTerms();
  const isRestaurant = businessType === 'RESTAURANT';
  const confirm = useConfirm();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('upcoming');
  const [timeFilter, setTimeFilter] = useState('today');
  const [customDate, setCustomFilterDate] = useState('');
  // Interval (from–to) date range picker.
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Clickable overview filter (status) + column sorting for the table tabs.
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'time' | 'guest' | 'table'>('time');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  // Reservation Database (history tab) status scope: all / active / deactive.
  const [dbFilter, setDbFilter] = useState<'all' | 'active' | 'deactive'>('all');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerName: '', customerPhone: '', guestCount: '2',
    tableId: 'none', categoryId: 'none', notes: '',
    internalNote: '', isVIP: false
  });

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('19:00');

  const filterDateRef = useRef<HTMLInputElement>(null);

  // Timeline tab
  const todayLocalDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [timelineDate, setTimelineDate] = useState(todayLocalDate());
  // Zone/section filter for the timeline (default: all zones).
  const [timelineZoneId, setTimelineZoneId] = useState<string>('all');
  // Configurable displayed time window for the timeline (persisted per browser).
  const [timelineStartHour, setTimelineStartHour] = useState(9);
  const [timelineEndHour, setTimelineEndHour] = useState(24);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('timelineHours') || 'null');
      if (saved && typeof saved.start === 'number' && typeof saved.end === 'number') {
        setTimelineStartHour(saved.start);
        setTimelineEndHour(saved.end);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('timelineHours', JSON.stringify({ start: timelineStartHour, end: timelineEndHour })); } catch {}
  }, [timelineStartHour, timelineEndHour]);
  // Distinct zones present among the loaded tables, for the timeline zone filter.
  const timelineZones = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const tb of tables) {
      if (tb.tableType?.id && !seen.has(tb.tableType.id)) {
        seen.set(tb.tableType.id, { id: tb.tableType.id, name: tb.tableType.name });
      }
    }
    return Array.from(seen.values());
  }, [tables]);
  // Rows shown on the timeline, narrowed to the selected zone (default: all).
  const timelineTables = useMemo(
    () => (timelineZoneId === 'all' ? tables : tables.filter(tb => tb.tableTypeId === timelineZoneId)),
    [tables, timelineZoneId]
  );
  const timelineDateRef = useRef<HTMLInputElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const shiftTimelineDate = (days: number) => {
    const d = new Date(`${timelineDate}T00:00:00`);
    d.setDate(d.getDate() + days);
    setTimelineDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  };
  const scrollTimelineToNow = (smooth = false) => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const nowCol = el.querySelector('[data-now-marker="true"]') as HTMLElement | null;
    if (nowCol) {
      el.scrollTo({ left: Math.max(0, nowCol.offsetLeft - 160), behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  useEffect(() => {
    if (activeTab === 'timeline') {
      // Always land on the current time period when the tab is opened.
      requestAnimationFrame(() => scrollTimelineToNow(false));
    }
  }, [activeTab, timelineDate]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resRes, tablesRes, catRes] = await Promise.all([
        api.get('/reservations'), api.get('/tables'), api.get('/categories')
      ]);
      setReservations(resRes.data.data);
      setTables(tablesRes.data.data);
      setCategories(catRes.data.data);
    } catch (error) {
      console.error('Failed to fetch data', error);
      toast.error(t("reservations.failedToLoad"));
    } finally { setLoading(false); }
  };

  // Shared time-window matcher: today / tomorrow / this-week / next-week /
  // last-week / last-month / custom (single day) / interval (range) / all.
  const matchesTime = useCallback((res: Reservation) => {
    if (timeFilter === 'all') return true;
    const resDate = new Date(res.startTime);
    const resDay = toLocalDateStr(resDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const mondayOffset = (d: Date) => (d.getDay() === 0 ? 6 : d.getDay() - 1);

    if (timeFilter === 'today') return resDay === toLocalDateStr(today);
    if (timeFilter === 'tomorrow') {
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      return resDay === toLocalDateStr(tomorrow);
    }
    if (timeFilter === 'this-week' || timeFilter === 'next-week' || timeFilter === 'last-week') {
      const start = new Date(today);
      const shift = timeFilter === 'next-week' ? 7 : timeFilter === 'last-week' ? -7 : 0;
      start.setDate(today.getDate() - mondayOffset(today) + shift);
      const end = new Date(start); end.setDate(start.getDate() + 7);
      return resDate >= start && resDate < end;
    }
    if (timeFilter === 'last-month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 1);
      return resDate >= start && resDate < end;
    }
    if (timeFilter === 'custom' && customDate) return resDay === customDate;
    if (timeFilter === 'interval' && (customFrom || customTo)) {
      if (customFrom && resDay < customFrom) return false;
      if (customTo && resDay > customTo) return false;
      return true;
    }
    return true;
  }, [timeFilter, customDate, customFrom, customTo]);

  // Reservations in the selected time window (ignoring tab + status), so the
  // overview chips show totals for that period (e.g. all bookings today).
  const periodReservations = useMemo(() => {
    return reservations.filter(res => {
      const matchesSearch = res.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || res.customerPhone.includes(searchQuery);
      return matchesSearch && matchesTime(res);
    });
  }, [reservations, searchQuery, matchesTime]);

  // Base list: tab/database scope + time + search, before the clicked status filter.
  const baseReservations = useMemo(() => {
    return periodReservations.filter(res => {
      const isClosed = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(res.status);
      if (activeTab === 'upcoming') return !isClosed;
      // Reservation Database (history) tab: active = live, deactive = closed.
      if (dbFilter === 'active') return !isClosed;
      if (dbFilter === 'deactive') return isClosed;
      return true;
    });
  }, [periodReservations, activeTab, dbFilter]);

  // Apply the clicked status filter, then column sort (default Time ascending).
  const filteredReservations = useMemo(() => {
    const list = statusFilter
      ? baseReservations.filter(r => r.status === statusFilter)
      : baseReservations;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === 'guest') return dir * a.customerName.localeCompare(b.customerName);
      if (sortBy === 'table') {
        const ta = a.table?.identifier || '';
        const tb = b.table?.identifier || '';
        if (!ta && tb) return 1;
        if (ta && !tb) return -1;
        return dir * ta.localeCompare(tb, undefined, { numeric: true });
      }
      return dir * (new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    });
  }, [baseReservations, statusFilter, sortBy, sortDir]);

  // Clicking a column header sorts by it; clicking the active one flips direction.
  const toggleSort = (col: 'time' | 'guest' | 'table') => {
    if (sortBy === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  // Overview chip → filter by that status and jump to the tab where it lives.
  const CLOSED_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
  const handleStatusSelect = (status: string | null) => {
    setStatusFilter(status);
    if (status) {
      const closed = CLOSED_STATUSES.includes(status);
      setActiveTab(closed ? 'history' : 'upcoming');
      if (closed) setDbFilter('deactive');
    }
  };

  const updateStatus = async (id: string, status: string, skipPayment = false) => {
    try {
      const res = await api.put(`/reservations/${id}/status`, { status, ...(skipPayment ? { skipPayment: true } : {}) });
      // When accepting triggers a deposit request, surface the link + code so
      // staff can relay it (an SMS/e-mail was also sent to the guest).
      if (res.data?.data?.paymentRequested && res.data?.data?.payment) {
        setPaymentInfo(res.data.data.payment);
        toast.success(t("reservations.paymentRequested"));
      } else {
        toast.success(t("reservations.statusUpdated"));
      }
      fetchData();
    } catch (err: any) { 
      const backendMsg = err.response?.data?.details?.message || err.response?.data?.error;
      toast.error(backendMsg || t("reservations.updateFailed")); 
    }
  };

  const [paymentInfo, setPaymentInfo] = useState<{ url: string; code: string; amount: number; currency: string } | null>(null);

  // Confirm-guarded status actions so a misclick can't silently accept/reject a
  // booking. Each prompt shows the reservation's details (#5.9/#5.10).
  const confirmAccept = async (res: Reservation) => {
    if (await confirm({ title: t('reservations.acceptConfirmTitle'), details: reservationDetails(res), confirmText: t('reservations.accept') })) {
      updateStatus(res.id, 'CONFIRMED');
    }
  };
  const confirmReject = async (res: Reservation) => {
    if (await confirm({ title: t('reservations.rejectConfirmTitle'), details: reservationDetails(res), tone: 'danger', confirmText: t('reservations.reject') })) {
      updateStatus(res.id, 'CANCELLED');
    }
  };
  // Skip the deposit and confirm directly (#4.6) — the manual equivalent of Accept
  // when the restaurant chooses not to collect a deposit for this booking.
  const confirmSkipPayment = async (res: Reservation) => {
    if (await confirm({ title: t('reservations.skipPaymentConfirmTitle'), description: t('reservations.skipPaymentConfirmDesc'), details: reservationDetails(res), confirmText: t('reservations.skipPayment') })) {
      updateStatus(res.id, 'CONFIRMED', true);
    }
  };

  const handleOpenEdit = (res: Reservation) => {
    setIsEditMode(true);
    setSelectedId(res.id);
    const dateObj = new Date(res.startTime);
    setFormData({
      customerName: res.customerName,
      customerPhone: res.customerPhone,
      guestCount: res.guestCount.toString(),
      tableId: res.table?.id || 'none',
      categoryId: res.category?.id || 'none',
      notes: res.notes || '',
      internalNote: res.internalNote || '',
      isVIP: res.isVIP
    });
    setSelectedDate(toLocalDateStr(dateObj));
    setSelectedTime(fmtTime(dateObj));
    setIsDialogOpen(true);
  };

  // Open the create dialog fresh (from the header or a timeline click), optionally
  // pre-seeded with a table + slot when launched from an empty timeline cell.
  const openCreate = (opts?: { tableId?: string; date?: string; time?: string }) => {
    setIsEditMode(false);
    setSelectedId(null);
    setFormData({
      customerName: '', customerPhone: '', guestCount: '2',
      tableId: opts?.tableId || 'none', categoryId: 'none', notes: '',
      internalNote: '', isVIP: false
    });
    setSelectedDate(opts?.date || todayLocalDate());
    setSelectedTime(opts?.time || '19:00');
    setIsDialogOpen(true);
  };

  const handleReschedule = async (
    id: string,
    payload: { tableId: string | null; startTime: string; endTime: string }
  ) => {
    try {
      await api.patch(`/reservations/${id}/schedule`, payload);
      toast.success(t("reservations.rescheduled"));
    } catch (err: any) {
      if (err.response?.data?.details?.code === 'TABLE_CONFLICT') {
        toast.error(t("reservations.conflictBlocked"));
      } else {
        toast.error(t("reservations.updateFailed"));
      }
    } finally {
      fetchData();
    }
  };

  const [showConflictWarning, setShowConflictWarning] = useState(false);

  const submitReservation = async (overrideConflict = false) => {
    const combinedDateTime = new Date(`${selectedDate}T${selectedTime}`);
    try {
      const payload = {
        ...formData,
        guestCount: parseInt(formData.guestCount),
        startTime: combinedDateTime.toISOString(),
        ...(overrideConflict ? { overrideConflict: true } : {})
      };
      if (isEditMode && selectedId) {
        await api.put(`/reservations/${selectedId}`, payload);
        toast.success(t("reservations.saved"));
      } else {
        const res = await api.post('/reservations', payload);
        if (res.data?.data?.possiblyFullyBooked) {
          toast.warning(t("reservations.possiblyFullyBooked"));
        } else {
          toast.success(t("reservations.created"));
        }
      }
      setShowConflictWarning(false);
      setIsDialogOpen(false);
      fetchData();
    } catch (err: any) {
      if (err.response?.data?.details?.code === 'TABLE_CONFLICT') {
        setShowConflictWarning(true);
        return;
      }
      const backendMsg = err.response?.data?.details?.message || err.response?.data?.error;
      toast.error(backendMsg || t("reservations.failedToSave"));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitReservation(false);
  };

  const handleDelete = async (res: Reservation) => {
    const ok = await confirm({
      title: t('reservations.deleteConfirmTitle'),
      details: reservationDetails(res),
      tone: 'danger',
      confirmText: t('reservations.deleted'),
    });
    if (!ok) return;
    try {
      await api.delete(`/reservations/${res.id}`);
      toast.success(t("reservations.deleted"));
      fetchData();
    } catch (err) { toast.error(t("reservations.deleteFailed")); }
  };

  const getRowColor = (status: string, isVIP: boolean) => {
      if (isVIP) return "bg-blue-100 hover:bg-blue-200/80 transition-colors";
      return statusStyle(status).row;
  };

  const getStatusBadge = (status: string) => {
    const s = statusStyle(status);
    return <Badge className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-sm shadow-sm", s.badge)}>{t(s.labelKey)}</Badge>;
  };

  // Boxed summary rows shown inside confirmation prompts so staff can see exactly
  // which reservation an action affects before committing (#5.10).
  const reservationDetails = (res: Reservation) => {
    const d = new Date(res.startTime);
    return [
      { label: t('reservations.confirmDetailGuest'), value: res.customerName },
      { label: t('reservations.confirmDetailTime'), value: `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${fmtTime(d)}` },
      { label: t('reservations.confirmDetailPax'), value: `${res.guestCount}` },
      { label: t('reservations.confirmDetailTable'), value: res.table?.identifier || t('reservations.manual') },
    ];
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header - Corporate Blue */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{isRestaurant ? t("reservations.dashboardTitle") : term('bookingPlural')}</h1>
            <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">{t("reservations.serviceControlUnit")}</p>
            </div>
          </div>
          <Button onClick={() => openCreate()} className="bg-blue-600 hover:bg-blue-700 text-white rounded-md h-10 px-6 font-black text-xs shadow-lg shadow-blue-600/20">
            <Plus className="w-4 h-4 mr-2 stroke-[3]" /> {t("reservations.newReservation")}
          </Button>
        </div>

        {/* Status legend: colored count dots per reservation status (#5.7), counted
            over the selected time period. Clickable — filters the list + jumps tab. */}
        <StatusDots items={periodReservations} onSelect={handleStatusSelect} activeStatus={statusFilter} />

        {/* Command Center - Integrated & High Density */}
        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="p-0 border-b border-slate-100">
            <div className="flex flex-col">
              {/* Tab Selector */}
              <div className="flex items-center border-b border-slate-50 p-1 bg-slate-50/50">
                <Button variant="ghost" size="sm" onClick={() => { setActiveTab('upcoming'); setStatusFilter(null); if (!['today','tomorrow','this-week','next-week','all','custom','interval'].includes(timeFilter)) setTimeFilter('today'); }} className={cn("flex-1 h-9 text-[10px] font-black uppercase rounded-sm transition-all", activeTab === 'upcoming' ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600")}>
                    <Timer className="w-3.5 h-3.5 mr-2" /> {t("reservations.liveAndPending")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setActiveTab('timeline'); setStatusFilter(null); }} className={cn("flex-1 h-9 text-[10px] font-black uppercase rounded-sm transition-all", activeTab === 'timeline' ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600")}>
                    <CalendarDays className="w-3.5 h-3.5 mr-2" /> {t("reservations.timeline")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setActiveTab('history'); setStatusFilter(null); if (!['today','this-week','last-week','last-month','custom','interval'].includes(timeFilter)) setTimeFilter('today'); }} className={cn("flex-1 h-9 text-[10px] font-black uppercase rounded-sm transition-all", activeTab === 'history' ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600")}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> {t("reservations.reservationDatabase")}
                </Button>
              </div>

              {activeTab === 'timeline' ? (
                <div className="flex flex-wrap items-center justify-between p-3 gap-4">
                  <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-md border border-slate-200/60">
                    <Button variant="ghost" size="icon" onClick={() => shiftTimelineDate(-1)} className="h-8 w-8 text-slate-500"><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setTimelineDate(todayLocalDate())} className={cn("h-7 text-[9px] font-black uppercase px-3 rounded-sm", timelineDate === todayLocalDate() ? "bg-blue-600 text-white" : "text-slate-500")}>{t("reservations.filterToday")}</Button>
                    <div className="relative">
                      <input type="date" ref={timelineDateRef} value={timelineDate} onChange={(e) => setTimelineDate(e.target.value)} className="sr-only" />
                      <Button variant="ghost" size="sm" onClick={() => timelineDateRef.current?.showPicker()} className="h-7 text-[9px] font-black uppercase px-3 rounded-sm text-slate-700">
                        <CalendarIcon className="w-3 h-3 mr-1.5" /> {new Date(`${timelineDate}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => shiftTimelineDate(1)} className="h-8 w-8 text-slate-500"><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                  <div className="flex items-center gap-2">
                    {timelineZones.length > 0 && (
                      <div className="flex items-center gap-1.5 bg-slate-100/50 p-1 rounded-md border border-slate-200/60">
                        <span className="text-[9px] font-black uppercase text-slate-400 pl-1.5">{t("reservations.zone")}</span>
                        <Select value={timelineZoneId} onValueChange={(v) => { if (v) setTimelineZoneId(v); }}>
                          <SelectTrigger className="h-7 min-w-[96px] text-[10px] font-black rounded-sm border-slate-200 focus:ring-0 shadow-none"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all" className="text-xs">{t("reservations.allZones")}</SelectItem>
                            {timelineZones.map(z => <SelectItem key={z.id} value={z.id} className="text-xs">{z.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 bg-slate-100/50 p-1 rounded-md border border-slate-200/60">
                      <span className="text-[9px] font-black uppercase text-slate-400 pl-1.5">{t("reservations.displayHours")}</span>
                      <Select value={String(timelineStartHour)} onValueChange={(v) => { if (!v) return; const h = parseInt(v); setTimelineStartHour(h); if (h >= timelineEndHour) setTimelineEndHour(Math.min(24, h + 1)); }}>
                        <SelectTrigger className="h-7 w-[64px] text-[10px] font-black rounded-sm border-slate-200 focus:ring-0 shadow-none"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => i).map(h => <SelectItem key={h} value={String(h)} className="text-xs">{String(h).padStart(2, '0')}:00</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <span className="text-[10px] font-black text-slate-300">–</span>
                      <Select value={String(timelineEndHour)} onValueChange={(v) => { if (!v) return; setTimelineEndHour(parseInt(v)); }}>
                        <SelectTrigger className="h-7 w-[64px] text-[10px] font-black rounded-sm border-slate-200 focus:ring-0 shadow-none"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => i + 1).filter(h => h > timelineStartHour).map(h => <SelectItem key={h} value={String(h)} className="text-xs">{String(h).padStart(2, '0')}:00</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => scrollTimelineToNow(true)} className="h-8 text-[10px] font-black uppercase border-slate-200 text-slate-600">
                      <Timer className="w-3.5 h-3.5 mr-1.5" /> {t("reservations.jumpToNow")}
                    </Button>
                  </div>
                </div>
              ) : (
              <div className="flex flex-wrap items-center justify-between p-3 gap-4">
                <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-md border border-slate-200/60 flex-wrap">
                  {(activeTab === 'history'
                    ? [
                        { label: t("reservations.filterLastMonth"), value: 'last-month' },
                        { label: t("reservations.filterLastWeek"), value: 'last-week' },
                        { label: t("reservations.filterToday"), value: 'today' },
                        { label: t("reservations.filterThisWeek"), value: 'this-week' },
                      ]
                    : [
                        { label: t("reservations.filterToday"), value: 'today' },
                        { label: t("reservations.filterTomorrow"), value: 'tomorrow' },
                        { label: t("reservations.filterThisWeek"), value: 'this-week' },
                        { label: t("reservations.filterNextWeek"), value: 'next-week' },
                        { label: t("reservations.filterAllTime"), value: 'all' },
                      ]
                  ).map(f => (
                    <Button key={f.value} variant="ghost" size="sm" onClick={() => setTimeFilter(f.value)} className={cn("h-7 text-[9px] font-black uppercase px-3 rounded-sm transition-all", timeFilter === f.value ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700")}>{f.label}</Button>
                  ))}
                  <div className="w-px h-4 bg-slate-300 mx-1" />
                  <div className="relative">
                    <input type="date" ref={filterDateRef} value={customDate} onChange={(e) => {setCustomFilterDate(e.target.value); setTimeFilter('custom');}} className="sr-only" />
                    <Button variant="ghost" size="sm" onClick={() => filterDateRef.current?.showPicker()} className={cn("h-7 text-[9px] font-black uppercase px-3 rounded-sm transition-all", timeFilter === 'custom' ? "bg-blue-600 text-white" : "text-slate-500")}>
                        <CalendarIcon className="w-3 h-3 mr-1.5" /> {timeFilter === 'custom' && customDate ? customDate : t("reservations.picker")}
                    </Button>
                  </div>
                  {/* Interval (date range) picker. */}
                  <Button variant="ghost" size="sm" onClick={() => setTimeFilter('interval')} className={cn("h-7 text-[9px] font-black uppercase px-3 rounded-sm transition-all", timeFilter === 'interval' ? "bg-blue-600 text-white" : "text-slate-500")}>
                    <CalendarIcon className="w-3 h-3 mr-1.5" /> {t("reservations.filterInterval")}
                  </Button>
                  {timeFilter === 'interval' && (
                    <div className="flex items-center gap-1">
                      <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setTimeFilter('interval'); }} className="h-7 text-[10px] font-bold border border-slate-200 rounded px-1.5 bg-white" />
                      <span className="text-[10px] font-black text-slate-400">–</span>
                      <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setTimeFilter('interval'); }} className="h-7 text-[10px] font-bold border border-slate-200 rounded px-1.5 bg-white" />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {/* Reservation Database scope: all / active / deactive. */}
                  {activeTab === 'history' && (
                    <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-md border border-slate-200/60">
                      {[
                        { label: t("reservations.dbAll"), value: 'all' as const },
                        { label: t("reservations.dbActive"), value: 'active' as const },
                        { label: t("reservations.dbDeactive"), value: 'deactive' as const },
                      ].map(f => (
                        <Button key={f.value} variant="ghost" size="sm" onClick={() => setDbFilter(f.value)} className={cn("h-7 text-[9px] font-black uppercase px-3 rounded-sm transition-all", dbFilter === f.value ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700")}>{f.label}</Button>
                      ))}
                    </div>
                  )}
                  <div className="relative flex-1 min-w-[180px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder={t("reservations.searchPlaceholder")} className="pl-10 h-10 text-xs bg-slate-50 border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-500/5 rounded-md transition-all font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
                </div>
              </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {activeTab === 'timeline' ? (
              <ReservationTimeline
                tables={timelineTables}
                reservations={reservations}
                timelineDate={timelineDate}
                scrollRef={timelineScrollRef}
                startHour={timelineStartHour}
                endHour={timelineEndHour}
                onCreateAt={(tableId, time) => openCreate({ tableId, date: timelineDate, time })}
                onReschedule={handleReschedule}
                onEdit={handleOpenEdit}
                t={t}
              />
            ) : (
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="h-10 hover:bg-transparent border-b border-slate-200">
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-6">
                    <button type="button" onClick={() => toggleSort('time')} className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors uppercase">
                      {t("reservations.schedule")}<span className="text-[8px] w-2">{sortBy === 'time' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  </TableHead>
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <button type="button" onClick={() => toggleSort('guest')} className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors uppercase">
                      {t("reservations.guestContext")}<span className="text-[8px] w-2">{sortBy === 'guest' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  </TableHead>
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                    <button type="button" onClick={() => toggleSort('table')} className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors uppercase">
                      {t("reservations.table")}<span className="text-[8px] w-2">{sortBy === 'table' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  </TableHead>
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("reservations.serviceNotes")}</TableHead>
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right px-6">{t("reservations.command")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-64 text-center text-xs text-slate-300 font-black uppercase tracking-widest">{t("reservations.refreshing")}</TableCell></TableRow>
                ) : filteredReservations.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-64 text-center text-xs text-slate-300 font-black uppercase tracking-widest">{t("reservations.noRecords")}</TableCell></TableRow>
                ) : filteredReservations.map((res) => (
                  <TableRow key={res.id} className={cn("h-16 border-b border-slate-50 transition-colors", getRowColor(res.status, res.isVIP))}>
                    <TableCell className="px-6">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-xl tracking-tighter leading-none mb-1">
                            {fmtTime(new Date(res.startTime))}
                        </span>
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-tight bg-blue-50/50 w-fit px-1.5 rounded border border-blue-100/50">
                            {new Date(res.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span className="font-black text-slate-800 text-sm uppercase tracking-tight">{res.customerName}</span>
                            {res.isVIP && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />}
                            <div className="h-4 w-[1px] bg-slate-200 mx-1" />
                            <span className="text-[10px] font-black text-slate-500">{res.guestCount} {t("reservations.pax")}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-slate-400 font-mono font-bold">{res.customerPhone}</span>
                            <Badge variant="outline" className="text-[8px] h-4 border-slate-200 bg-white font-black text-slate-400 rounded-sm shadow-none uppercase">{res.category?.name || t("reservations.manual")}</Badge>
                        </div>
                        {res.phoneHistory && res.phoneHistory.noShowCount > 0 && (
                            <div title={t("reservations.noShowHistoryHint")} className="flex items-center gap-1 w-fit text-[9px] font-black uppercase text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-sm">
                                <AlertTriangle className="w-2.5 h-2.5" /> {res.phoneHistory.noShowCount}/{res.phoneHistory.totalVisits} {t("reservations.noShowHistoryLabel")}
                            </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {res.table ? (
                        <div className="inline-flex flex-col items-center">
                            <div className="font-black text-slate-900 text-lg leading-none">{res.table.identifier}</div>
                            {typeof res.table.capacity === 'number' && res.guestCount > res.table.capacity ? (
                                <span title={t("reservations.overCapacityHint")} className="mt-1 inline-flex items-center gap-1 text-[8px] font-black text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">
                                    <AlertTriangle className="w-2.5 h-2.5" /> {res.guestCount}/{res.table.capacity} {t("reservations.overCapacity")}
                                </span>
                            ) : (
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">{t("reservations.assigned")}</span>
                            )}
                        </div>
                      ) : (
                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-sm border border-amber-200 uppercase tracking-tighter">{t("reservations.needsAssign")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2 max-w-[280px]">
                        <div className="flex items-center gap-2">{getStatusBadge(res.status)}</div>
                        {res.internalNote ? (
                          <div className="text-[10px] text-slate-700 font-bold bg-white/60 p-2 rounded border border-slate-200/50 shadow-sm italic leading-tight">
                            <Info className="w-2.5 h-2.5 text-blue-500 inline mr-1" /> {res.internalNote}
                          </div>
                        ) : (
                            <span className="text-[9px] text-slate-300 italic font-medium uppercase tracking-widest">{t("reservations.noIntelligence")}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1.5">
                            {res.status === 'PENDING' && (
                            <>
                                <Button size="sm" onClick={() => confirmAccept(res)} className="h-8 px-4 bg-green-600 hover:bg-green-700 text-[10px] font-black uppercase rounded shadow-lg shadow-green-600/10"><Check className="w-3.5 h-3.5 mr-1.5" /> {t("reservations.accept")}</Button>
                                <Button size="sm" variant="outline" onClick={() => confirmReject(res)} className="h-8 px-4 text-red-600 hover:bg-red-50 border-red-200 text-[10px] font-black uppercase rounded">{t("reservations.reject")}</Button>
                            </>
                            )}
                            {res.status === 'AWAITING_PAYMENT' && (
                            <Button size="sm" onClick={() => confirmSkipPayment(res)} className="h-8 px-4 bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-black uppercase rounded shadow-lg shadow-violet-600/10">{t("reservations.skipPayment")}</Button>
                            )}
                            {res.status === 'CONFIRMED' && (
                            <Button size="sm" onClick={() => updateStatus(res.id, 'COMPLETED')} className="h-8 px-6 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded shadow-lg shadow-blue-600/10">{t("reservations.arrived")}</Button>
                            )}
                            {(res.status === 'CANCELLED' || res.status === 'NO_SHOW' || res.status === 'COMPLETED') && (
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(res.id, 'CONFIRMED')} className="h-8 text-blue-600 hover:bg-blue-50 text-[10px] font-black uppercase rounded">
                                <RotateCcw className="w-3 h-3 mr-1.5 stroke-[3]" /> {t("reservations.restore")}
                            </Button>
                            )}
                        </div>
                        {res.status === 'PENDING' && (
                          <button type="button" onClick={() => confirmSkipPayment(res)} className="text-[9px] font-bold uppercase tracking-wide text-slate-400 hover:text-violet-600 transition-colors">
                            {t("reservations.skipPayment")}
                          </button>
                        )}
                        <div className="flex items-center space-x-1 bg-white/40 p-0.5 rounded border border-slate-100/50">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(res)} className="h-7 w-7 text-slate-300 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(res)} className="h-7 w-7 text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>

        {/* Dialog - Flat ngx-admin Style */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setShowConflictWarning(false); }}>
          <DialogContent maxWidth="sm:max-w-2xl" className="p-0 rounded-md overflow-hidden border-0 shadow-2xl">
            <form onSubmit={handleSubmit}>
              <div className="bg-slate-900 p-5 text-white flex justify-between items-center">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black uppercase tracking-tight">{isEditMode ? t("reservations.updateRecord") : t("reservations.initializeBooking")}</DialogTitle>
                </DialogHeader>
              </div>
              
              <div className="p-8 grid grid-cols-2 gap-10 bg-white">
                <div className="space-y-6">
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("reservations.fullName")}</Label>
                    <Input required value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} className="h-12 text-sm font-bold border-slate-200 focus:border-blue-500 rounded-sm" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("reservations.mobileContact")}</Label>
                    <Input required value={formData.customerPhone} onChange={e => setFormData({...formData, customerPhone: e.target.value})} className="h-12 text-sm font-bold border-slate-200 focus:border-blue-500 rounded-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("reservations.partyPax")}</Label>
                        <Input type="number" min="1" required value={formData.guestCount} onChange={e => setFormData({...formData, guestCount: e.target.value})} className="h-12 text-sm font-black text-center border-slate-200 rounded-sm" />
                    </div>
                    <div className="grid gap-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("reservations.entrySource")}</Label>
                        <Select value={formData.categoryId} onValueChange={(v) => setFormData({...formData, categoryId: v || 'none'})}>
                            <SelectTrigger className="h-12 text-sm font-bold rounded-sm border-slate-200 focus:ring-0 shadow-none">
                                <SelectValue>
                                    {categories.find(c => c.id === formData.categoryId)?.name || t("reservations.standardService")}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none" className="text-xs">{t("reservations.standardService")}</SelectItem>
                                {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("reservations.calendarDate")}</Label>
                    <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-12 text-sm font-bold border-slate-200 focus:border-blue-500 rounded-sm" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("reservations.arrivalTime")}</Label>
                    <TimeSelect value={selectedTime} onChange={setSelectedTime} className="w-full h-12 text-sm font-bold border-slate-200 focus:border-blue-500 rounded-sm" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t("reservations.tableLocation")}</Label>
                    <Select value={formData.tableId} onValueChange={(v) => setFormData({...formData, tableId: v || 'none'})}>
                        <SelectTrigger className="h-12 text-sm font-bold rounded-sm border-slate-200 focus:ring-0 shadow-none">
                            <SelectValue>
                                {tables.find(t => t.id === formData.tableId)?.identifier || t("reservations.autoSelection")}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none" className="text-xs italic">{t("reservations.autoAssign")}</SelectItem>
                            {tables.map(tableItem => <SelectItem key={tableItem.id} value={tableItem.id} className="text-xs font-bold">{tableItem.identifier} ({t("reservations.pax")}: {tableItem.capacity})</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {(() => {
                        const selTable = tables.find(t => t.id === formData.tableId);
                        const party = parseInt(formData.guestCount);
                        if (selTable && party && party > selTable.capacity) {
                            return (
                                <div className="flex items-center gap-1.5 text-[10px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-1.5 rounded-sm uppercase tracking-tight">
                                    <AlertTriangle className="w-3 h-3" /> {t("reservations.overCapacityDialog")} ({party} &gt; {selTable.capacity})
                                </div>
                            );
                        }
                        return null;
                    })()}
                  </div>
                </div>

                <div className="col-span-2 space-y-6 pt-4 border-t border-slate-50">
                    <div className="grid gap-2">
                        <Label className="text-[10px] font-black uppercase text-blue-600 tracking-[0.2em]">{t("reservations.serviceIntelligence")}</Label>
                        <Textarea value={formData.internalNote} onChange={e => setFormData({...formData, internalNote: e.target.value})} className="min-h-[80px] text-sm font-medium border-blue-100 bg-blue-50/20 rounded-sm p-4 focus:ring-0 focus:border-blue-300" placeholder={t("reservations.notesPlaceholder")} />
                    </div>
                    <div className="flex items-center gap-3 bg-slate-900 p-4 rounded-md shadow-lg shadow-slate-900/10">
                        <Checkbox checked={formData.isVIP} onCheckedChange={(c) => setFormData({...formData, isVIP: !!c})} className="border-white/20 data-[state=checked]:bg-blue-500" />
                        <Label className="text-[10px] font-black uppercase text-white tracking-[0.3em]">{t("reservations.elevateVIP")}</Label>
                        <Star className={cn("w-4 h-4 ml-auto", formData.isVIP ? "text-amber-400 fill-amber-400" : "text-slate-600")} />
                    </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-11 text-xs font-black text-slate-400 uppercase tracking-widest px-8">{t("reservations.abort")}</Button>
                <Button type="submit" className="h-11 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase px-12 rounded-sm shadow-xl shadow-blue-600/20">{t("reservations.commitEntry")}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Conflict override warning */}
        <Dialog open={showConflictWarning} onOpenChange={setShowConflictWarning}>
          <DialogContent maxWidth="sm:max-w-md" className="p-0 rounded-md overflow-hidden border-0 shadow-2xl">
            <div className="bg-amber-500 p-6">
              <DialogHeader>
                <DialogTitle className="text-white text-lg font-black uppercase tracking-tight flex items-center gap-2">
                  <AlertTriangle className="w-6 h-6" /> {t("reservations.conflictWarningTitle")}
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="p-6">
              <DialogDescription className="text-slate-700 font-medium leading-relaxed">
                {t("reservations.conflictWarningDesc")}
              </DialogDescription>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowConflictWarning(false)} className="h-10 text-xs font-black text-slate-400 uppercase tracking-widest">{t("reservations.conflictCancel")}</Button>
              <Button type="button" onClick={() => submitReservation(true)} className="h-10 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase px-6 rounded-sm">{t("reservations.conflictConfirm")}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Deposit payment requested (manual accept) — relay link/code to guest */}
        <Dialog open={!!paymentInfo} onOpenChange={(o) => { if (!o) setPaymentInfo(null); }}>
          <DialogContent maxWidth="sm:max-w-md" className="p-0 rounded-md overflow-hidden border-0 shadow-2xl">
            <div className="bg-violet-600 p-6">
              <DialogHeader>
                <DialogTitle className="text-white text-lg font-black uppercase tracking-tight flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" /> {t("reservations.paymentRequestedTitle")}
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 font-medium leading-relaxed">{t("reservations.paymentRequestedDesc")}</p>
              {paymentInfo && (
                <>
                  <div className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-200 px-4 py-3">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">{t("reservations.paymentAmount")}</span>
                    <span className="text-lg font-black text-slate-900">{(paymentInfo.amount / 100).toFixed(2)} {paymentInfo.currency}</span>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("reservations.paymentLink")}</Label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={paymentInfo.url} onFocus={(e) => e.target.select()} className="h-9 text-[10px] font-mono border-slate-200 bg-slate-50" />
                      <Button type="button" size="sm" onClick={() => { navigator.clipboard.writeText(paymentInfo.url); toast.success(t("reservations.copied")); }} className="h-9 shrink-0 bg-slate-900 hover:bg-slate-800 text-white">{t("reservations.copy")}</Button>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t("reservations.paymentCode")}</Label>
                    <div className="text-2xl font-black tracking-[0.3em] text-center bg-violet-50 border border-violet-200 rounded-md py-2 text-violet-700">{paymentInfo.code}</div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{t("reservations.paymentRequestedHint")}</p>
                </>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <Button type="button" onClick={() => setPaymentInfo(null)} className="h-10 bg-slate-900 text-white text-xs font-black uppercase px-6 rounded-sm">{t("reservations.close")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

// --- Reservation Timeline (tables x time-of-day) ---
const TIMELINE_SLOT_MINUTES = 30;
const TIMELINE_PX_PER_SLOT = 72;
const TIMELINE_PX_PER_MIN = TIMELINE_PX_PER_SLOT / TIMELINE_SLOT_MINUTES;
const TIMELINE_LABEL_WIDTH = 176;
const TIMELINE_ROW_HEIGHT = 60;
const TIMELINE_SNAP_MINUTES = 15; // drag/resize snap granularity

// Live drag state while a reservation is being moved or resized on the timeline.
// All *Min values are minutes measured from the configured timeline start hour.
interface TimelineDrag {
  id: string;
  mode: 'move' | 'resize-l' | 'resize-r';
  originX: number;
  originY: number;
  origStartMin: number;
  origEndMin: number;
  origTableIdx: number;
  startMin: number;
  endMin: number;
  tableIdx: number;
  overlap: boolean;
}

function ReservationTimeline({ tables, reservations, timelineDate, scrollRef, startHour, endHour, onCreateAt, onReschedule, onEdit, t }: {
  tables: any[];
  reservations: Reservation[];
  timelineDate: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  startHour: number;
  endHour: number;
  onCreateAt: (tableId: string, time: string) => void;
  onReschedule: (id: string, payload: { tableId: string | null; startTime: string; endTime: string }) => void;
  onEdit: (r: Reservation) => void;
  t: (key: string) => string;
}) {
  const slots = useMemo(() => {
    const list: { hour: number; minute: number }[] = [];
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += TIMELINE_SLOT_MINUTES) {
        list.push({ hour: h, minute: m });
      }
    }
    return list;
  }, [startHour, endHour]);

  const totalMinutes = (endHour - startHour) * 60;
  const totalWidth = slots.length * TIMELINE_PX_PER_SLOT;
  const minutesFromStart = (d: Date) => (d.getHours() - startHour) * 60 + d.getMinutes();
  const minutesToPx = (mins: number) => mins * TIMELINE_PX_PER_MIN;
  const pxToMinutes = (px: number) => px / TIMELINE_PX_PER_MIN;
  const snap = (mins: number) => Math.round(mins / TIMELINE_SNAP_MINUTES) * TIMELINE_SNAP_MINUTES;

  const durationOf = (r: Reservation) => {
    const start = new Date(r.startTime);
    const end = r.endTime ? new Date(r.endTime) : new Date(start.getTime() + 90 * 60000);
    return (end.getTime() - start.getTime()) / 60000;
  };

  const dayReservations = reservations.filter(r =>
    toLocalDateStr(new Date(r.startTime)) === timelineDate &&
    r.table &&
    !['CANCELLED', 'NO_SHOW'].includes(r.status)
  );

  const [drag, setDrag] = useState<TimelineDrag | null>(null);
  const dragRef = useRef<TimelineDrag | null>(null);
  const justDraggedRef = useRef(false);
  const applyDrag = (d: TimelineDrag | null) => { dragRef.current = d; setDrag(d); };

  // Would [startMin,endMin) on `tableIdx` collide with another booking on that table?
  const hasOverlap = (tableIdx: number, startMin: number, endMin: number, excludeId: string) => {
    const table = tables[tableIdx];
    if (!table) return false;
    return dayReservations.some(r => {
      if (r.id === excludeId || r.table?.id !== table.id) return false;
      const s = minutesFromStart(new Date(r.startTime));
      const e = s + durationOf(r);
      return startMin < e && endMin > s;
    });
  };

  const beginDrag = (e: React.PointerEvent, r: Reservation, mode: TimelineDrag['mode']) => {
    e.stopPropagation();
    e.preventDefault();
    const startD = new Date(r.startTime);
    const origStartMin = minutesFromStart(startD);
    const origEndMin = origStartMin + durationOf(r);
    const origTableIdx = tables.findIndex(tb => tb.id === r.table?.id);
    applyDrag({
      id: r.id, mode,
      originX: e.clientX, originY: e.clientY,
      origStartMin, origEndMin, origTableIdx,
      startMin: origStartMin, endMin: origEndMin, tableIdx: origTableIdx,
      overlap: false,
    });
  };

  useEffect(() => {
    if (!drag) return;
    const origin = dragRef.current!;
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - origin.originX;
      const dy = e.clientY - origin.originY;
      const deltaMin = snap(pxToMinutes(dx));
      let startMin = origin.origStartMin;
      let endMin = origin.origEndMin;
      let tableIdx = origin.origTableIdx;
      if (origin.mode === 'move') {
        startMin += deltaMin;
        endMin += deltaMin;
        tableIdx = Math.min(tables.length - 1, Math.max(0, origin.origTableIdx + Math.round(dy / TIMELINE_ROW_HEIGHT)));
      } else if (origin.mode === 'resize-l') {
        startMin = Math.min(endMin - TIMELINE_SNAP_MINUTES, startMin + deltaMin);
      } else {
        endMin = Math.max(startMin + TIMELINE_SNAP_MINUTES, endMin + deltaMin);
      }
      // keep the block inside the visible window
      if (startMin < 0) { if (origin.mode === 'move') endMin -= startMin; startMin = 0; }
      if (endMin > totalMinutes) { if (origin.mode === 'move') startMin -= (endMin - totalMinutes); endMin = totalMinutes; }
      const overlap = hasOverlap(tableIdx, startMin, endMin, origin.id);
      applyDrag({ ...origin, startMin, endMin, tableIdx, overlap });
    };
    const onUp = () => {
      const d = dragRef.current;
      applyDrag(null);
      justDraggedRef.current = true;
      setTimeout(() => { justDraggedRef.current = false; }, 50);
      if (!d) return;
      const changed = d.startMin !== d.origStartMin || d.endMin !== d.origEndMin || d.tableIdx !== d.origTableIdx;
      if (!changed) return;
      if (d.overlap) { toast.error(t("reservations.conflictBlocked")); return; }
      const base = `${timelineDate}T00:00:00`;
      const startDate = new Date(base); startDate.setMinutes(startHour * 60 + d.startMin);
      const endDate = new Date(base); endDate.setMinutes(startHour * 60 + d.endMin);
      onReschedule(d.id, {
        tableId: tables[d.tableIdx].id,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag?.id, drag?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEmptyClick = (e: React.MouseEvent<HTMLDivElement>, tableId: string) => {
    if (justDraggedRef.current || drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = snap(pxToMinutes(e.clientX - rect.left));
    const clock = startHour * 60 + Math.max(0, Math.min(totalMinutes - TIMELINE_SNAP_MINUTES, mins));
    const time = `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;
    onCreateAt(tableId, time);
  };

  const isToday = timelineDate === toLocalDateStr(new Date());
  const now = new Date();
  const nowLeft = isToday ? minutesToPx(minutesFromStart(now)) : null;

  if (tables.length === 0) {
    return <div className="p-16 text-center text-xs text-slate-300 font-black uppercase tracking-widest">{t("reservations.noTablesForTimeline")}</div>;
  }

  return (
    <div ref={scrollRef} className="overflow-x-auto select-none">
      <div className="relative" style={{ width: TIMELINE_LABEL_WIDTH + totalWidth }}>
        {/* Header: time labels */}
        <div className="flex sticky top-0 z-20 bg-white border-b border-slate-200">
          <div className="sticky left-0 z-30 bg-white shrink-0 border-r border-slate-200 p-2 text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-end" style={{ width: TIMELINE_LABEL_WIDTH }}>
            {t("reservations.table")}
          </div>
          {slots.map((s, i) => (
            <div key={i} className="shrink-0 border-r border-slate-100 py-2 text-center text-[9px] font-bold text-slate-400" style={{ width: TIMELINE_PX_PER_SLOT }}>
              {s.minute === 0 ? `${String(s.hour % 24).padStart(2, '0')}:00` : ''}
            </div>
          ))}
        </div>

        {/* Body: one row per table, plus a floating drag preview overlay */}
        <div className="relative">
          {tables.map((table, tableIdx) => {
            const tableReservations = dayReservations.filter(r => r.table?.id === table.id);
            return (
              <div key={table.id} className="flex border-b border-slate-100" style={{ height: TIMELINE_ROW_HEIGHT }}>
                <div className="sticky left-0 z-10 bg-white shrink-0 border-r border-slate-200 p-2 flex flex-col justify-center" style={{ width: TIMELINE_LABEL_WIDTH }}>
                  <div className="text-xs font-black text-slate-800">{table.identifier}</div>
                  <div className="text-[9px] text-slate-400 font-bold">{table.capacity} {t("reservations.pax")} · {table.tableType?.name || ''}</div>
                </div>
                <div className="relative cursor-copy" style={{ width: totalWidth }} onClick={(e) => handleEmptyClick(e, table.id)}>
                  {slots.map((s, i) => (
                    <div key={i} className="absolute top-0 bottom-0 border-r border-slate-50 pointer-events-none" style={{ left: i * TIMELINE_PX_PER_SLOT, width: TIMELINE_PX_PER_SLOT }} />
                  ))}
                  {tableReservations.map(r => {
                    const start = new Date(r.startTime);
                    const startMin = minutesFromStart(start);
                    const left = minutesToPx(startMin);
                    const width = Math.max(24, minutesToPx(durationOf(r)));
                    const overCap = typeof table.capacity === 'number' && r.guestCount > table.capacity;
                    const isDragging = drag?.id === r.id;
                    return (
                      // Outer wrapper carries the timeline position and stays overflow-visible
                      // so the over-capacity corner badge below can hang off the block's edge
                      // instead of being clipped by the inner block's overflow-hidden — a thin
                      // ring alone was easy to miss, especially on short/narrow blocks.
                      <div
                        key={r.id}
                        className={cn("absolute top-1.5 bottom-1.5", isDragging && 'opacity-30')}
                        style={{ left, width }}
                      >
                        <div
                          onPointerDown={(e) => beginDrag(e, r, 'move')}
                          title={`${r.customerName} · ${r.guestCount} ${t("reservations.pax")} · ${fmtTime(start)}${overCap ? ` · ${t("reservations.overCapacityHint")}` : ''}`}
                          className={cn(
                            "group relative w-full h-full rounded-md border px-2 py-1 text-[10px] font-bold text-white overflow-hidden shadow-sm cursor-grab active:cursor-grabbing",
                            statusStyle(r.status).block,
                            overCap && 'ring-2 ring-red-500 ring-offset-1'
                          )}
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10" onPointerDown={(e) => beginDrag(e, r, 'resize-l')} />
                          <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10" onPointerDown={(e) => beginDrag(e, r, 'resize-r')} />
                          {/* Edit this booking. stopPropagation so it doesn't start a drag or create. */}
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onEdit(r); }}
                            title={t("reservations.editBooking")}
                            className="absolute top-0.5 right-0.5 z-20 w-4 h-4 rounded bg-black/20 hover:bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                          <div className="truncate flex items-center gap-1 pr-4">{overCap && <AlertTriangle className="w-2.5 h-2.5 shrink-0" />}{r.customerName}</div>
                          <div className="truncate opacity-80 text-[9px] font-medium">{r.guestCount} {t("reservations.pax")}</div>
                        </div>
                        {/* Always-visible over-capacity badge — doesn't depend on hover
                            (unlike the title tooltip) and can't be squeezed out by a narrow
                            block (unlike the inline icon+name, which truncates together). */}
                        {overCap && (
                          <div
                            aria-hidden="true"
                            className="absolute -top-1.5 -left-1.5 z-30 w-4 h-4 rounded-full bg-red-600 border-2 border-white shadow-md flex items-center justify-center animate-pulse pointer-events-none"
                          >
                            <AlertTriangle className="w-2.5 h-2.5 text-white stroke-[3]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Floating preview while dragging (can span across table rows) */}
          {drag && (() => {
            const r = reservations.find(x => x.id === drag.id);
            const left = TIMELINE_LABEL_WIDTH + minutesToPx(drag.startMin);
            const width = Math.max(24, minutesToPx(drag.endMin - drag.startMin));
            const top = drag.tableIdx * TIMELINE_ROW_HEIGHT + 6;
            const startClock = startHour * 60 + drag.startMin;
            const endClock = startHour * 60 + drag.endMin;
            const fmt = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            return (
              <div
                className={cn("absolute z-30 rounded-md border-2 px-2 py-1 text-[10px] font-bold text-white overflow-hidden shadow-xl pointer-events-none",
                  drag.overlap ? 'bg-red-500 border-red-700' : 'bg-blue-600 border-blue-800')}
                style={{ left, width, top, height: TIMELINE_ROW_HEIGHT - 12 }}
              >
                <div className="truncate">{r?.customerName}</div>
                <div className="truncate opacity-90 text-[9px]">{fmt(startClock)}–{fmt(endClock)}</div>
              </div>
            );
          })()}

          {nowLeft !== null && nowLeft >= 0 && nowLeft <= totalWidth && (
            <div
              data-now-marker="true"
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
              style={{ left: TIMELINE_LABEL_WIDTH + nowLeft }}
            >
              <div className="absolute -top-1 -left-[5px] w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
