'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from "@/i18n/provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Users, Clock, Search, Calendar, Plus, Star, Phone, Check, X, Bell, 
  ChevronRight, RefreshCw, Smile, ArrowRight, UserCheck, Flame, Leaf, HelpCircle, Utensils, RotateCcw
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  guestCount: number;
  startTime: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  table: { id: string; identifier: string } | null;
  category: { id: string; name: string } | null;
  notes: string | null;
  internalNote: string | null;
  isVIP: boolean;
}

interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  quotedWaitTime: number | null;
  status: 'WAITING' | 'NOTIFIED' | 'SEATED' | 'CANCELED' | 'NO_SHOW';
  notes: string | null;
  joinedAt: string;
  notifiedAt: string | null;
  targetDate: string | null;
}

export default function HostConsolePage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'reservations' | 'waitlist'>('reservations');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [waitlistHistory, setWaitlistHistory] = useState<WaitlistEntry[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  // The tenant-wide booking mode (Settings > Reservations) silently controls how
  // table assignment behaves here — surfacing it so that behavior isn't invisible
  // to whoever's working this console.
  const [reservationLogic, setReservationLogic] = useState<string | null>(null);
  
  // History Drawer State
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);

  // Time focus anchor state (Default to current hour, e.g. 18 for 18:00)
  const currentHourNum = new Date().getHours();
  const [selectedHour, setSelectedHour] = useState<number | 'all'>(currentHourNum);
  
  // Modal States
  const [isWalkinModalOpen, setIsWalkinModalOpen] = useState(false);
  const [isResModalOpen, setIsResModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  // Form States
  const [walkinForm, setWalkinForm] = useState({
    customerName: '',
    customerPhone: '',
    partySize: '2',
    quotedWaitTime: '15',
    notes: ''
  });

  const [resForm, setResForm] = useState({
    customerName: '',
    customerPhone: '',
    guestCount: '2',
    notes: '',
    internalNote: '',
    isVIP: false,
    tableId: 'none',
    selectedTime: '19:00'
  });

  // Time Tick for Waitlist elapsed calculations
  const [tick, setTick] = useState(0);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 30000); // Trigger re-render every 30 seconds for timers
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resRes, waitlistRes, waitlistHistoryRes, tablesRes, catRes, settingsRes] = await Promise.all([
        api.get('/reservations'),
        api.get('/wait-time/entries'),
        api.get('/wait-time/entries', { params: { history: 'true' } }),
        api.get('/tables'),
        api.get('/categories'),
        api.get('/settings').catch(() => null),
      ]);
      setReservations(resRes.data.data);
      setWaitlist(waitlistRes.data.data);
      setWaitlistHistory(waitlistHistoryRes.data.data);
      setTables(tablesRes.data.data);
      setCategories(catRes.data.data);
      setReservationLogic(settingsRes?.data?.data?.logic ?? null);
    } catch (error) {
      console.error('Failed to fetch data', error);
      toast.error(t("host.toastFailedLoad"));
    } finally {
      setLoading(false);
    }
  };

  // Revert reservation status
  const handleRevertResStatus = async (id: string, status: string) => {
    try {
      await api.put(`/reservations/${id}/status`, { status });
      toast.success(t("host.toastActionReverted"));
      fetchData();
    } catch (err) {
      toast.error(t("host.toastRevertFailed"));
    }
  };

  // Switch Reservation Status
  const handleUpdateResStatus = async (id: string, status: string, previousStatus?: string) => {
    const ok = await confirm({
      title: t("host.confirmResStatus").replace("{status}", status.toLowerCase()),
      confirmText: t("host.confirmProceed"),
      cancelText: t("host.cancel"),
      tone: (status === 'CANCELLED' || status === 'NO_SHOW') ? 'danger' : 'default',
    });
    if (!ok) return;
    try {
      await api.put(`/reservations/${id}/status`, { status });
      const statusLabels = {
        CONFIRMED: t("host.resStatusConfirmed"),
        COMPLETED: t("host.resStatusSeated"),
        CANCELLED: t("host.resStatusCancelled"),
        NO_SHOW: t("host.resStatusNoShow"),
        PENDING: t("host.resStatusPending")
      };
      const label = statusLabels[status as keyof typeof statusLabels] || status.toLowerCase();
      
      toast.success(t("host.toastResStatus").replace("{label}", label), {
        action: {
          label: t("host.undo"),
          onClick: () => {
            handleRevertResStatus(id, previousStatus || 'CONFIRMED');
          }
        }
      });
      fetchData();
    } catch (err) {
      toast.error(t("host.toastFailedUpdateStatus"));
    }
  };

  // Revert Waitlist status
  const handleRevertWaitlistStatus = async (entryId: string, status: string) => {
    try {
      await api.put(`/wait-time/entries/${entryId}/status`, { status });
      toast.success(t("host.toastActionReverted"));
      fetchData();
    } catch (err) {
      toast.error(t("host.toastRevertFailed"));
    }
  };

  // Switch Waitlist Status
  const handleUpdateWaitlistStatus = async (entryId: string, status: string, previousStatus?: string) => {
    const ok = await confirm({
      title: t("host.confirmWaitlistStatus").replace("{status}", status.toLowerCase()),
      confirmText: t("host.confirmProceed"),
      cancelText: t("host.cancel"),
      tone: (status === 'CANCELED' || status === 'NO_SHOW') ? 'danger' : 'default',
    });
    if (!ok) return;
    try {
      await api.put(`/wait-time/entries/${entryId}/status`, { status });
      const statusLabels = {
        WAITING: t("host.waitlistStatusWaiting"),
        NOTIFIED: t("host.waitlistStatusNotified"),
        SEATED: t("host.waitlistStatusSeated"),
        CANCELED: t("host.waitlistStatusCancelled"),
        NO_SHOW: t("host.waitlistStatusNoShow")
      };
      const label = statusLabels[status as keyof typeof statusLabels] || status.toLowerCase();
      
      toast.success(t("host.toastGuestStatus").replace("{label}", label), {
        action: {
          label: t("host.undo"),
          onClick: () => {
            handleRevertWaitlistStatus(entryId, previousStatus || 'WAITING');
          }
        }
      });
      fetchData();
    } catch (err) {
      toast.error(t("host.toastFailedUpdateStatus"));
    }
  };

  // Create Walk-in Waitlist Entry
  const handleAddWalkinSubmit = async (e: React.FormEvent, immediateSeat: boolean = false) => {
    if (e) e.preventDefault();
    try {
      const response = await api.post('/wait-time/entries', {
        customerName: walkinForm.customerName,
        customerPhone: walkinForm.customerPhone,
        partySize: parseInt(walkinForm.partySize),
        quotedWaitTime: immediateSeat ? 0 : parseInt(walkinForm.quotedWaitTime),
        notes: walkinForm.notes
      });
      
      if (immediateSeat) {
        await api.put(`/wait-time/entries/${response.data.data.id}/status`, { status: 'SEATED' });
        toast.success(t("host.toastWalkinSeated"));
      } else {
        toast.success(t("host.toastAddWaitlist"));
      }
      
      setIsWalkinModalOpen(false);
      setWalkinForm({
        customerName: '',
        customerPhone: '',
        partySize: '2',
        quotedWaitTime: '15',
        notes: ''
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("host.toastAddGuestFailed"));
    }
  };

  // Create/Edit Reservation
  const handleResSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const todayString = new Date().toISOString().split('T')[0];
      const combinedDateTime = new Date(`${todayString}T${resForm.selectedTime}`);
      
      const payload = {
        customerName: resForm.customerName,
        customerPhone: resForm.customerPhone,
        guestCount: parseInt(resForm.guestCount),
        notes: resForm.notes,
        internalNote: resForm.internalNote,
        isVIP: resForm.isVIP,
        tableId: resForm.tableId === 'none' ? undefined : resForm.tableId,
        startTime: combinedDateTime.toISOString()
      };

      if (selectedReservation) {
        await api.put(`/reservations/${selectedReservation.id}`, payload);
        toast.success(t("host.toastResUpdated"));
      } else {
        await api.post('/reservations', payload);
        toast.success(t("host.toastResCreated"));
      }
      setIsResModalOpen(false);
      setSelectedReservation(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("host.toastSaveResFailed"));
    }
  };

  const handleOpenEditRes = (res: Reservation) => {
    setSelectedReservation(res);
    const dateObj = new Date(res.startTime);
    setResForm({
      customerName: res.customerName,
      customerPhone: res.customerPhone,
      guestCount: res.guestCount.toString(),
      notes: res.notes || '',
      internalNote: res.internalNote || '',
      isVIP: res.isVIP,
      tableId: res.table?.id || 'none',
      selectedTime: dateObj.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })
    });
    setIsResModalOpen(true);
  };

  // Filtered lists
  const filteredReservations = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    return reservations.filter(res => {
      // Host view only focuses on active/upcoming items for TODAY
      const isToday = res.startTime.startsWith(todayStr);
      if (!isToday) return false;

      // Filter out canceled or fully checked-out entries from the main active screen
      if (res.status === 'CANCELLED' || res.status === 'COMPLETED') return false;

      // Search match
      const nameMatch = res.customerName.toLowerCase().includes(searchQuery.toLowerCase());
      const phoneMatch = res.customerPhone.includes(searchQuery);
      const tableMatch = res.table?.identifier.toLowerCase().includes(searchQuery.toLowerCase()) || false;
      const matchesSearch = nameMatch || phoneMatch || tableMatch;

      if (!matchesSearch) return false;

      if (selectedHour === 'all') return true;

      const resHour = new Date(res.startTime).getHours();
      return resHour === selectedHour;
    }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [reservations, searchQuery, selectedHour]);

  const reservationsHistory = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return reservations.filter(res => {
      const isToday = res.startTime.startsWith(todayStr);
      const isResolved = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(res.status);
      return isToday && isResolved;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [reservations]);

  // Filter waitlist to walk-ins (targetDate === null) or today's date-specific waitlist
  const todayWaitlist = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return waitlist.filter(entry => entry.targetDate === null || entry.targetDate === todayStr);
  }, [waitlist]);

  const filteredWaitlist = useMemo(() => {
    return todayWaitlist.filter(entry => {
      const nameMatch = entry.customerName.toLowerCase().includes(searchQuery.toLowerCase());
      const phoneMatch = entry.customerPhone.includes(searchQuery);
      return nameMatch || phoneMatch;
    });
  }, [todayWaitlist, searchQuery]);

  const filteredWaitlistHistory = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return waitlistHistory.filter(entry => entry.targetDate === null || entry.targetDate === todayStr);
  }, [waitlistHistory]);

  // Hourly slots for navigation (e.g. 11:00 to 23:00)
  const hourSlots = [
    { label: t("host.allSlots"), value: 'all' as const },
    ...Array.from({ length: 13 }, (_, i) => i + 11).map(h => ({ label: `${String(h).padStart(2, '0')}:00`, value: h })),
  ];

  // Helper: Elapsed time calculator
  const getElapsedTime = (joinedAtString: string) => {
    const elapsedMs = new Date().getTime() - new Date(joinedAtString).getTime();
    const mins = Math.max(0, Math.floor(elapsedMs / 60000));
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse';
      case 'NOTIFIED':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'SEATED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 sm:gap-3 max-w-7xl mx-auto h-[calc(100dvh-84px)] lg:h-[calc(100vh-120px)]">

        {/* Main Header / iPad Top Panel */}
        <div className="bg-slate-900 rounded-xl px-4 py-2.5 text-white shadow-lg flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-blue-600 p-1.5 rounded-lg shrink-0">
              <Smile className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black tracking-tight flex items-center gap-2 truncate">
                {t("host.hostConsoleTitle")}
                <Badge variant="outline" className="hidden sm:inline-flex text-[9px] font-black border-blue-400 text-blue-400 uppercase tracking-widest px-1.5 py-0 rounded-sm">{t("host.ipadMode")}</Badge>
              </h1>
              <p className="hidden sm:block text-slate-400 text-[10px] font-bold uppercase tracking-wider">{t("host.hostConsoleSubtitle")}</p>
              {reservationLogic && (
                <Link href="/dashboard/settings" className="hidden sm:inline-flex items-center gap-1 text-[9px] font-bold text-blue-400 hover:text-blue-300 hover:underline">
                  {t("admin.bookingMode")}: {
                    reservationLogic === 'FIXED_SLOTS' ? t("settings.fixedTimeSlots")
                    : reservationLogic === 'MANUAL_AVAILABILITY' ? t("admin.bookingModeManual")
                    : t("settings.dynamicDuration")
                  } · {t("admin.editInSettings")}
                </Link>
              )}
            </div>
          </div>

          {/* Toggle Switch & Quick Action Button. On phones it takes a full row
              below the title; the tab group shrinks + scrolls so nothing overflows. */}
          <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
            <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex overflow-x-auto hide-scrollbar min-w-0 flex-1 sm:flex-none">
              <button
                onClick={() => { setActiveTab('reservations'); }}
                className={cn(
                  "px-2.5 sm:px-3.5 h-9 text-[11px] font-black uppercase rounded-md transition-all flex items-center gap-1.5 border border-transparent whitespace-nowrap",
                  activeTab === 'reservations'
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 border-blue-500"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Calendar className="w-3.5 h-3.5 shrink-0" /> {t("host.reservationsTab")} ({reservations.filter(r => r.startTime.startsWith(new Date().toISOString().split('T')[0]) && r.status !== 'CANCELLED' && r.status !== 'COMPLETED').length})
              </button>
              <button
                onClick={() => { setActiveTab('waitlist'); }}
                className={cn(
                  "px-2.5 sm:px-3.5 h-9 text-[11px] font-black uppercase rounded-md transition-all flex items-center gap-1.5 border border-transparent whitespace-nowrap",
                  activeTab === 'waitlist'
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 border-blue-500"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Clock className="w-3.5 h-3.5 shrink-0" /> {t("host.waitlistQueueTab")} ({todayWaitlist.length})
              </button>
            </div>

            <Button
              onClick={() => {
                if (activeTab === 'reservations') {
                  setSelectedReservation(null);
                  setResForm({
                    customerName: '',
                    customerPhone: '',
                    guestCount: '2',
                    notes: '',
                    internalNote: '',
                    isVIP: false,
                    tableId: 'none',
                    selectedTime: new Date().toTimeString().substring(0, 5)
                  });
                  setIsResModalOpen(true);
                } else {
                  setIsWalkinModalOpen(true);
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-3 sm:px-4 font-black uppercase tracking-wider text-[11px] rounded-lg shadow-md shadow-emerald-600/20 active:scale-95 transition-all whitespace-nowrap"
            >
              <Plus className="w-4 h-4 sm:mr-1.5 stroke-[3]" />
              <span className="hidden sm:inline">{activeTab === 'reservations' ? t("host.bookTableBtn") : t("host.addWalkinBtn")}</span>
            </Button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-white rounded-xl p-2 border border-slate-200 shadow-sm flex items-center gap-2 shrink-0">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder={t("host.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-sm font-bold bg-slate-50 border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg transition-all"
            />
          </div>

          <Button
            variant="outline"
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="h-10 px-3 shrink-0 rounded-lg border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 font-bold text-[11px] uppercase text-slate-600 whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4 text-blue-600 stroke-[2.5]" />
            <span className="hidden sm:inline">{t("host.activityLogBtn")}</span>
          </Button>

          <Button
            variant="outline"
            onClick={fetchData}
            disabled={loading}
            className="h-10 w-10 shrink-0 rounded-lg border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={cn("w-4 h-4 text-slate-600", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Content Pane */}
        <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 border border-slate-200 rounded-xl shadow-inner p-2.5">
          
          {/* 1. RESERVATIONS VIEW */}
          {activeTab === 'reservations' && (
            <div className="flex flex-col sm:flex-row gap-3 h-full">

              {/* Hour Slot Navigator Panel (Left Side on iPad) */}
              <div className="w-full sm:w-32 lg:w-40 shrink-0 bg-white border border-slate-200 rounded-lg p-2 flex sm:flex-col gap-1.5 overflow-x-auto sm:overflow-y-auto hide-scrollbar">
                <div className="hidden sm:block text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1 px-2">{t("host.filterByTime")}</div>
                {hourSlots.map((hour) => {
                  const isActive = selectedHour === hour.value;
                  const resInHour = reservations.filter(r => {
                    const isToday = r.startTime.startsWith(new Date().toISOString().split('T')[0]);
                    const hourMatch = hour.value === 'all' || new Date(r.startTime).getHours() === hour.value;
                    return isToday && hourMatch && r.status !== 'CANCELLED' && r.status !== 'COMPLETED';
                  }).length;

                  return (
                    <button
                      key={hour.label}
                      onClick={() => setSelectedHour(hour.value)}
                      className={cn(
                        "h-9 shrink-0 px-2.5 rounded-md font-black text-[11px] uppercase text-left transition-all flex items-center justify-between gap-1 border whitespace-nowrap",
                        isActive
                          ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/10"
                          : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      <span>{hour.label}</span>
                      {resInHour > 0 && (
                        <span className={cn(
                          "px-1.5 py-0 rounded-full text-[9px] font-black tracking-tight shrink-0",
                          isActive ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-800"
                        )}>
                          {resInHour}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Reservations Card List (Right/Main Side on iPad) */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5">
                {loading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                    <div className="text-slate-400 text-xs font-black uppercase tracking-widest">{t("host.updatingTimeline")}</div>
                  </div>
                ) : filteredReservations.length === 0 ? (
                  <div className="bg-white border border-slate-200 border-dashed rounded-xl p-16 text-center">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm mb-1">{t("host.noActiveBookings")}</h3>
                    <p className="text-slate-400 text-xs max-w-xs mx-auto">{t("host.noActiveBookingsDesc")}</p>
                  </div>
                ) : (
                  filteredReservations.map((res) => {
                    const dateObj = new Date(res.startTime);
                    const formattedTime = dateObj.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
                    
                    return (
                      <div
                        key={res.id}
                        className={cn(
                          "bg-white border rounded-xl shadow-sm p-3 transition-all flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 hover:shadow-md",
                          res.isVIP ? "border-amber-300 bg-amber-50/20" : "border-slate-200"
                        )}
                      >
                        {/* Left Section: Time & Guest Info */}
                        <div className="flex gap-4 min-w-0">
                          <div className="h-12 w-16 bg-slate-900 text-white rounded-lg flex flex-col items-center justify-center shrink-0">
                            <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider leading-none mb-0.5">{t("host.time")}</span>
                            <span className="text-sm font-black tracking-tight leading-none">{formattedTime}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-slate-900 text-sm uppercase tracking-tight">{res.customerName}</span>
                              {res.isVIP && (
                                <Badge className="bg-amber-500 text-white border-transparent text-[8px] font-black uppercase px-2 py-0.5 rounded-sm">
                                  <Star className="w-2.5 h-2.5 mr-1 fill-white" /> {t("host.vip")}
                                </Badge>
                              )}
                              <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-sm border", getStatusBadgeClass(res.status))}>
                                {res.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {res.guestCount} {t("host.guests")}</span>
                              {res.table && <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded"><Utensils className="w-3.5 h-3.5" /> {t("host.table")} {res.table.identifier}</span>}
                              {!res.table && <span className="flex items-center gap-1 text-slate-400">{t("host.noTableAssigned")}</span>}
                            </div>
                            {res.notes && (
                              <p className="text-slate-500 text-[11px] font-medium leading-relaxed bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 mt-2 max-w-lg">
                                <span className="font-bold text-slate-700">{t("host.guestNoteLabel")}</span> {res.notes}
                              </p>
                            )}
                            {res.internalNote && (
                              <p className="text-amber-800 text-[11px] font-medium leading-relaxed bg-amber-50/50 px-3 py-1.5 rounded-lg border border-amber-100 mt-1 max-w-lg">
                                <span className="font-bold text-amber-900">{t("host.hostNoteLabel")}</span> {res.internalNote}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right Section: Touch Actions */}
                        <div className="flex items-center flex-wrap gap-2 w-full xl:w-auto shrink-0 justify-start xl:justify-end">
                          <button
                            onClick={() => handleOpenEditRes(res)}
                            className="flex-1 xl:flex-none h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 border border-slate-200"
                          >
                            {t("host.detailsBtn")}
                          </button>
                           {res.status === 'PENDING' && (
                            <button
                              onClick={() => handleUpdateResStatus(res.id, 'CONFIRMED', res.status)}
                              className="flex-1 xl:flex-none h-11 px-4 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-black uppercase text-[10px] tracking-wider rounded-lg transition-all flex items-center justify-center gap-1"
                            >
                              {t("host.confirmBtn")}
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateResStatus(res.id, 'COMPLETED', res.status)}
                            className="flex-1 xl:flex-none h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-wider rounded-lg shadow-md shadow-emerald-600/10 transition-all flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4 stroke-[3]" /> {t("host.seatBtn")}
                          </button>
                          <button
                            onClick={() => handleUpdateResStatus(res.id, 'NO_SHOW', res.status)}
                            className="h-11 w-11 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition-all shrink-0"
                            title={t("host.noShowTitle")}
                          >
                            <X className="w-5 h-5 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 2. WAITLIST VIEW */}
          {activeTab === 'waitlist' && (
            <div className="h-full overflow-y-auto space-y-2.5 pr-1">
              {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                  <div className="text-slate-400 text-xs font-black uppercase tracking-widest">{t("host.updatingWaitlist")}</div>
                </div>
              ) : filteredWaitlist.length === 0 ? (
                <div className="bg-white border border-slate-200 border-dashed rounded-xl p-16 text-center">
                  <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm mb-1">{t("host.waitlistEmpty")}</h3>
                  <p className="text-slate-400 text-xs max-w-xs mx-auto">{t("host.waitlistEmptyDesc")}</p>
                </div>
              ) : (
                filteredWaitlist.map((entry) => {
                  const elapsed = getElapsedTime(entry.joinedAt);
                  const isOvertime = entry.quotedWaitTime && (parseFloat(elapsed) > entry.quotedWaitTime);

                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "bg-white border border-slate-200 rounded-xl shadow-sm p-3 transition-all flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 hover:shadow-md",
                        entry.status === 'NOTIFIED' && "border-purple-300 bg-purple-50/20"
                      )}
                    >
                      {/* Left: Info */}
                      <div className="flex gap-4 min-w-0">
                        <div className={cn(
                          "h-12 w-16 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm",
                          entry.targetDate
                            ? "bg-amber-600"
                            : isOvertime 
                              ? "bg-rose-600 animate-pulse" 
                              : entry.status === 'NOTIFIED'
                                ? "bg-purple-600"
                                : "bg-blue-600"
                        )}>
                          <span className="text-[10px] font-black uppercase opacity-75 tracking-wider leading-none mb-1">
                            {entry.targetDate ? t("host.bookWait") : t("host.waiting")}
                          </span>
                          <span className="text-sm font-black tracking-tight leading-none">
                            {entry.targetDate ? t("host.date") : elapsed}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-slate-800 text-sm uppercase tracking-tight">{entry.customerName}</span>
                            <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-sm border", getStatusBadgeClass(entry.status))}>
                              {entry.status}
                            </Badge>
                            {entry.targetDate && (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[8px] font-black uppercase px-2 py-0.5 rounded-sm">
                                {t("host.dateWaitlist")} ({entry.targetDate})
                              </Badge>
                            )}
                            {entry.quotedWaitTime && !entry.targetDate && (
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                ({t("host.quotePrefix")} {entry.quotedWaitTime} {t("host.minSuffix")})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {entry.partySize} {t("host.guests")}</span>
                            <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {entry.customerPhone}</span>
                          </div>
                          {entry.notes && (
                            <p className="text-slate-500 text-[11px] font-medium leading-relaxed bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 mt-2 max-w-lg">
                              <span className="font-bold text-slate-700">{t("host.noteLabel")}</span> {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Touch actions */}
                      <div className="flex items-center flex-wrap gap-2 w-full xl:w-auto shrink-0 justify-start xl:justify-end">
                        <button
                          onClick={() => handleUpdateWaitlistStatus(entry.id, 'NOTIFIED', entry.status)}
                          className="flex-1 xl:flex-none h-11 px-5 bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 font-black uppercase text-[10px] tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5"
                        >
                          <Bell className="w-4 h-4 stroke-[2.5]" /> {t("host.notifyReadyBtn")}
                        </button>
                        <button
                          onClick={() => handleUpdateWaitlistStatus(entry.id, 'SEATED', entry.status)}
                          className="flex-1 xl:flex-none h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-wider rounded-lg shadow-md shadow-emerald-600/10 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4 stroke-[3]" /> {t("host.seatGuestBtn")}
                        </button>
                        <button
                          onClick={() => handleUpdateWaitlistStatus(entry.id, 'CANCELED', entry.status)}
                          className="h-11 w-11 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition-all shrink-0"
                          title={t("host.removeGuestTitle")}
                        >
                          <X className="w-5 h-5 stroke-[2.5]" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </div>

      {/* 📱 A. Sleek, Easy Touch Walk-In Entry Modal */}
      <Dialog open={isWalkinModalOpen} onOpenChange={setIsWalkinModalOpen}>
        <DialogContent className="p-0 rounded-2xl overflow-y-auto max-h-[92dvh] border-0 max-w-md w-full bg-white shadow-2xl">
          <form onSubmit={handleAddWalkinSubmit}>
            <div className="bg-slate-900 p-6 text-white">
              <DialogHeader>
                <DialogTitle className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-400 stroke-[3]" /> {t("host.addToWaitlistTitle")}
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs">
                  {t("host.addToWaitlistDesc")}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Customer Name */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.guestNameLabel")}</Label>
                <Input 
                  placeholder={t("host.guestNamePlaceholder")}
                  value={walkinForm.customerName}
                  onChange={(e) => setWalkinForm({...walkinForm, customerName: e.target.value})}
                  required
                  className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Customer Phone */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.phoneLabel")}</Label>
                <Input 
                  type="tel"
                  placeholder={t("host.phonePlaceholder")}
                  value={walkinForm.customerPhone}
                  onChange={(e) => setWalkinForm({...walkinForm, customerPhone: e.target.value})}
                  required
                  className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Touch Preset: Party Size */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.partySizeLabel")} ({walkinForm.partySize} {t("host.guests")})</Label>
                <div className="grid grid-cols-5 gap-2">
                  {['1', '2', '3', '4', '6', '8', '10', '12'].map((size) => (
                    <button
                      type="button"
                      key={size}
                      onClick={() => setWalkinForm({...walkinForm, partySize: size})}
                      className={cn(
                        "h-12 rounded-lg font-black text-xs border transition-all",
                        walkinForm.partySize === size 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10" 
                          : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Touch Preset: Quoted Wait Time */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.quotedWaitTimeLabel")} ({walkinForm.quotedWaitTime} {t("host.minSuffix")})</Label>
                <div className="grid grid-cols-4 gap-2">
                  {['0', '15', '30', '45', '60', '75', '90'].map((time) => (
                    <button
                      type="button"
                      key={time}
                      onClick={() => setWalkinForm({...walkinForm, quotedWaitTime: time})}
                      className={cn(
                        "h-12 rounded-lg font-black text-xs border transition-all",
                        walkinForm.quotedWaitTime === time 
                          ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/10" 
                          : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {time === '0' ? t("host.noWait") : `${time}${t("host.mSuffix")}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.seatingNotesLabel")}</Label>
                <Textarea 
                  placeholder={t("host.seatingNotesPlaceholder")}
                  value={walkinForm.notes}
                  onChange={(e) => setWalkinForm({...walkinForm, notes: e.target.value})}
                  className="rounded-lg border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold min-h-[80px]"
                />
              </div>

            </div>

            <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsWalkinModalOpen(false)}
                className="h-12 text-slate-500 font-bold uppercase text-[10px] tracking-wider"
              >
                {t("host.closeBtn")}
              </Button>
              <Button 
                type="button" 
                onClick={(e) => handleAddWalkinSubmit(e, true)}
                className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-wider px-6 rounded-lg shadow-md shadow-emerald-600/10"
              >
                {t("host.seatInstantlyBtn")}
              </Button>
              <Button 
                type="submit" 
                onClick={(e) => handleAddWalkinSubmit(e, false)}
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] tracking-wider px-6 rounded-lg shadow-md shadow-blue-600/10"
              >
                {t("host.addToWaitlistBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 📱 B. Touch Reservation Details / Add Modal */}
      <Dialog open={isResModalOpen} onOpenChange={setIsResModalOpen}>
        <DialogContent className="p-0 rounded-2xl overflow-y-auto max-h-[92dvh] border-0 max-w-md w-full bg-white shadow-2xl">
          <form onSubmit={handleResSubmit}>
            <div className="bg-slate-900 p-6 text-white">
              <DialogHeader>
                <DialogTitle className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400 stroke-[3]" />
                  {selectedReservation ? t("host.resDetailsTitle") : t("host.newResTitle")}
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs">
                  {selectedReservation ? t("host.resDetailsDesc") : t("host.newResDesc")}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Guest Name */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.guestNameLabel")}</Label>
                <Input 
                  placeholder={t("host.resGuestNamePlaceholder")}
                  value={resForm.customerName}
                  onChange={(e) => setResForm({...resForm, customerName: e.target.value})}
                  required
                  className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.resPhoneLabel")}</Label>
                <Input 
                  placeholder={t("host.resPhonePlaceholder")}
                  value={resForm.customerPhone}
                  onChange={(e) => setResForm({...resForm, customerPhone: e.target.value})}
                  required
                  className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Touch Preset: Guests Count */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.guestCountLabel")} ({resForm.guestCount} {t("host.guests")})</Label>
                <div className="grid grid-cols-5 gap-2">
                  {['1', '2', '3', '4', '6', '8', '10'].map((size) => (
                    <button
                      type="button"
                      key={size}
                      onClick={() => setResForm({...resForm, guestCount: size})}
                      className={cn(
                        "h-12 rounded-lg font-black text-xs border transition-all",
                        resForm.guestCount === size 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10" 
                          : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Time Selection */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.resTimeLabel")}</Label>
                  <TimeSelect
                    value={resForm.selectedTime}
                    onChange={(v) => setResForm({...resForm, selectedTime: v})}
                    className="w-full h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>

                {/* Table Assignment Select */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.assignTableLabel")}</Label>
                  <select 
                    value={resForm.tableId}
                    onChange={(e) => setResForm({...resForm, tableId: e.target.value})}
                    className="h-12 w-full font-bold text-slate-800 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white px-3 text-sm outline-none"
                  >
                    <option value="none">{t("host.noneHoldAtDoor")}</option>
                    {tables.map((tableItem) => (
                      <option key={tableItem.id} value={tableItem.id}>
                        {tableItem.identifier} ({tableItem.capacity} {t("host.pax")})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* VIP Toggle Switch-like layout */}
              <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50">
                <div className="space-y-0.5">
                  <Label className="text-xs font-black uppercase text-slate-800">{t("host.vipStatusLabel")}</Label>
                  <p className="text-[10px] text-slate-400">{t("host.vipStatusDesc")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setResForm({...resForm, isVIP: !resForm.isVIP})}
                  className={cn(
                    "w-20 h-10 font-black uppercase text-[10px] tracking-wider rounded-lg transition-all border",
                    resForm.isVIP 
                      ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/10" 
                      : "bg-white border-slate-200 text-slate-400"
                  )}
                >
                  {resForm.isVIP ? t("host.vipOn") : t("host.vipOff")}
                </button>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.guestNotesLabel")}</Label>
                <Textarea 
                  placeholder={t("host.guestNotesPlaceholder")}
                  value={resForm.notes}
                  onChange={(e) => setResForm({...resForm, notes: e.target.value})}
                  className="rounded-lg border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold min-h-[60px]"
                />
              </div>

              {/* Internal Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t("host.hostInternalNoteLabel")}</Label>
                <Textarea 
                  placeholder={t("host.hostInternalNotePlaceholder")}
                  value={resForm.internalNote}
                  onChange={(e) => setResForm({...resForm, internalNote: e.target.value})}
                  className="rounded-lg border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold min-h-[60px]"
                />
              </div>

            </div>

            <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsResModalOpen(false)}
                className="h-12 text-slate-500 font-bold uppercase text-[10px] tracking-wider"
              >
                {t("host.cancelBtn")}
              </Button>
              <Button 
                type="submit" 
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] tracking-wider px-6 rounded-lg shadow-md shadow-blue-600/10"
              >
                {selectedReservation ? t("host.saveChangesBtn") : t("host.createBookingBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 📱 C. Touch Activity History / Recovery Drawer */}
      <Dialog open={isHistoryDrawerOpen} onOpenChange={setIsHistoryDrawerOpen}>
        <DialogContent className="!fixed !top-0 !left-auto !right-0 !-translate-x-0 !-translate-y-0 !h-screen !rounded-r-none !rounded-l-2xl !max-w-md !gap-0 !p-0 flex flex-col animate-in slide-in-from-right duration-300">
          <div className="bg-slate-900 p-6 text-white shrink-0">
            <DialogHeader>
              <DialogTitle className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-blue-400 stroke-[3]" /> {t("host.activityRecoveryLogTitle")}
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">
                {t("host.activityRecoveryLogDesc")}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Reservations Resolved History */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">{t("host.recentlySeatedCancelledBookings")}</h3>
              <div className="space-y-3">
                {reservationsHistory.length === 0 ? (
                  <div className="text-xs text-slate-400 italic py-4 bg-slate-50 text-center rounded-lg border border-slate-100">{t("host.noRecentResChanges")}</div>
                ) : (
                  reservationsHistory.map((res) => (
                    <div key={res.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-xs uppercase text-slate-800 flex items-center gap-1.5">
                          {res.customerName}
                          <Badge variant="outline" className="text-[8px] font-black uppercase px-1">
                            {res.status === 'COMPLETED' ? t("host.seated") : res.status.toLowerCase()}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                          {res.guestCount} {t("host.paxDivider")} {new Date(res.startTime).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          handleRevertResStatus(res.id, 'CONFIRMED');
                          setIsHistoryDrawerOpen(false);
                        }}
                        className="h-8 text-[10px] font-black uppercase tracking-wider text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100 hover:text-blue-700"
                      >
                        {t("host.undoBtn")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Waitlist Resolved History */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">{t("host.recentlySeatedCancelledWalkins")}</h3>
              <div className="space-y-3">
                {filteredWaitlistHistory.length === 0 ? (
                  <div className="text-xs text-slate-400 italic py-4 bg-slate-50 text-center rounded-lg border border-slate-100">{t("host.noRecentWaitlistChanges")}</div>
                ) : (
                  filteredWaitlistHistory.map((entry) => (
                    <div key={entry.id} className="p-3 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-xs uppercase text-slate-800 flex items-center gap-1.5">
                          {entry.customerName}
                          <Badge variant="outline" className="text-[8px] font-black uppercase px-1">
                            {entry.status === 'SEATED' ? t("host.seated") : entry.status.toLowerCase()}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                          {entry.partySize} {t("host.paxDivider")} {entry.targetDate ? `${t("host.dateWaitlist")} (${entry.targetDate})` : `${t("host.waited")} ${getElapsedTime(entry.joinedAt)}`}
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          handleRevertWaitlistStatus(entry.id, 'WAITING');
                          setIsHistoryDrawerOpen(false);
                        }}
                        className="h-8 text-[10px] font-black uppercase tracking-wider text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100 hover:text-blue-700"
                      >
                        {t("host.undoBtn")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0">
            <Button 
              variant="outline" 
              onClick={() => setIsHistoryDrawerOpen(false)}
              className="w-full h-12 font-black uppercase text-xs"
            >
              {t("host.closeActivityLogBtn")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
