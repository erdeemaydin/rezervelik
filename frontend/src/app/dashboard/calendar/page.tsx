'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar as CalendarIcon, Save, Trash2, ChevronLeft, ChevronRight, Star, Settings2, Info, AlertCircle, Check, MousePointer2, Layers, ToggleLeft, ToggleRight, Timer } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DaySetting {
  id: string;
  date: string;
  eventTitle: string | null;
  isReservationEnabled: boolean;
  autoConfirm: boolean;
  maxCapacityOverride: number | null;
}

export default function CalendarSettingsPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [daySettings, setDaySettings] = useState<Record<string, DaySetting>>({});
  const [loading, setLoading] = useState(true);
  
  // Selection Logic
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    eventTitle: '',
    isReservationEnabled: true,
    autoConfirm: false
  });

  useEffect(() => {
    fetchDaySettings();
  }, []);

  const fetchDaySettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/day-settings');
      const settingsMap: Record<string, DaySetting> = {};
      res.data.data.forEach((s: DaySetting) => {
        settingsMap[s.date] = s;
      });
      setDaySettings(settingsMap);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDayClick = (dateStr: string) => {
    if (isBulkMode) {
      const newSelected = new Set(selectedDays);
      if (newSelected.has(dateStr)) {
        newSelected.delete(dateStr);
      } else {
        newSelected.add(dateStr);
      }
      setSelectedDays(newSelected);
      
      // If first selection in bulk mode, grab its data
      if (newSelected.size === 1) {
          populateForm(dateStr);
      }
    } else {
      // Single selection mode
      setSelectedDays(new Set([dateStr]));
      populateForm(dateStr);
    }
  };

  const populateForm = (dateStr: string) => {
    const existing = daySettings[dateStr];
    setForm({
        eventTitle: existing?.eventTitle || '',
        isReservationEnabled: existing ? existing.isReservationEnabled : true,
        autoConfirm: existing ? existing.autoConfirm : false
    });
  };

  const handleSave = async () => {
    if (selectedDays.size === 0) return;
    try {
      await api.post('/day-settings/bulk', {
        dates: Array.from(selectedDays),
        ...form
      });
      toast.success(`Applied to ${selectedDays.size} day(s)`);
      if (isBulkMode) setSelectedDays(new Set());
      fetchDaySettings();
    } catch (err) {
      toast.error('Failed to update settings');
    }
  };

  const formatLocalDate = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    let firstDay = new Date(year, month, 1).getDay();
    let padding = firstDay === 0 ? 6 : firstDay - 1;
    
    const days = [];
    for (let i = 0; i < padding; i++) days.push(<div key={`pad-${i}`} className="h-32 bg-slate-50/20 border border-slate-100/30" />);

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = formatLocalDate(year, month, d);
      const setting = daySettings[dateStr];
      const isSelected = selectedDays.has(dateStr);
      const isToday = new Date().toISOString().split('T')[0] === dateStr;

      let bgColor = "bg-amber-200 hover:bg-amber-300"; // Unified Yellow for Standard
      if (setting) {
          if (!setting.isReservationEnabled) {
              bgColor = "bg-red-100 hover:bg-red-200";
          } else if (setting.autoConfirm) {
              bgColor = "bg-emerald-100 hover:bg-emerald-200";
          }
      }

      days.push(
        <div 
          key={d} 
          onClick={() => handleDayClick(dateStr)}
          className={cn(
            "h-32 border border-slate-200 p-3 cursor-pointer transition-all group relative overflow-hidden",
            bgColor,
            isSelected && "ring-4 ring-slate-900 ring-inset z-10 shadow-2xl scale-[0.98]",
            isToday && !isSelected && "border-blue-600 border-4"
          )}
        >
          <div className="flex justify-between items-start">
            <span className={cn(
                "w-7 h-7 flex items-center justify-center rounded-sm font-black text-xs transition-colors", 
                isSelected ? "bg-slate-900 text-white" : isToday ? "bg-blue-600 text-white" : "text-slate-900"
            )}>{d}</span>
            {isSelected && <div className="bg-slate-900 text-white p-1 rounded-sm shadow-md"><MousePointer2 className="w-3 h-3" /></div>}
            {!isSelected && setting?.eventTitle && <Badge className="bg-slate-900 text-white border-0 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-sm shadow-sm">Event</Badge>}
          </div>
          
          <div className="mt-3 space-y-1.5">
            {setting?.eventTitle && <p className="text-[10px] font-black text-slate-800 truncate leading-none uppercase">{setting.eventTitle}</p>}
            {setting && !setting.isReservationEnabled ? (
                <div className="flex items-center gap-1 text-red-700">
                    <AlertCircle className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase tracking-tighter">Blackout</span>
                </div>
            ) : setting?.autoConfirm ? (
                <div className="flex items-center gap-1 text-emerald-700 font-black uppercase text-[9px] tracking-tighter">
                    <Check className="w-3 h-3 stroke-[4]" /> Auto-Ok
                </div>
            ) : (
                <div className="flex items-center gap-1 text-amber-700 font-black uppercase text-[9px] tracking-tighter opacity-40">
                    <Timer className="w-3 h-3" /> Manual
                </div>
            )}
          </div>
        </div>
      );
    }
    return days;
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Calendar Master</h1>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 italic">Operations Orchestrator</p>
          </div>
          
          <div className="flex items-center gap-6">
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-md border border-slate-200">
                <Button 
                    variant={!isBulkMode ? "default" : "ghost"} 
                    size="sm" 
                    onClick={() => { setIsBulkMode(false); setSelectedDays(new Set()); }}
                    className={cn("h-8 text-[9px] font-black uppercase px-4 rounded-sm", !isBulkMode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                >
                    Single Edit
                </Button>
                <Button 
                    variant={isBulkMode ? "default" : "ghost"} 
                    size="sm" 
                    onClick={() => { setIsBulkMode(true); setSelectedDays(new Set()); }}
                    className={cn("h-8 text-[9px] font-black uppercase px-4 rounded-sm", isBulkMode ? "bg-blue-600 text-white shadow-sm" : "text-slate-500")}
                >
                    <Layers className="w-3 h-3 mr-1.5" /> Bulk Mode
                </Button>
            </div>

            <div className="flex items-center gap-4 bg-white p-1 rounded-md shadow-sm border border-slate-200">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-sm hover:bg-slate-100" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
                    <ChevronLeft className="h-4 h-4" />
                </Button>
                <span className="font-black text-sm min-w-[150px] text-center uppercase tracking-widest text-slate-800">
                    {currentMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-sm hover:bg-slate-100" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
                    <ChevronRight className="h-4 h-4" />
                </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
            <Card className="xl:col-span-3 border-slate-200 shadow-sm rounded-md overflow-hidden bg-white ring-1 ring-slate-200">
                <div className="grid grid-cols-7 bg-slate-900 text-white font-black text-[9px] uppercase tracking-[0.4em] text-center py-4">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day}>{day}</div>)}
                </div>
                <CardContent className="p-0 grid grid-cols-7">
                    {renderCalendar()}
                </CardContent>
            </Card>

            <div className="sticky top-6 flex flex-col gap-4">
                {selectedDays.size > 0 ? (
                    <Card className="border-slate-200 shadow-xl rounded-md overflow-hidden animate-in slide-in-from-right duration-300">
                        <CardHeader className={cn("p-6 text-white", isBulkMode ? "bg-blue-900" : "bg-slate-900")}>
                            <div className="flex items-center justify-between mb-2">
                                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    {isBulkMode ? <Layers className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
                                    {isBulkMode ? 'Bulk Update' : 'Day Settings'}
                                </CardTitle>
                                <Badge className="bg-white/20 text-white border-0 font-black text-[10px]">{selectedDays.size} {selectedDays.size === 1 ? 'Day' : 'Days'}</Badge>
                            </div>
                            <CardDescription className="text-white/50 text-[9px] font-bold uppercase tracking-widest leading-relaxed">
                                {isBulkMode ? 'Applying logic across multiple dates.' : 'Adjusting operational logic for this date.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-8 bg-white">
                            <div className="space-y-2">
                                <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Notice/Event Title</Label>
                                <Input placeholder="..." value={form.eventTitle} onChange={e => setForm({...form, eventTitle: e.target.value})} className="h-10 text-xs font-bold bg-slate-50 border-slate-200 rounded-sm" />
                            </div>

                            <div className="space-y-6 py-4 border-y border-slate-50">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-black text-slate-800 uppercase">Allow Bookings</Label>
                                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Customer Side Requests</p>
                                    </div>
                                    <Checkbox 
                                        checked={form.isReservationEnabled} 
                                        onCheckedChange={(c) => {
                                            const enabled = !!c;
                                            setForm(prev => ({...prev, isReservationEnabled: enabled, autoConfirm: enabled ? prev.autoConfirm : false}));
                                        }} 
                                    />
                                </div>

                                <div className={cn("flex items-center justify-between transition-opacity", !form.isReservationEnabled && "opacity-30")}>
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-black text-slate-800 uppercase">Auto-Confirm</Label>
                                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Skip Review Queue</p>
                                    </div>
                                    <Checkbox 
                                        disabled={!form.isReservationEnabled}
                                        checked={form.autoConfirm} 
                                        onCheckedChange={(c) => setForm({...form, autoConfirm: !!c})} 
                                    />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                {isBulkMode && (
                                    <Button variant="outline" onClick={() => setSelectedDays(new Set())} className="flex-1 h-12 text-[10px] font-black uppercase rounded-sm border-slate-200 text-slate-400">Clear</Button>
                                )}
                                <Button onClick={handleSave} className="flex-[2] h-12 bg-slate-900 hover:bg-black text-white font-black text-[10px] uppercase rounded-sm shadow-xl transition-all active:scale-95">
                                    {isBulkMode ? `Save ${selectedDays.size} Days` : 'Apply Settings'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="h-96 flex flex-col items-center justify-center text-center p-8 bg-white rounded-md border-2 border-dashed border-slate-200 shadow-inner">
                        <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center mb-6">
                            {isBulkMode ? <Layers className="h-8 w-8 text-slate-200" /> : <MousePointer2 className="h-8 w-8 text-slate-200" />}
                        </div>
                        <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.2em] leading-relaxed px-4">
                            {isBulkMode ? 'Select multiple days to perform bulk operations' : 'Select a date on the calendar to adjust settings'}
                        </p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </AdminLayout>
  );
}
