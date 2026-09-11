'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from "@/i18n/provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, FloppyDisk, Trash, CaretLeft, CaretRight, Star, GearSix, Info, WarningCircle, Check, Cursor, Stack, ToggleLeft, ToggleRight, Timer } from '@phosphor-icons/react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DaySetting {
  id: string;
  date: string;
  eventTitle: string | null;
  isReservationEnabled: boolean;
  isFullyBooked: boolean;
  autoConfirm: boolean;
  maxCapacityOverride: number | null;
  allowOverbookingOverride: boolean | null;
  overbookingMaxExtraCoversOverride: number | null;
  overbookingMaxExtraReservationsOverride: number | null;
}

// Tri-state UI for allowOverbookingOverride (null = inherit the restaurant-wide
// RestaurantSettings.allowOverbooking, not a checkbox — see getEffectiveOverbookingConfig).
type OverbookingOverrideChoice = 'INHERIT' | 'ON' | 'OFF';
const isPositiveInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

export default function CalendarSettingsPage() {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [daySettings, setDaySettings] = useState<Record<string, DaySetting>>({});
  const [loading, setLoading] = useState(true);
  
  // Selection Logic
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    eventTitle: '',
    isReservationEnabled: true,
    isFullyBooked: false,
    autoConfirm: false,
    overbookingOverride: 'INHERIT' as OverbookingOverrideChoice,
    overbookingMaxExtraCoversOverride: null as number | null,
    overbookingMaxExtraReservationsOverride: null as number | null
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

  const formatLocalDate = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
      
      if (newSelected.size === 1) {
          populateForm(dateStr);
      }
    } else {
      setSelectedDays(new Set([dateStr]));
      populateForm(dateStr);
    }
  };

  const populateForm = (dateStr: string) => {
    const existing = daySettings[dateStr];
    setForm({
        eventTitle: existing?.eventTitle || '',
        isReservationEnabled: existing ? existing.isReservationEnabled : true,
        isFullyBooked: existing ? existing.isFullyBooked : false,
        autoConfirm: existing ? existing.autoConfirm : false,
        overbookingOverride: existing?.allowOverbookingOverride === true ? 'ON' : existing?.allowOverbookingOverride === false ? 'OFF' : 'INHERIT',
        overbookingMaxExtraCoversOverride: existing?.overbookingMaxExtraCoversOverride ?? null,
        overbookingMaxExtraReservationsOverride: existing?.overbookingMaxExtraReservationsOverride ?? null
    });
  };

  const handleSave = async () => {
    if (selectedDays.size === 0) return;
    // Mirrors the backend rule (resolveOverbookingOverride in daySettingController):
    // turning the day-level override "on" requires both of its own caps.
    if (form.overbookingOverride === 'ON' && (!isPositiveInt(form.overbookingMaxExtraCoversOverride) || !isPositiveInt(form.overbookingMaxExtraReservationsOverride))) {
      toast.error(t("calendar.panel.overbookingOverrideRequiresCaps"));
      return;
    }
    try {
      const { overbookingOverride, overbookingMaxExtraCoversOverride, overbookingMaxExtraReservationsOverride, ...rest } = form;
      await api.post('/day-settings/bulk', {
        dates: Array.from(selectedDays),
        ...rest,
        allowOverbookingOverride: overbookingOverride === 'ON' ? true : overbookingOverride === 'OFF' ? false : null,
        overbookingMaxExtraCoversOverride: overbookingOverride === 'ON' ? overbookingMaxExtraCoversOverride : undefined,
        overbookingMaxExtraReservationsOverride: overbookingOverride === 'ON' ? overbookingMaxExtraReservationsOverride : undefined
      });
      toast.success(`${t("calendar.toast.appliedDaysPrefix")}${selectedDays.size}${t("calendar.toast.appliedDaysSuffix")}`);
      if (isBulkMode) setSelectedDays(new Set());
      fetchDaySettings();
    } catch (err) {
      toast.error(t("calendar.toast.updateFailed"));
    }
  };

  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const padding = firstDay === 0 ? 6 : firstDay - 1;
    
    const days = [];
    for (let i = 0; i < padding; i++) days.push(<div key={`pad-${i}`} className="h-32 bg-slate-50/20 border border-border/30" />);

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = formatLocalDate(new Date(year, month, d));
      const setting = daySettings[dateStr];
      const isSelected = selectedDays.has(dateStr);
      const isToday = formatLocalDate(new Date()) === dateStr;

      let bgColor = "bg-amber-200 hover:bg-amber-300"; 
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
            "h-32 border border-border p-3 cursor-pointer transition-all group relative overflow-hidden",
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
            {isSelected && <div className="bg-slate-900 text-white p-1 rounded-sm shadow-md"><Cursor className="w-3 h-3" /></div>}
            {!isSelected && setting?.eventTitle && <Badge className="bg-slate-900 text-white border-0 text-[8px] font-semibold px-1.5 py-0.5 rounded-sm shadow-sm">{t("calendar.badge.event")}</Badge>}
          </div>
          
          <div className="mt-3 space-y-1.5">
            {setting?.eventTitle && <p className="text-[10px] font-semibold text-slate-800 truncate leading-none">{setting.eventTitle}</p>}
            {setting && !setting.isReservationEnabled ? (
                <div className="flex items-center gap-1 text-red-700">
                    <WarningCircle className="w-3 h-3" />
                    <span className="text-[9px] font-semibold tracking-tighter">{t("calendar.status.blackout")}</span>
                </div>
            ) : setting?.autoConfirm ? (
                <div className="flex items-center gap-1 text-emerald-700 font-semibold text-[9px] tracking-tighter">
                    <Check className="w-3 h-3 stroke-[4]" /> {t("calendar.status.autoOk")}
                </div>
            ) : (
                <div className="flex items-center gap-1 text-amber-700 font-semibold text-[9px] tracking-tighter opacity-40">
                    <Timer className="w-3 h-3" /> {t("calendar.status.manual")}
                </div>
            )}
          </div>
        </div>
      );
    }
    return days;
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t("calendar.header.title")}</h1>
            <p className="text-[10px] text-slate-400 font-semibold tracking-[0.2em] mt-1 italic">{t("calendar.header.subtitle")}</p>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-6 mt-2">
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-md border border-border">
                    <Button 
                        variant={!isBulkMode ? "default" : "ghost"} 
                        size="sm" 
                        onClick={() => { setIsBulkMode(false); setSelectedDays(new Set()); }}
 className={cn("h-8 text-[9px] font-semibold px-4 rounded-sm", !isBulkMode ?"bg-white text-slate-900 shadow-sm":"text-slate-500")}
                    >
                        {t("calendar.buttons.singleEdit")}
                    </Button>
                    <Button 
                        variant={isBulkMode ? "default" : "ghost"} 
                        size="sm" 
                        onClick={() => { setIsBulkMode(true); setSelectedDays(new Set()); }}
 className={cn("h-8 text-[9px] font-semibold px-4 rounded-sm", isBulkMode ?"bg-blue-600 text-white shadow-sm":"text-slate-500")}
                    >
                        <Stack className="w-3 h-3 mr-1.5" /> {t("calendar.buttons.bulkMode")}
                    </Button>
                </div>

                <div className="flex items-center gap-4 bg-white p-1 rounded-md shadow-sm border border-border">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-sm hover:bg-slate-100" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
                        <CaretLeft className="h-4 h-4" />
                    </Button>
                    <span className="font-semibold text-sm min-w-[150px] text-center text-slate-800">
                        {currentMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-sm hover:bg-slate-100" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
                        <CaretRight className="h-4 h-4" />
                    </Button>
                </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
            <Card className="xl:col-span-3 border-border shadow-sm rounded-md overflow-hidden bg-white ring-1 ring-slate-200">
                <div className="grid grid-cols-7 bg-slate-900 text-white font-semibold text-[9px] tracking-[0.4em] text-center py-4">
                    {[t("calendar.days.mon"), t("calendar.days.tue"), t("calendar.days.wed"), t("calendar.days.thu"), t("calendar.days.fri"), t("calendar.days.sat"), t("calendar.days.sun")].map(day => <div key={day}>{day}</div>)}
                </div>
                <CardContent className="p-0 grid grid-cols-7">
                    {renderCalendar()}
                </CardContent>
            </Card>

            <div className="sticky top-6 flex flex-col gap-4">
                {selectedDays.size > 0 ? (
                    <Card className="border-border shadow-xl rounded-md overflow-hidden animate-in slide-in-from-right duration-300">
                        <CardHeader className={cn("p-6 text-white", isBulkMode ? "bg-blue-900" : "bg-slate-900")}>
                            <div className="flex items-center justify-between mb-2">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                    {isBulkMode ? <Stack className="h-4 w-4" /> : <GearSix className="h-4 w-4" />}
                                    {isBulkMode ? t("calendar.panel.bulkUpdate") : t("calendar.panel.daySettings")}
                                </CardTitle>
                                <Badge className="bg-white/20 text-white border-0 font-black text-[10px]">{selectedDays.size} {selectedDays.size === 1 ? t("calendar.panel.day") : t("calendar.panel.days")}</Badge>
                            </div>
                            <CardDescription className="text-white/50 text-[9px] font-bold leading-relaxed">
                                {isBulkMode ? t("calendar.panel.bulkDescription") : t("calendar.panel.singleDescription")}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6 space-y-8 bg-white">
                            <div className="space-y-2">
                                <Label className="text-[9px] font-semibold text-slate-400">{t("calendar.panel.eventTitle")}</Label>
                                <Input placeholder="..." value={form.eventTitle} onChange={e => setForm({...form, eventTitle: e.target.value})} className="h-10 text-xs font-bold bg-slate-50 border-border rounded-sm" />
                            </div>

                             <div className="space-y-6 py-4 border-y border-slate-50">
                                 <div className="flex items-center justify-between">
                                     <div className="space-y-0.5">
                                         <Label className="text-xs font-semibold text-slate-800">{t("calendar.panel.allowBookings")}</Label>
                                         <p className="text-[8px] text-slate-400 font-bold tracking-tighter">{t("calendar.panel.allowBookingsDesc")}</p>
                                     </div>
                                     <Checkbox 
                                         checked={form.isReservationEnabled} 
                                         onCheckedChange={(c) => {
                                             const enabled = !!c;
                                             setForm(prev => ({
                                                 ...prev, 
                                                 isReservationEnabled: enabled, 
                                                 isFullyBooked: enabled ? false : prev.isFullyBooked,
                                                 autoConfirm: enabled ? prev.autoConfirm : false
                                             }));
                                         }} 
                                     />
                                 </div>
 
                                 <div className="flex items-center justify-between">
                                     <div className="space-y-0.5">
                                         <Label className="text-xs font-semibold text-slate-800 font-bold text-blue-600">{t("calendar.panel.waitlist")}</Label>
                                         <p className="text-[8px] text-slate-400 font-bold tracking-tighter">{t("calendar.panel.waitlistDesc")}</p>
                                     </div>
                                     <Checkbox 
                                         checked={form.isFullyBooked} 
                                         onCheckedChange={(c) => {
                                             const isFull = !!c;
                                             setForm(prev => ({
                                                 ...prev, 
                                                 isFullyBooked: isFull, 
                                                 isReservationEnabled: isFull ? false : prev.isReservationEnabled,
                                                 autoConfirm: isFull ? false : prev.autoConfirm
                                             }));
                                         }} 
                                     />
                                 </div>
 
                                 <div className={cn("flex items-center justify-between transition-opacity", !form.isReservationEnabled && "opacity-30")}>
                                     <div className="space-y-0.5">
                                         <Label className="text-xs font-semibold text-slate-800">{t("calendar.panel.autoConfirm")}</Label>
                                         <p className="text-[8px] text-slate-400 font-bold tracking-tighter">{t("calendar.panel.autoConfirmDesc")}</p>
                                     </div>
                                     <Checkbox
                                         disabled={!form.isReservationEnabled}
                                         checked={form.autoConfirm}
                                         onCheckedChange={(c) => setForm({...form, autoConfirm: !!c})}
                                     />
                                 </div>

                                 <div className="space-y-3 pt-2">
                                     <div className="space-y-0.5">
                                         <Label className="text-xs font-semibold text-slate-800">{t("calendar.panel.overbookingOverride")}</Label>
                                         <p className="text-[8px] text-slate-400 font-bold tracking-tighter">{t("calendar.panel.overbookingOverrideDesc")}</p>
                                     </div>
                                     <Select
                                         value={form.overbookingOverride}
                                         onValueChange={(v) => setForm(prev => ({ ...prev, overbookingOverride: (v || 'INHERIT') as OverbookingOverrideChoice }))}
                                     >
                                         <SelectTrigger className="h-9 text-xs font-bold rounded-sm w-full">
                                             <SelectValue />
                                         </SelectTrigger>
                                         <SelectContent>
                                             <SelectItem value="INHERIT" className="text-xs">{t("calendar.panel.overbookingInherit")}</SelectItem>
                                             <SelectItem value="ON" className="text-xs">{t("calendar.panel.overbookingOn")}</SelectItem>
                                             <SelectItem value="OFF" className="text-xs">{t("calendar.panel.overbookingOff")}</SelectItem>
                                         </SelectContent>
                                     </Select>
                                     {form.overbookingOverride === 'ON' && (
                                         <div className="grid grid-cols-1 gap-3 pt-1">
                                             <div className="space-y-1">
                                                 <Label className="text-[9px] font-semibold text-slate-400">{t("calendar.panel.overbookingOverrideMaxCovers")}</Label>
                                                 <Input type="number" min="1" value={form.overbookingMaxExtraCoversOverride ?? ''}
                                                     onChange={(e) => setForm(prev => ({ ...prev, overbookingMaxExtraCoversOverride: e.target.value === '' ? null : parseInt(e.target.value) }))}
                                                     className="h-9 text-xs font-bold bg-slate-50 border-border rounded-sm" />
                                             </div>
                                             <div className="space-y-1">
                                                 <Label className="text-[9px] font-semibold text-slate-400">{t("calendar.panel.overbookingOverrideMaxReservations")}</Label>
                                                 <Input type="number" min="1" value={form.overbookingMaxExtraReservationsOverride ?? ''}
                                                     onChange={(e) => setForm(prev => ({ ...prev, overbookingMaxExtraReservationsOverride: e.target.value === '' ? null : parseInt(e.target.value) }))}
                                                     className="h-9 text-xs font-bold bg-slate-50 border-border rounded-sm" />
                                             </div>
                                         </div>
                                     )}
                                 </div>
                             </div>

                            <div className="flex gap-2">
                                {isBulkMode && (
                                    <Button variant="outline" onClick={() => setSelectedDays(new Set())} className="flex-1 h-12 text-[10px] font-semibold rounded-sm border-border text-slate-400">{t("calendar.panel.clear")}</Button>
                                )}
                                <Button onClick={handleSave} className="flex-[2] h-12 bg-slate-900 hover:bg-black text-white font-semibold text-[10px] rounded-sm shadow-xl transition-all active:scale-95">
                                    {isBulkMode ? `${t("calendar.panel.saveDaysPrefix")}${selectedDays.size}${t("calendar.panel.saveDaysSuffix")}` : t("calendar.panel.applySettings")}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="h-96 flex flex-col items-center justify-center text-center p-8 bg-white rounded-md border-2 border-dashed border-border shadow-inner">
                        <div className="w-16 h-16 rounded-xl bg-slate-50 flex items-center justify-center mb-6">
                            {isBulkMode ? <Stack className="h-8 w-8 text-slate-200" /> : <Cursor className="h-8 w-8 text-slate-200" />}
                        </div>
                        <p className="text-slate-400 font-semibold text-[10px] tracking-[0.2em] leading-relaxed px-4">
                            {isBulkMode ? t("calendar.panel.bulkEmpty") : t("calendar.panel.singleEmpty")}
                        </p>
                    </div>
                )}
            </div>
        </div>
      </div>
    </>
  );
}
