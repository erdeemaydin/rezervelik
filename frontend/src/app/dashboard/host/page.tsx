'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Users, Clock, Search, Calendar, Plus, Star, Phone, Check, X, Bell, 
  ChevronRight, RefreshCw, Smile, ArrowRight, UserCheck, Flame, Leaf, HelpCircle, Utensils
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
}

export default function HostConsolePage() {
  const [activeTab, setActiveTab] = useState<'reservations' | 'waitlist'>('reservations');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
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
      const [resRes, waitlistRes, tablesRes, catRes] = await Promise.all([
        api.get('/reservations'),
        api.get('/wait-time/entries'),
        api.get('/tables'),
        api.get('/categories')
      ]);
      setReservations(resRes.data.data);
      // Backend status endpoint filters to only active, let's keep all active queue items
      setWaitlist(waitlistRes.data.data);
      setTables(tablesRes.data.data);
      setCategories(catRes.data.data);
    } catch (error) {
      toast.error('Failed to load host console data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Switch Reservation Status
  const handleUpdateResStatus = async (id: string, status: string) => {
    try {
      await api.put(`/reservations/${id}/status`, { status });
      toast.success(`Reservation marked as ${status.toLowerCase()}`);
      fetchData();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  // Switch Waitlist Status
  const handleUpdateWaitlistStatus = async (entryId: string, status: string) => {
    try {
      await api.put(`/wait-time/entries/${entryId}/status`, { status });
      toast.success(`Guest status updated`);
      fetchData();
    } catch (err) {
      toast.error('Failed to update waitlist entry');
    }
  };

  // Create Walk-in Waitlist Entry
  const handleAddWalkinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/wait-time/entries', {
        customerName: walkinForm.customerName,
        customerPhone: walkinForm.customerPhone,
        partySize: parseInt(walkinForm.partySize),
        quotedWaitTime: parseInt(walkinForm.quotedWaitTime),
        notes: walkinForm.notes
      });
      toast.success('Added guest to waitlist');
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
      toast.error(err.response?.data?.error || 'Failed to add guest');
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
        toast.success('Reservation updated');
      } else {
        await api.post('/reservations', payload);
        toast.success('Reservation created');
      }
      setIsResModalOpen(false);
      setSelectedReservation(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save reservation');
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

  const filteredWaitlist = useMemo(() => {
    return waitlist.filter(entry => {
      const nameMatch = entry.customerName.toLowerCase().includes(searchQuery.toLowerCase());
      const phoneMatch = entry.customerPhone.includes(searchQuery);
      return nameMatch || phoneMatch;
    });
  }, [waitlist, searchQuery]);

  // Hourly slots for navigation (e.g. 11:00 to 23:00)
  const hourSlots = [
    { label: 'All Slots', value: 'all' as const },
    { label: '11:00 AM', value: 11 },
    { label: '12:00 PM', value: 12 },
    { label: '1:00 PM', value: 13 },
    { label: '2:00 PM', value: 14 },
    { label: '3:00 PM', value: 15 },
    { label: '4:00 PM', value: 16 },
    { label: '5:00 PM', value: 17 },
    { label: '6:00 PM', value: 18 },
    { label: '7:00 PM', value: 19 },
    { label: '8:00 PM', value: 20 },
    { label: '9:00 PM', value: 21 },
    { label: '10:00 PM', value: 22 },
    { label: '11:00 PM', value: 23 }
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
    <AdminLayout>
      <div className="flex flex-col gap-6 max-w-7xl mx-auto h-[calc(100vh-140px)]">
        
        {/* Main Header / iPad Top Panel */}
        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-xl">
              <Smile className="w-8 h-8 text-white stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                Host Console
                <Badge variant="outline" className="text-[10px] font-black border-blue-400 text-blue-400 uppercase tracking-widest px-2 py-0.5 rounded-sm">iPad Mode</Badge>
              </h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mt-1">Podium Service Desk • Active Floor Sync</p>
            </div>
          </div>

          {/* Large Screen Real Estate Toggle Switch & Quick Action Button */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-800 p-1.5 rounded-xl border border-slate-700 flex">
              <button 
                onClick={() => { setActiveTab('reservations'); }}
                className={cn(
                  "px-6 h-12 text-sm font-black uppercase rounded-lg transition-all flex items-center gap-2 border border-transparent",
                  activeTab === 'reservations' 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 border-blue-500" 
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Calendar className="w-4 h-4" /> Reservations ({reservations.filter(r => r.startTime.startsWith(new Date().toISOString().split('T')[0]) && r.status !== 'CANCELLED' && r.status !== 'COMPLETED').length})
              </button>
              <button 
                onClick={() => { setActiveTab('waitlist'); }}
                className={cn(
                  "px-6 h-12 text-sm font-black uppercase rounded-lg transition-all flex items-center gap-2 border border-transparent",
                  activeTab === 'waitlist' 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 border-blue-500" 
                    : "text-slate-400 hover:text-white"
                )}
              >
                <Clock className="w-4 h-4" /> Waitlist Queue ({waitlist.length})
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
              size="lg" 
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-14 px-8 font-black uppercase tracking-wider text-xs rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5 mr-2 stroke-[3]" />
              {activeTab === 'reservations' ? 'Book Table' : 'Add Walk-in'}
            </Button>
          </div>
        </div>

        {/* Global Filter Bar */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4 shrink-0">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input 
              placeholder="Search by customer name, phone, notes or table..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 text-sm font-bold bg-slate-50 border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-xl transition-all"
            />
          </div>

          <Button 
            variant="outline" 
            onClick={fetchData} 
            disabled={loading}
            className="h-14 w-14 shrink-0 rounded-xl border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw className={cn("w-5 h-5 text-slate-600", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Content Pane */}
        <div className="flex-1 min-h-0 overflow-hidden bg-slate-50 border border-slate-200 rounded-2xl shadow-inner p-4">
          
          {/* 1. RESERVATIONS VIEW */}
          {activeTab === 'reservations' && (
            <div className="flex flex-col md:flex-row gap-6 h-full">
              
              {/* Hour Slot Navigator Panel (Left Side on iPad) */}
              <div className="w-full md:w-56 shrink-0 bg-white border border-slate-200 rounded-xl p-3 flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto hide-scrollbar">
                <div className="hidden md:block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2 px-3">Filter by Time</div>
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
                        "h-12 shrink-0 px-4 rounded-lg font-black text-xs uppercase text-left transition-all flex items-center justify-between border",
                        isActive 
                          ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/10" 
                          : "bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      <span>{hour.label}</span>
                      {resInHour > 0 && (
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black tracking-tight",
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
              <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
                {loading ? (
                  <div className="h-64 flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                    <div className="text-slate-400 text-xs font-black uppercase tracking-widest">Updating timeline...</div>
                  </div>
                ) : filteredReservations.length === 0 ? (
                  <div className="bg-white border border-slate-200 border-dashed rounded-xl p-16 text-center">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm mb-1">No Active Bookings</h3>
                    <p className="text-slate-400 text-xs max-w-xs mx-auto">There are no matching or active reservations for the selected time window.</p>
                  </div>
                ) : (
                  filteredReservations.map((res) => {
                    const dateObj = new Date(res.startTime);
                    const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    return (
                      <div 
                        key={res.id} 
                        className={cn(
                          "bg-white border rounded-xl shadow-sm p-5 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:shadow-md",
                          res.isVIP ? "border-amber-300 bg-amber-50/20" : "border-slate-200"
                        )}
                      >
                        {/* Left Section: Time & Guest Info */}
                        <div className="flex gap-4">
                          <div className="h-16 w-20 bg-slate-900 text-white rounded-xl flex flex-col items-center justify-center shrink-0">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">Time</span>
                            <span className="text-lg font-black tracking-tight leading-none">{formattedTime}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-slate-900 text-sm uppercase tracking-tight">{res.customerName}</span>
                              {res.isVIP && (
                                <Badge className="bg-amber-500 text-white border-transparent text-[8px] font-black uppercase px-2 py-0.5 rounded-sm">
                                  <Star className="w-2.5 h-2.5 mr-1 fill-white" /> VIP
                                </Badge>
                              )}
                              <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-sm border", getStatusBadgeClass(res.status))}>
                                {res.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {res.guestCount} Guests</span>
                              {res.table && <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded"><Utensils className="w-3.5 h-3.5" /> Table {res.table.identifier}</span>}
                              {!res.table && <span className="flex items-center gap-1 text-slate-400">No table assigned</span>}
                            </div>
                            {res.notes && (
                              <p className="text-slate-500 text-[11px] font-medium leading-relaxed bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 mt-2 max-w-lg">
                                <span className="font-bold text-slate-700">Guest:</span> {res.notes}
                              </p>
                            )}
                            {res.internalNote && (
                              <p className="text-amber-800 text-[11px] font-medium leading-relaxed bg-amber-50/50 px-3 py-1.5 rounded-lg border border-amber-100 mt-1 max-w-lg">
                                <span className="font-bold text-amber-900">Host Note:</span> {res.internalNote}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right Section: Touch Actions */}
                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 self-stretch sm:self-center justify-end">
                          <button
                            onClick={() => handleOpenEditRes(res)}
                            className="flex-1 sm:flex-none h-14 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider rounded-lg transition-all flex items-center justify-center gap-1 border border-slate-200"
                          >
                            Details
                          </button>
                          {res.status === 'PENDING' && (
                            <button
                              onClick={() => handleUpdateResStatus(res.id, 'CONFIRMED')}
                              className="flex-1 sm:flex-none h-14 px-4 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 font-black uppercase text-[10px] tracking-wider rounded-lg transition-all flex items-center justify-center gap-1"
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateResStatus(res.id, 'COMPLETED')}
                            className="flex-1 sm:flex-none h-14 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-wider rounded-lg shadow-md shadow-emerald-600/10 transition-all flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4 stroke-[3]" /> Seat
                          </button>
                          <button
                            onClick={() => handleUpdateResStatus(res.id, 'NO_SHOW')}
                            className="h-14 w-14 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition-all shrink-0"
                            title="No Show"
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
            <div className="h-full overflow-y-auto space-y-4 pr-1">
              {loading ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                  <div className="text-slate-400 text-xs font-black uppercase tracking-widest">Updating waitlist queue...</div>
                </div>
              ) : filteredWaitlist.length === 0 ? (
                <div className="bg-white border border-slate-200 border-dashed rounded-xl p-16 text-center">
                  <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm mb-1">Waitlist is Empty</h3>
                  <p className="text-slate-400 text-xs max-w-xs mx-auto">There are currently no active walk-ins waiting for a table.</p>
                </div>
              ) : (
                filteredWaitlist.map((entry) => {
                  const elapsed = getElapsedTime(entry.joinedAt);
                  const isOvertime = entry.quotedWaitTime && (parseFloat(elapsed) > entry.quotedWaitTime);

                  return (
                    <div 
                      key={entry.id} 
                      className={cn(
                        "bg-white border border-slate-200 rounded-xl shadow-sm p-5 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:shadow-md",
                        entry.status === 'NOTIFIED' && "border-purple-300 bg-purple-50/20"
                      )}
                    >
                      {/* Left: Info */}
                      <div className="flex gap-4">
                        <div className={cn(
                          "h-16 w-20 rounded-xl flex flex-col items-center justify-center text-white shrink-0 shadow-sm",
                          isOvertime 
                            ? "bg-rose-600 animate-pulse" 
                            : entry.status === 'NOTIFIED'
                              ? "bg-purple-600"
                              : "bg-blue-600"
                        )}>
                          <span className="text-[10px] font-black uppercase opacity-75 tracking-wider leading-none mb-1">Waiting</span>
                          <span className="text-lg font-black tracking-tight leading-none">{elapsed}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-slate-800 text-sm uppercase tracking-tight">{entry.customerName}</span>
                            <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-sm border", getStatusBadgeClass(entry.status))}>
                              {entry.status}
                            </Badge>
                            {entry.quotedWaitTime && (
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                (Quote: {entry.quotedWaitTime} min)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 uppercase tracking-wide">
                            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {entry.partySize} Guests</span>
                            <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {entry.customerPhone}</span>
                          </div>
                          {entry.notes && (
                            <p className="text-slate-500 text-[11px] font-medium leading-relaxed bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 mt-2 max-w-lg">
                              <span className="font-bold text-slate-700">Note:</span> {entry.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Touch actions */}
                      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 self-stretch sm:self-center justify-end">
                        <button
                          onClick={() => handleUpdateWaitlistStatus(entry.id, 'NOTIFIED')}
                          className="flex-1 sm:flex-none h-14 px-5 bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 font-black uppercase text-[10px] tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5"
                        >
                          <Bell className="w-4 h-4 stroke-[2.5]" /> Notify Ready
                        </button>
                        <button
                          onClick={() => handleUpdateWaitlistStatus(entry.id, 'SEATED')}
                          className="flex-1 sm:flex-none h-14 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-wider rounded-lg shadow-md shadow-emerald-600/10 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Check className="w-4 h-4 stroke-[3]" /> Seat Guest
                        </button>
                        <button
                          onClick={() => handleUpdateWaitlistStatus(entry.id, 'CANCELED')}
                          className="h-14 w-14 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center transition-all shrink-0"
                          title="Remove Guest"
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
        <DialogContent className="p-0 rounded-2xl overflow-hidden border-0 max-w-md w-full bg-white shadow-2xl">
          <form onSubmit={handleAddWalkinSubmit}>
            <div className="bg-slate-900 p-6 text-white">
              <DialogHeader>
                <DialogTitle className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-400 stroke-[3]" /> Add to Waitlist
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs">
                  Create a new walk-in queue record. Est. wait auto-calculates.
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Customer Name */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Guest Name</Label>
                <Input 
                  placeholder="e.g. John Doe"
                  value={walkinForm.customerName}
                  onChange={(e) => setWalkinForm({...walkinForm, customerName: e.target.value})}
                  required
                  className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Customer Phone */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Phone Number</Label>
                <Input 
                  type="tel"
                  placeholder="e.g. 555-0199"
                  value={walkinForm.customerPhone}
                  onChange={(e) => setWalkinForm({...walkinForm, customerPhone: e.target.value})}
                  required
                  className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Touch Preset: Party Size */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Party Size ({walkinForm.partySize} Guests)</Label>
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
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Quoted Wait Time ({walkinForm.quotedWaitTime} min)</Label>
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
                      {time === '0' ? 'No Wait' : `${time}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Seating Notes / Allergens (Optional)</Label>
                <Textarea 
                  placeholder="e.g. Window booth request, wheelchair access required"
                  value={walkinForm.notes}
                  onChange={(e) => setWalkinForm({...walkinForm, notes: e.target.value})}
                  className="rounded-lg border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold min-h-[80px]"
                />
              </div>

            </div>

            <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsWalkinModalOpen(false)}
                className="h-12 text-slate-500 font-bold uppercase text-[10px] tracking-wider"
              >
                Close
              </Button>
              <Button 
                type="submit" 
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] tracking-wider px-6 rounded-lg shadow-md shadow-blue-600/10"
              >
                Create Entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 📱 B. Touch Reservation Details / Add Modal */}
      <Dialog open={isResModalOpen} onOpenChange={setIsResModalOpen}>
        <DialogContent className="p-0 rounded-2xl overflow-hidden border-0 max-w-md w-full bg-white shadow-2xl">
          <form onSubmit={handleResSubmit}>
            <div className="bg-slate-900 p-6 text-white">
              <DialogHeader>
                <DialogTitle className="text-base font-black uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400 stroke-[3]" />
                  {selectedReservation ? 'Reservation Details' : 'New Reservation'}
                </DialogTitle>
                <DialogDescription className="text-slate-400 text-xs">
                  {selectedReservation ? 'View customer details and assign table allocation.' : 'Create a booking for today.'}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="p-6 space-y-6">
              
              {/* Guest Name */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Guest Name</Label>
                <Input 
                  placeholder="e.g. Mary Jane"
                  value={resForm.customerName}
                  onChange={(e) => setResForm({...resForm, customerName: e.target.value})}
                  required
                  className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Phone */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Phone</Label>
                <Input 
                  placeholder="e.g. 555-9011"
                  value={resForm.customerPhone}
                  onChange={(e) => setResForm({...resForm, customerPhone: e.target.value})}
                  required
                  className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Touch Preset: Guests Count */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Guest Count ({resForm.guestCount} Guests)</Label>
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
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Reservation Time</Label>
                  <Input 
                    type="time"
                    value={resForm.selectedTime}
                    onChange={(e) => setResForm({...resForm, selectedTime: e.target.value})}
                    required
                    className="h-12 font-bold text-slate-800 rounded-lg border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>

                {/* Table Assignment Select */}
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Assign Table</Label>
                  <select 
                    value={resForm.tableId}
                    onChange={(e) => setResForm({...resForm, tableId: e.target.value})}
                    className="h-12 w-full font-bold text-slate-800 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white px-3 text-sm outline-none"
                  >
                    <option value="none">None (Hold at door)</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.identifier} ({t.capacity} Pax)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* VIP Toggle Switch-like layout */}
              <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50">
                <div className="space-y-0.5">
                  <Label className="text-xs font-black uppercase text-slate-800">VIP Status Indicator</Label>
                  <p className="text-[10px] text-slate-400">High priority greeting flags.</p>
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
                  {resForm.isVIP ? 'VIP On' : 'VIP Off'}
                </button>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Guest Notes</Label>
                <Textarea 
                  placeholder="e.g. Vegetarian, celebrating birthday"
                  value={resForm.notes}
                  onChange={(e) => setResForm({...resForm, notes: e.target.value})}
                  className="rounded-lg border-slate-200 bg-slate-50 focus:bg-white text-xs font-bold min-h-[60px]"
                />
              </div>

              {/* Internal Notes */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Host Internal Note</Label>
                <Textarea 
                  placeholder="Internal staff details..."
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
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="h-12 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] tracking-wider px-6 rounded-lg shadow-md shadow-blue-600/10"
              >
                {selectedReservation ? 'Save Changes' : 'Create Booking'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  );
}
