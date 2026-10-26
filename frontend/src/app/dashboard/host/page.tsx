'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from "@/i18n/provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Users, Clock, MagnifyingGlass, Calendar, Plus, Star, Phone, Check, X, Bell, ArrowClockwise, ArrowCounterClockwise, Hash, Pencil, NoteBlank } from '@phosphor-icons/react';
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
  confirmationCode: string | null;
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

// Today's date as YYYY-MM-DD (UTC), matching the format the backend's
// startDate/endDate reservation filters and WaitlistEntry.targetDate both
// use. Called fresh at each use site (not memoized/hoisted to a constant)
// so a host-stand tab left open across midnight still re-evaluates to the
// correct day on its next fetch/filter, instead of freezing on whichever
// day the page happened to load.
const todayDateStr = () => new Date().toISOString().split('T')[0];

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
  // Tracks whether any fetch has ever fully succeeded, so a later background
  // refresh failure (e.g. a deploy restart) can fail silently instead of
  // interrupting a host who already has working data on screen.
  const hasLoadedOnce = useRef(false);
  // Gates the full-screen loading spinner to the very first load only — once
  // the screen has data, later `loading` flips (manual refresh button) must
  // not blank the list out from under a host who's mid-action, which is what
  // was causing the "panel refreshes/flashes on every click" complaint.
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // A host stand refetches constantly (every action, every 30s tick) and a
  // backend restart/blip is common during deploys — one failed round-trip
  // shouldn't throw an alarming error at someone mid-shift. Retries silently
  // once before surfacing anything, and only toasts if data has never loaded
  // (a background refresh failing while the screen already has data just
  // keeps the stale data up rather than interrupting with an error).
  const fetchData = async (isRetry = false) => {
    try {
      if (!isRetry) setLoading(true);
      // Each resource is fetched independently: one flaky/slow endpoint (e.g. a
      // backend restart mid-request) must not wipe out the others that succeeded,
      // which is what Promise.all previously did by rejecting the whole batch.
      // The host stand only ever reads today's reservations (every consumer below
      // filters with `startsWith(todayStr)`), so ask the server to scope the query
      // to today instead of pulling the tenant's full reservation history.
      const todayStr = todayDateStr();
      const [resRes, waitlistRes, waitlistHistoryRes, tablesRes, catRes] = await Promise.allSettled([
        api.get('/reservations', { params: { startDate: todayStr, endDate: todayStr } }),
        api.get('/wait-time/entries'),
        api.get('/wait-time/entries', { params: { history: 'true' } }),
        api.get('/tables'),
        api.get('/categories'),
      ]);
      if (resRes.status === 'fulfilled') setReservations(resRes.value.data.data);
      if (waitlistRes.status === 'fulfilled') setWaitlist(waitlistRes.value.data.data);
      if (waitlistHistoryRes.status === 'fulfilled') setWaitlistHistory(waitlistHistoryRes.value.data.data);
      if (tablesRes.status === 'fulfilled') setTables(tablesRes.value.data.data);
      if (catRes.status === 'fulfilled') setCategories(catRes.value.data.data);

      const coreResults = [resRes, waitlistRes, waitlistHistoryRes, tablesRes, catRes];
      const failed = coreResults.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        for (const r of failed) console.error('Failed to fetch host console data', (r as PromiseRejectedResult).reason);
        // All 5 failing together usually means the backend was mid-restart for
        // that one round-trip (not a lasting outage) — one silent retry clears
        // most of these without ever bothering the host.
        if (!isRetry && failed.length === coreResults.length) {
          setTimeout(() => fetchData(true), 1500);
          return;
        }
        if (hasLoadedOnce.current) {
          // Background refresh failed but the screen already has data — stay quiet.
        } else {
          toast.error(t("host.toastFailedLoad"));
        }
      } else {
        hasLoadedOnce.current = true;
      }
    } finally {
      if (!isRetry) {
        setLoading(false);
        setInitialLoadDone(true);
      }
    }
  };

  // Lightweight background refresh used after a host action (confirm/seat/
  // cancel, add walk-in, save reservation) and on the 30s auto-refresh tick.
  // Only re-fetches the two lists that actually change from those actions
  // (tables/categories don't), and never touches `loading`, so the row list
  // stays mounted and visible the whole time instead of flashing to a spinner.
  const refreshActivity = async () => {
    try {
      const todayStr = todayDateStr();
      const [resRes, waitlistRes, waitlistHistoryRes] = await Promise.allSettled([
        api.get('/reservations', { params: { startDate: todayStr, endDate: todayStr } }),
        api.get('/wait-time/entries'),
        api.get('/wait-time/entries', { params: { history: 'true' } }),
      ]);
      if (resRes.status === 'fulfilled') setReservations(resRes.value.data.data);
      if (waitlistRes.status === 'fulfilled') setWaitlist(waitlistRes.value.data.data);
      if (waitlistHistoryRes.status === 'fulfilled') setWaitlistHistory(waitlistHistoryRes.value.data.data);
    } catch (err) {
      console.error('Failed background refresh', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
      // Keep data live in the background every 30s so a host doesn't have to
      // hit refresh to see another device's changes; refreshActivity never
      // touches `loading`, so this never blanks or flashes the list.
      refreshActivity();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revert reservation status
  const handleRevertResStatus = async (id: string, status: string) => {
    try {
      await api.put(`/reservations/${id}/status`, { status });
      toast.success(t("host.toastActionReverted"));
      refreshActivity();
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
      refreshActivity();
    } catch (err) {
      toast.error(t("host.toastFailedUpdateStatus"));
    }
  };

  // Revert Waitlist status
  const handleRevertWaitlistStatus = async (entryId: string, status: string) => {
    try {
      await api.put(`/wait-time/entries/${entryId}/status`, { status });
      toast.success(t("host.toastActionReverted"));
      refreshActivity();
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
      refreshActivity();
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
      refreshActivity();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("host.toastAddGuestFailed"));
    }
  };

  // Create/Edit Reservation
  const handleResSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const combinedDateTime = new Date(`${todayDateStr()}T${resForm.selectedTime}`);
      
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
      refreshActivity();
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
    const todayStr = todayDateStr();
    
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
      // A guest reading their confirmation code off an SMS is a faster, more
      // reliable lookup than a name search when the queue is long.
      const codeMatch = !!res.confirmationCode && res.confirmationCode.includes(searchQuery.trim());
      const matchesSearch = nameMatch || phoneMatch || tableMatch || codeMatch;

      if (!matchesSearch) return false;

      if (selectedHour === 'all') return true;

      const resHour = new Date(res.startTime).getHours();
      return resHour === selectedHour;
    }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [reservations, searchQuery, selectedHour]);

  const reservationsHistory = useMemo(() => {
    const todayStr = todayDateStr();
    return reservations.filter(res => {
      const isToday = res.startTime.startsWith(todayStr);
      const isResolved = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(res.status);
      return isToday && isResolved;
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [reservations]);

  // Filter waitlist to walk-ins (targetDate === null) or today's date-specific waitlist
  const todayWaitlist = useMemo(() => {
    const todayStr = todayDateStr();
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
    const todayStr = todayDateStr();
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
        return 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800/50';
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse';
      case 'NOTIFIED':
        return 'bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-400 border-purple-200 dark:border-purple-800/50';
      case 'SEATED':
        return 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50';
      default:
        return 'bg-muted text-foreground border-border';
    }
  };

  return (
    <>
      <div className="flex flex-col gap-2 sm:gap-3 max-w-7xl mx-auto h-[calc(100dvh-84px)] lg:h-[calc(100vh-120px)]">

        {/* Main Header — stripped down to what's actually clickable: the tab
            toggle and the primary action. Every piece of text here truncates/
            shrinks with the available space instead of assuming a fixed width,
            so a longer localization (e.g. Turkish) reflows instead of overflowing. */}
        <div className="bg-slate-900 rounded-xl px-3 sm:px-4 py-3 text-white shadow-lg flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
          <h1 className="text-base sm:text-lg font-black tracking-tight truncate min-w-0 shrink">
            {t("host.hostConsoleTitle")}
          </h1>

          {/* Toggle Switch & Quick Action Button. On phones it takes a full row
              below the title; the two tabs share the row equally and each
              truncates its own label independently, so neither one can push the
              other (or the count) out of view. */}
          <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
            <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex min-w-0 flex-1 sm:flex-none">
              <button
                onClick={() => { setActiveTab('reservations'); }}
                className={cn(
"px-2 sm:px-4 h-11 sm:h-12 text-[11px] sm:text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 sm:gap-2 border border-transparent active:scale-[0.97] min-w-0 flex-1 sm:flex-none",
                  activeTab === 'reservations'
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 border-blue-500"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                <Calendar className="w-4 h-4 shrink-0" />
                <span className="truncate min-w-0">{t("host.reservationsTab")}</span>
                <span className="shrink-0">({reservations.filter(r => r.startTime.startsWith(todayDateStr()) && r.status !== 'CANCELLED' && r.status !== 'COMPLETED').length})</span>
              </button>
              <button
                onClick={() => { setActiveTab('waitlist'); }}
                className={cn(
"px-2 sm:px-4 h-11 sm:h-12 text-[11px] sm:text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 sm:gap-2 border border-transparent active:scale-[0.97] min-w-0 flex-1 sm:flex-none",
                  activeTab === 'waitlist'
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 border-blue-500"
                    : "text-muted-foreground hover:text-white"
                )}
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span className="truncate min-w-0">{t("host.waitlistQueueTab")}</span>
                <span className="shrink-0">({todayWaitlist.length})</span>
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-11 sm:h-12 px-3 sm:px-5 font-semibold text-xs rounded-lg shadow-md shadow-emerald-600/20 active:scale-95 transition-all shrink-0"
            >
              <Plus className="w-5 h-5 md:mr-1.5 stroke-[3]" />
              <span className="hidden md:inline truncate">{activeTab === 'reservations' ? t("host.bookTableBtn") : t("host.addWalkinBtn")}</span>
            </Button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-card rounded-xl p-2 border border-border shadow-sm flex items-center gap-2 shrink-0">
          <div className="relative flex-1 w-full">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("host.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-12 text-sm font-bold bg-muted border-border focus:bg-card focus:ring-4 focus:ring-blue-500/10 rounded-lg transition-all"
            />
          </div>

          <Button
            variant="outline"
            onClick={() => setIsHistoryDrawerOpen(true)}
            className="h-12 px-3.5 shrink-0 rounded-lg border-border hover:bg-muted flex items-center gap-1.5 font-bold text-[11px] text-muted-foreground whitespace-nowrap"
          >
            <ArrowCounterClockwise className="w-4 h-4 text-blue-600 stroke-[2.5]" />
            <span className="hidden sm:inline">{t("host.activityLogBtn")}</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => fetchData()}
            disabled={loading}
            className="h-12 w-12 shrink-0 rounded-lg border-border hover:bg-muted"
          >
            <ArrowClockwise className={cn("w-4 h-4 text-muted-foreground", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Content Pane */}
        <div className="flex-1 min-h-0 overflow-hidden bg-muted border border-border rounded-xl shadow-inner p-2">

          {/* 1. RESERVATIONS VIEW */}
          {activeTab === 'reservations' && (
            <div className="flex flex-col sm:flex-row gap-2 h-full">

              {/* Hour Slot Navigator Panel (Left Side on iPad) */}
              <div className="w-full sm:w-28 lg:w-32 shrink-0 bg-card border border-border rounded-lg p-1.5 flex sm:flex-col gap-1.5 overflow-x-auto sm:overflow-y-auto hide-scrollbar">
                <div className="hidden sm:block text-[9px] font-semibold text-muted-foreground mb-0.5 px-1.5">{t("host.filterByTime")}</div>
                {hourSlots.map((hour) => {
                  const isActive = selectedHour === hour.value;
                  const resInHour = reservations.filter(r => {
                    const isToday = r.startTime.startsWith(todayDateStr());
                    const hourMatch = hour.value === 'all' || new Date(r.startTime).getHours() === hour.value;
                    return isToday && hourMatch && r.status !== 'CANCELLED' && r.status !== 'COMPLETED';
                  }).length;

                  return (
                    <button
                      key={hour.label}
                      onClick={() => setSelectedHour(hour.value)}
                      className={cn(
"h-10 min-w-0 shrink-0 px-2 rounded-md font-semibold text-[11px] text-left transition-all flex items-center justify-between gap-1 border active:scale-[0.97]",
                        isActive
                          ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/10"
                          : "bg-muted border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{hour.label}</span>
                      {resInHour > 0 && (
                        <span className={cn(
                          "min-w-[16px] text-center px-1 py-0 rounded-full text-[9px] font-black tracking-tight shrink-0",
                          isActive ? "bg-blue-600 text-white" : "bg-muted text-foreground"
                        )}>
                          {resInHour}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Reservations Row List (Right/Main Side on iPad) — one reservation per
                  line, always a horizontal row (no breakpoint dependency, unlike the
                  old xl:flex-row card which never went horizontal on any iPad size).
                  Maximizes how many reservations are visible without scrolling. */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1.5">
                {loading && !initialLoadDone ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3">
                    <ArrowClockwise className="w-8 h-8 animate-spin text-blue-600" />
                    <div className="text-muted-foreground text-xs font-semibold">{t("host.updatingTimeline")}</div>
                  </div>
                ) : filteredReservations.length === 0 ? (
                  <div className="bg-card border border-border border-dashed rounded-xl p-16 text-center">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="font-semibold text-foreground tracking-tight text-sm mb-1">{t("host.noActiveBookings")}</h3>
                    <p className="text-muted-foreground text-xs max-w-xs mx-auto">{t("host.noActiveBookingsDesc")}</p>
                  </div>
                ) : (
                  filteredReservations.map((res) => {
                    const dateObj = new Date(res.startTime);
                    const formattedTime = dateObj.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
                    const hasNote = !!(res.notes || res.internalNote);

                    return (
                      <div
                        key={res.id}
                        className={cn(
                          "bg-card border rounded-lg shadow-sm h-24 px-3 flex items-center gap-2 transition-all hover:shadow-md",
                          res.isVIP ? "border-amber-300 dark:border-amber-800/50 bg-amber-50/20 dark:bg-amber-950/40" : "border-border"
                        )}
                      >
                        {/* Status (top) + Time (bottom) */}
                        <div className="w-16 shrink-0 flex flex-col items-center justify-center gap-1">
 <Badge className={cn("text-[7px] font-semibold px-1 py-0 rounded-sm border leading-tight shrink-0 whitespace-nowrap", getStatusBadgeClass(res.status))}>
                            {res.status}
                          </Badge>
                          <div className="text-sm font-black text-foreground tracking-tight leading-tight">{formattedTime}</div>
                        </div>

                        <div className="w-px h-14 bg-muted shrink-0" />

                        {/* Confirmation code (top) + Name (bottom) — guests read the
                            code off their SMS, so it needs to be as scannable as the
                            name, and stacking keeps the row from getting crowded. */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                          {res.confirmationCode && (
                            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black font-mono tracking-widest px-1.5 py-0.5 rounded-sm shrink-0 w-fit">
                              <Hash className="w-2.5 h-2.5 stroke-[3]" />{res.confirmationCode}
                            </span>
                          )}
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-foreground text-base tracking-tight truncate">{res.customerName}</span>
                            {res.isVIP && <Star weight="fill" className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />}
                          </div>
                        </div>

                        {/* Table (top) + Pax (bottom) — stacked into one narrow column */}
                        <div className="hidden sm:flex flex-col items-center justify-center gap-0.5 w-14 shrink-0">
                          {res.table ? (
                            <span className="block text-center text-blue-600 bg-blue-50 px-1 py-0.5 rounded text-[11px] font-bold truncate w-full">
                              {res.table.identifier}
                            </span>
                          ) : (
                            <span className="block text-center text-[9px] font-bold text-slate-300">{t("host.noTableAssigned")}</span>
                          )}
                          <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                            <Users className="w-3 h-3" /> {res.guestCount}
                          </span>
                        </div>

                        {/* Notes indicator — informational only; the pencil below is the
                            single control that opens the details dialog. Full text
                            stays in that dialog so the row never grows past one line. */}
                        {hasNote && (
                          <span
                            title={res.notes || res.internalNote || ''}
                            className={cn(
                              "hidden sm:flex h-7 w-7 rounded-lg items-center justify-center shrink-0",
                              res.internalNote ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"
                            )}
                          >
                            <NoteBlank className="w-3.5 h-3.5" />
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleOpenEditRes(res)}
                            className="h-11 w-11 bg-muted hover:bg-accent text-foreground rounded-lg transition-all flex items-center justify-center active:scale-[0.97] shrink-0"
                            title={t("host.detailsBtn")}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {res.status === 'PENDING' && (
                            <button
                              onClick={() => handleUpdateResStatus(res.id, 'CONFIRMED', res.status)}
                              className="h-11 px-3 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-semibold text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 active:scale-[0.97] whitespace-nowrap shrink-0"
                            >
                              {t("host.confirmBtn")}
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateResStatus(res.id, 'COMPLETED', res.status)}
                            className="h-11 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] rounded-lg shadow-sm shadow-emerald-600/10 transition-all flex items-center justify-center gap-1.5 active:scale-[0.97] whitespace-nowrap shrink-0"
                          >
                            <Check className="w-4 h-4 stroke-[3]" /> {t("host.seatBtn")}
                          </button>
                          <button
                            onClick={() => handleUpdateResStatus(res.id, 'NO_SHOW', res.status)}
                            className="h-11 w-11 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-800/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center transition-all shrink-0 active:scale-[0.97]"
                            title={t("host.noShowTitle")}
                          >
                            <X className="w-4 h-4 stroke-[2.5]" />
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
            <div className="h-full overflow-y-auto pr-1">
              {loading && !initialLoadDone ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3">
                  <ArrowClockwise className="w-8 h-8 animate-spin text-blue-600" />
                  <div className="text-muted-foreground text-xs font-semibold">{t("host.updatingWaitlist")}</div>
                </div>
              ) : filteredWaitlist.length === 0 ? (
                <div className="bg-card border border-border border-dashed rounded-xl p-16 text-center">
                  <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="font-semibold text-foreground tracking-tight text-sm mb-1">{t("host.waitlistEmpty")}</h3>
                  <p className="text-muted-foreground text-xs max-w-xs mx-auto">{t("host.waitlistEmptyDesc")}</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filteredWaitlist.map((entry) => {
                    const elapsed = getElapsedTime(entry.joinedAt);
                    const isOvertime = entry.quotedWaitTime && (parseFloat(elapsed) > entry.quotedWaitTime);

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "bg-card border border-border rounded-lg shadow-sm h-24 px-3 flex items-center gap-2 transition-all hover:shadow-md",
                          entry.status === 'NOTIFIED' && "border-purple-300 dark:border-purple-800/50 bg-purple-50/20 dark:bg-purple-950/40"
                        )}
                      >
                        {/* Elapsed/wait capsule */}
                        <div className={cn(
                          "w-16 h-16 rounded-lg flex flex-col items-center justify-center text-white shrink-0 shadow-sm",
                          entry.targetDate
                            ? "bg-amber-600"
                            : isOvertime
                              ? "bg-rose-600 animate-pulse"
                              : entry.status === 'NOTIFIED'
                                ? "bg-purple-600"
                                : "bg-blue-600"
                        )}>
                          <span className="text-[8px] font-semibold opacity-75 leading-none mb-1">
                            {entry.targetDate ? t("host.bookWait") : t("host.waiting")}
                          </span>
                          <span className="text-[13px] font-black tracking-tight leading-none">
                            {entry.targetDate ? t("host.date") : elapsed}
                          </span>
                        </div>

                        <div className="w-px h-14 bg-muted shrink-0" />

                        {/* Status + quote (top), Name (middle), Phone (bottom) —
                            stacked so nothing crowds the name, same pattern as the
                            reservation row's code-over-name treatment. */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
 <Badge className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-sm border shrink-0", getStatusBadgeClass(entry.status))}>
                              {entry.status}
                            </Badge>
                            {entry.targetDate && (
                              <Badge className="hidden sm:inline-flex bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 text-[8px] font-semibold px-1.5 py-0.5 rounded-sm shrink-0">
                                {t("host.dateWaitlist")} ({entry.targetDate})
                              </Badge>
                            )}
                            {entry.quotedWaitTime && !entry.targetDate && (
                              <span className="hidden sm:inline text-[10px] font-bold text-muted-foreground tracking-tight shrink-0">
                                ({t("host.quotePrefix")} {entry.quotedWaitTime} {t("host.minSuffix")})
                              </span>
                            )}
                          </div>
                          <span className="font-semibold text-foreground text-base tracking-tight truncate">{entry.customerName}</span>
                          <span className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-muted-foreground truncate">
                            <Phone className="w-3 h-3 shrink-0" /> {entry.customerPhone}
                          </span>
                        </div>

                        {/* Party size */}
                        <div className="hidden sm:flex items-center gap-1 text-xs font-bold text-muted-foreground w-10 shrink-0">
                          <Users className="w-3.5 h-3.5" /> {entry.partySize}
                        </div>

                        {entry.notes && (
                          <span title={entry.notes} className="hidden sm:flex h-7 w-7 rounded-lg items-center justify-center shrink-0 bg-muted text-muted-foreground">
                            <NoteBlank className="w-3.5 h-3.5" />
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleUpdateWaitlistStatus(entry.id, 'NOTIFIED', entry.status)}
                            className="h-11 px-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-100 text-purple-700 dark:text-purple-400 font-semibold text-[10px] rounded-lg transition-all flex items-center justify-center gap-1.5 active:scale-[0.97] whitespace-nowrap shrink-0"
                            title={t("host.notifyReadyBtn")}
                          >
                            <Bell className="w-4 h-4 stroke-[2.5]" /> <span className="hidden md:inline">{t("host.notifyReadyBtn")}</span>
                          </button>
                          <button
                            onClick={() => handleUpdateWaitlistStatus(entry.id, 'SEATED', entry.status)}
                            className="h-11 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] rounded-lg shadow-sm shadow-emerald-600/10 transition-all flex items-center justify-center gap-1.5 active:scale-[0.97] whitespace-nowrap shrink-0"
                          >
                            <Check className="w-4 h-4 stroke-[3]" /> {t("host.seatGuestBtn")}
                          </button>
                          <button
                            onClick={() => handleUpdateWaitlistStatus(entry.id, 'CANCELED', entry.status)}
                            className="h-11 w-11 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-800/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center transition-all shrink-0 active:scale-[0.97]"
                            title={t("host.removeGuestTitle")}
                          >
                            <X className="w-4 h-4 stroke-[2.5]" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* 📱 A. Sleek, Easy Touch Walk-In Entry Modal */}
      <Dialog open={isWalkinModalOpen} onOpenChange={setIsWalkinModalOpen}>
        <DialogContent className="p-0 rounded-2xl overflow-y-auto max-h-[92dvh] border-0 max-w-md w-full bg-card shadow-2xl">
          <form onSubmit={handleAddWalkinSubmit}>
            <div className="bg-slate-900 p-6 text-white">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-400 stroke-[3]" /> {t("host.addToWaitlistTitle")}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs">
                  {t("host.addToWaitlistDesc")}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Customer Name */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.guestNameLabel")}</Label>
                <Input 
                  placeholder={t("host.guestNamePlaceholder")}
                  value={walkinForm.customerName}
                  onChange={(e) => setWalkinForm({...walkinForm, customerName: e.target.value})}
                  required
                  className="h-12 font-bold text-foreground rounded-lg border-border bg-muted focus:bg-card"
                />
              </div>

              {/* Customer Phone */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.phoneLabel")}</Label>
                <Input 
                  type="tel"
                  placeholder={t("host.phonePlaceholder")}
                  value={walkinForm.customerPhone}
                  onChange={(e) => setWalkinForm({...walkinForm, customerPhone: e.target.value})}
                  required
                  className="h-12 font-bold text-foreground rounded-lg border-border bg-muted focus:bg-card"
                />
              </div>

              {/* Touch Preset: Party Size */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.partySizeLabel")} ({walkinForm.partySize} {t("host.guests")})</Label>
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
                          : "bg-muted border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Touch Preset: Quoted Wait Time */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.quotedWaitTimeLabel")} ({walkinForm.quotedWaitTime} {t("host.minSuffix")})</Label>
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
                          : "bg-muted border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {time === '0' ? t("host.noWait") : `${time}${t("host.mSuffix")}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.seatingNotesLabel")}</Label>
                <Textarea 
                  placeholder={t("host.seatingNotesPlaceholder")}
                  value={walkinForm.notes}
                  onChange={(e) => setWalkinForm({...walkinForm, notes: e.target.value})}
                  className="rounded-lg border-border bg-muted focus:bg-card text-xs font-bold min-h-[80px]"
                />
              </div>

            </div>

            <DialogFooter className="p-6 bg-muted border-t border-border flex gap-2 justify-end">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsWalkinModalOpen(false)}
                className="h-12 text-muted-foreground font-bold text-[10px]"
              >
                {t("host.closeBtn")}
              </Button>
              <Button 
                type="button" 
                onClick={(e) => handleAddWalkinSubmit(e, true)}
                className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] px-6 rounded-lg shadow-md shadow-emerald-600/10"
              >
                {t("host.seatInstantlyBtn")}
              </Button>
              <Button 
                type="submit" 
                onClick={(e) => handleAddWalkinSubmit(e, false)}
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[10px] px-6 rounded-lg shadow-md shadow-blue-600/10"
              >
                {t("host.addToWaitlistBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 📱 B. Touch Reservation Details / Add Modal */}
      <Dialog open={isResModalOpen} onOpenChange={setIsResModalOpen}>
        <DialogContent className="p-0 rounded-2xl overflow-y-auto max-h-[92dvh] border-0 max-w-md w-full bg-card shadow-2xl">
          <form onSubmit={handleResSubmit}>
            <div className="bg-slate-900 p-6 text-white">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400 stroke-[3]" />
                  {selectedReservation ? t("host.resDetailsTitle") : t("host.newResTitle")}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs">
                  {selectedReservation ? t("host.resDetailsDesc") : t("host.newResDesc")}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Guest Name */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.guestNameLabel")}</Label>
                <Input 
                  placeholder={t("host.resGuestNamePlaceholder")}
                  value={resForm.customerName}
                  onChange={(e) => setResForm({...resForm, customerName: e.target.value})}
                  required
                  className="h-12 font-bold text-foreground rounded-lg border-border bg-muted focus:bg-card"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.resPhoneLabel")}</Label>
                <Input 
                  placeholder={t("host.resPhonePlaceholder")}
                  value={resForm.customerPhone}
                  onChange={(e) => setResForm({...resForm, customerPhone: e.target.value})}
                  required
                  className="h-12 font-bold text-foreground rounded-lg border-border bg-muted focus:bg-card"
                />
              </div>

              {/* Touch Preset: Guests Count */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.guestCountLabel")} ({resForm.guestCount} {t("host.guests")})</Label>
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
                          : "bg-muted border-border text-muted-foreground hover:bg-muted"
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
                  <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.resTimeLabel")}</Label>
                  <TimeSelect
                    value={resForm.selectedTime}
                    onChange={(v) => setResForm({...resForm, selectedTime: v})}
                    className="w-full h-12 font-bold text-foreground rounded-lg border-border bg-muted focus:bg-card"
                  />
                </div>

                {/* Table Assignment Select */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.assignTableLabel")}</Label>
                  <select 
                    value={resForm.tableId}
                    onChange={(e) => setResForm({...resForm, tableId: e.target.value})}
                    className="h-12 w-full font-bold text-foreground rounded-lg border border-border bg-muted hover:border-ring focus:bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
              <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-muted">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-foreground">{t("host.vipStatusLabel")}</Label>
                  <p className="text-[10px] text-muted-foreground">{t("host.vipStatusDesc")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setResForm({...resForm, isVIP: !resForm.isVIP})}
                  className={cn(
"w-20 h-10 font-semibold text-[10px] rounded-lg transition-all border",
                    resForm.isVIP 
                      ? "bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/10" 
                      : "bg-card border-border text-muted-foreground"
                  )}
                >
                  {resForm.isVIP ? t("host.vipOn") : t("host.vipOff")}
                </button>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.guestNotesLabel")}</Label>
                <Textarea 
                  placeholder={t("host.guestNotesPlaceholder")}
                  value={resForm.notes}
                  onChange={(e) => setResForm({...resForm, notes: e.target.value})}
                  className="rounded-lg border-border bg-muted focus:bg-card text-xs font-bold min-h-[60px]"
                />
              </div>

              {/* Internal Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-semibold text-muted-foreground">{t("host.hostInternalNoteLabel")}</Label>
                <Textarea 
                  placeholder={t("host.hostInternalNotePlaceholder")}
                  value={resForm.internalNote}
                  onChange={(e) => setResForm({...resForm, internalNote: e.target.value})}
                  className="rounded-lg border-border bg-muted focus:bg-card text-xs font-bold min-h-[60px]"
                />
              </div>

            </div>

            <DialogFooter className="p-6 bg-muted border-t border-border">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsResModalOpen(false)}
                className="h-12 text-muted-foreground font-bold text-[10px]"
              >
                {t("host.cancelBtn")}
              </Button>
              <Button 
                type="submit" 
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[10px] px-6 rounded-lg shadow-md shadow-blue-600/10"
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
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <ArrowCounterClockwise className="w-5 h-5 text-blue-400 stroke-[3]" /> {t("host.activityRecoveryLogTitle")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                {t("host.activityRecoveryLogDesc")}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Reservations Resolved History */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground">{t("host.recentlySeatedCancelledBookings")}</h3>
              <div className="space-y-3">
                {reservationsHistory.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-4 bg-muted text-center rounded-lg border border-border">{t("host.noRecentResChanges")}</div>
                ) : (
                  reservationsHistory.map((res) => (
                    <div key={res.id} className="p-3 border border-border rounded-xl bg-muted flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                          {res.customerName}
                          <Badge variant="outline" className="text-[8px] font-semibold px-1">
                            {res.status === 'COMPLETED' ? t("host.seated") : res.status.toLowerCase()}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-bold mt-0.5">
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
                        className="h-8 text-[10px] font-semibold text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100 hover:text-blue-700"
                      >
                        {t("host.undoBtn")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Waitlist Resolved History */}
            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="text-xs font-semibold text-muted-foreground">{t("host.recentlySeatedCancelledWalkins")}</h3>
              <div className="space-y-3">
                {filteredWaitlistHistory.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-4 bg-muted text-center rounded-lg border border-border">{t("host.noRecentWaitlistChanges")}</div>
                ) : (
                  filteredWaitlistHistory.map((entry) => (
                    <div key={entry.id} className="p-3 border border-border rounded-xl bg-muted flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                          {entry.customerName}
                          <Badge variant="outline" className="text-[8px] font-semibold px-1">
                            {entry.status === 'SEATED' ? t("host.seated") : entry.status.toLowerCase()}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-bold mt-0.5">
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
                        className="h-8 text-[10px] font-semibold text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100 hover:text-blue-700"
                      >
                        {t("host.undoBtn")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          <div className="p-6 bg-muted border-t border-border shrink-0">
            <Button 
              variant="outline" 
              onClick={() => setIsHistoryDrawerOpen(false)}
              className="w-full h-12 font-semibold text-xs"
            >
              {t("host.closeActivityLogBtn")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
