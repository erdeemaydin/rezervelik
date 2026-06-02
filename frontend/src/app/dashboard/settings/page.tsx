'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Save, Calendar, Clock, CreditCard, ArrowLeft, CalendarClock, AlertCircle, Check, Timer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RestaurantSettings {
    isReservationEnabled: boolean;
    logic: string;
    defaultDurationMinutes: number;
    isPaidReservationEnabled: boolean;
    depositAmount: number;
    currency: string;
    operatingHours: string;
    schedulingSystem: string;
    staffScheduleView: string;
}

export default function SettingsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [settings, setSettings] = useState<RestaurantSettings>({
        isReservationEnabled: true,
        logic: 'DYNAMIC_DURATION',
        defaultDurationMinutes: 90,
        isPaidReservationEnabled: false,
        depositAmount: 0,
        currency: 'TRY',
        operatingHours: '',
        schedulingSystem: 'MONTHLY',
        staffScheduleView: 'OWN_ONLY'
    });

    const fetchSettings = useCallback(async () => {
        try {
            setFetching(true);
            const res = await api.get('/settings');
            if (res.data.data) {
                // Ensure no nulls are passed into state
                const data = res.data.data;
                setSettings({
                    isReservationEnabled: data.isReservationEnabled ?? true,
                    logic: data.logic ?? 'DYNAMIC_DURATION',
                    defaultDurationMinutes: data.defaultDurationMinutes ?? 90,
                    isPaidReservationEnabled: data.isPaidReservationEnabled ?? false,
                    depositAmount: data.depositAmount ?? 0,
                    currency: data.currency ?? 'TRY',
                    operatingHours: data.operatingHours ?? '',
                    schedulingSystem: data.schedulingSystem ?? 'MONTHLY',
                    staffScheduleView: data.staffScheduleView ?? 'OWN_ONLY'
                });
            }
        } catch (error) {
            toast.error('Failed to load settings');
        } finally {
            setFetching(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleSave = async () => {
        try {
            setLoading(true);
            await api.put('/settings', settings);
            toast.success('Settings updated successfully');
        } catch (error) {
            toast.error('Failed to save settings');
        } finally {
            setLoading(false);
        }
    };

    const [futureModeAction, setFutureModeAction] = useState<string | null>(null);
    const [isFutureDialogOpen, setIsFutureDialogOpen] = useState(false);

    const handleFutureApply = async (overwriteAll: boolean) => {
        if (!futureModeAction) return;
        setIsFutureDialogOpen(false);
        const modeToastId = toast.loading('Applying settings to future days...');

        const isReservationEnabled = futureModeAction !== 'BLACKOUT';
        const autoConfirm = futureModeAction === 'AUTO_CONFIRM';

        try {
            let existingMap: Record<string, boolean> = {};
            if (!overwriteAll) {
                const res = await api.get('/day-settings');
                res.data.data.forEach((s: any) => {
                    existingMap[s.date] = true;
                });
            }

            const today = new Date();
            today.setHours(0,0,0,0);
            const datesToUpdate = [];

            const formatLocalDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            for (let i = 0; i < 365; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() + i);
                const dateStr = formatLocalDate(d);

                if (!overwriteAll && existingMap[dateStr]) {
                    continue;
                }
                datesToUpdate.push(dateStr);
            }

            if (datesToUpdate.length === 0) {
                toast.dismiss(modeToastId);
                toast.info('No new days to update.');
                setFutureModeAction(null);
                return;
            }

            await api.post('/day-settings/bulk', {
                dates: datesToUpdate,
                eventTitle: '',
                isReservationEnabled,
                autoConfirm
            });
            toast.dismiss(modeToastId);
            toast.success(`Successfully applied mode to ${datesToUpdate.length} future days.`);
        } catch (err) {
            toast.dismiss(modeToastId);
            toast.error('Failed to apply future settings');
        }
        setFutureModeAction(null);
    };

    if (fetching) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-[60vh]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-12">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Restaurant Settings</h1>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Personalize your guest experience & operations</p>
                        </div>
                    </div>
                    <Button onClick={handleSave} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-[10px] px-6 h-10 rounded-sm shadow-md shadow-blue-600/20 transition-all active:scale-95">
                        {loading ? 'Saving...' : <><Save className="w-3.5 h-3.5 mr-2" /> Save Changes</>}
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Scheduling System */}
                    <Card className="rounded-md border-slate-300 shadow-sm overflow-hidden bg-white md:col-span-2">
                        <CardHeader className="p-4 bg-slate-50 border-b border-slate-100 flex flex-row items-center gap-3">
                            <div className="p-2 bg-blue-100 rounded-sm text-blue-600"><Calendar className="w-4 h-4" /></div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-tight">Scheduling Operations</CardTitle>
                                <CardDescription className="text-[10px]">Configure how you manage staff rosters</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid gap-6">
                                <div className="flex flex-col gap-3">
                                    <Label className="text-xs font-black uppercase text-slate-500">Roster System Preference</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div 
                                            onClick={() => setSettings({...settings, schedulingSystem: 'WEEKLY'})}
                                            className={`p-4 border-2 rounded-md cursor-pointer transition-all ${settings.schedulingSystem === 'WEEKLY' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 hover:border-slate-300'}`}
                                        >
                                            <div className="font-black text-sm text-slate-800">Weekly View</div>
                                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Manage staff shifts on a 7-day rolling basis. Ideal for fast-paced environments.</p>
                                        </div>
                                        <div 
                                            onClick={() => setSettings({...settings, schedulingSystem: 'MONTHLY'})}
                                            className={`p-4 border-2 rounded-md cursor-pointer transition-all ${settings.schedulingSystem === 'MONTHLY' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 hover:border-slate-300'}`}
                                        >
                                            <div className="font-black text-sm text-slate-800">Monthly View</div>
                                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Full calendar overview for long-term planning. Best for stable teams.</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-bold text-slate-700">Staff Privacy & Visibility</Label>
                                        <p className="text-[10px] text-slate-400">Determine what information staff can see on the scheduling dashboard</p>
                                    </div>
                                    <Select 
                                        value={settings.staffScheduleView} 
                                        onValueChange={(v: string | null) => setSettings(prev => ({...prev, staffScheduleView: v || 'OWN_ONLY'}))}
                                    >
                                        <SelectTrigger className="h-9 text-xs font-bold rounded-sm w-full">
                                            <SelectValue placeholder="Select view mode" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="OWN_ONLY" className="text-xs">Only My Shifts (Maximum Privacy)</SelectItem>
                                            <SelectItem value="SHIFT_TEAM" className="text-xs">My Shifts & Team Members (On Same Shift)</SelectItem>
                                            <SelectItem value="FULL_ROSTER" className="text-xs">Complete Roster Grid (Public Table)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Reservation Logic */}
                    <Card className="rounded-md border-slate-300 shadow-sm overflow-hidden bg-white">
                        <CardHeader className="p-4 bg-slate-50 border-b border-slate-100 flex flex-row items-center gap-3">
                            <div className="p-2 bg-purple-100 rounded-sm text-purple-600"><Clock className="w-4 h-4" /></div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-tight">Reservation Logic</CardTitle>
                                <CardDescription className="text-[10px]">Control timing and table availability</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-slate-700">Accept Online Reservations</Label>
                                <Switch checked={settings.isReservationEnabled} onCheckedChange={(v: boolean) => setSettings(prev => ({...prev, isReservationEnabled: v}))} />
                            </div>
                            <div className="grid gap-1.5 pt-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Default Duration (Minutes)</Label>
                                <Input type="number" value={settings.defaultDurationMinutes} onChange={(e) => setSettings({...settings, defaultDurationMinutes: parseInt(e.target.value)})} className="h-9 text-sm font-bold rounded-sm" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Assignment Logic</Label>
                                <Select value={settings.logic || 'DYNAMIC_DURATION'} onValueChange={(v: string | null) => setSettings(prev => ({...prev, logic: v || 'DYNAMIC_DURATION'}))}>
                                    <SelectTrigger className="h-9 text-xs font-bold rounded-sm">
                                        <SelectValue placeholder="Select logic" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DYNAMIC_DURATION" className="text-xs">Dynamic Duration</SelectItem>
                                        <SelectItem value="FIXED_SLOTS" className="text-xs">Fixed Time Slots</SelectItem>
                                        </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Calendar Master Customization */}
                    <Card className="rounded-md border-slate-300 shadow-sm overflow-hidden bg-white md:col-span-2">
                        <CardHeader className="p-4 bg-slate-50 border-b border-slate-100 flex flex-row items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-sm text-indigo-600"><CalendarClock className="w-4 h-4" /></div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-tight">Calendar Customization</CardTitle>
                                <CardDescription className="text-[10px]">Manage global calendar behavior and bulk operations</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Set Future Default Mode</Label>
                                <Select value={futureModeAction || ''} onValueChange={(v) => { setFutureModeAction(v); setIsFutureDialogOpen(true); }}>
                                    <SelectTrigger className="h-9 text-xs font-bold rounded-sm border-slate-200 w-full sm:w-1/2">
                                        <SelectValue placeholder="Select bulk action..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AUTO_CONFIRM" className="text-xs font-bold"><div className="flex items-center text-emerald-700"><Check className="w-3 h-3 mr-2" /> Auto-Confirm (Skip Review)</div></SelectItem>
                                        <SelectItem value="STANDARD" className="text-xs font-bold"><div className="flex items-center text-amber-700"><Timer className="w-3 h-3 mr-2" /> Standard (Manual Review)</div></SelectItem>
                                        <SelectItem value="BLACKOUT" className="text-xs font-bold"><div className="flex items-center text-red-700"><AlertCircle className="w-3 h-3 mr-2" /> Blackout (Close Bookings)</div></SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[10px] text-slate-500 leading-relaxed mt-1">This action allows you to mass-apply an operational mode to the next 365 days in your Calendar Master.</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment Settings */}
                    <Card className="rounded-md border-slate-300 shadow-sm overflow-hidden bg-white">
                        <CardHeader className="p-4 bg-slate-50 border-b border-slate-100 flex flex-row items-center gap-3">
                            <div className="p-2 bg-emerald-100 rounded-sm text-emerald-600"><CreditCard className="w-4 h-4" /></div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-tight">Payments & Deposits</CardTitle>
                                <CardDescription className="text-[10px]">Secure bookings with financial commitments</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-slate-700">Enable Deposit Payment</Label>
                                <Switch checked={settings.isPaidReservationEnabled} onCheckedChange={(v: boolean) => setSettings(prev => ({...prev, isPaidReservationEnabled: v}))} />
                            </div>
                            <div className="grid gap-1.5 pt-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Deposit Amount</Label>
                                <div className="relative">
                                    <Input type="number" disabled={!settings.isPaidReservationEnabled} value={settings.depositAmount || 0} onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setSettings(prev => ({...prev, depositAmount: isNaN(val) ? 0 : val}));
                                    }} className="h-9 text-sm font-bold rounded-sm pr-12" />
                                    <div className="absolute right-3 top-2 text-[10px] font-black text-slate-400">{settings.currency}</div>
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Currency</Label>
                                <Select value={settings.currency || 'TRY'} onValueChange={(v: string | null) => setSettings(prev => ({...prev, currency: v || 'TRY'}))}>
                                    <SelectTrigger className="h-9 text-xs font-bold rounded-sm">
                                        <SelectValue placeholder="Select currency" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="TRY" className="text-xs">TRY (₺)</SelectItem>
                                        <SelectItem value="USD" className="text-xs">USD ($)</SelectItem>
                                        <SelectItem value="EUR" className="text-xs">EUR (€)</SelectItem>
                                        <SelectItem value="GBP" className="text-xs">GBP (£)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={isFutureDialogOpen} onOpenChange={(open) => { if (!open) setFutureModeAction(null); setIsFutureDialogOpen(open); }}>
                <DialogContent className="sm:max-w-md bg-white border-0 shadow-2xl p-0 rounded-md overflow-hidden">
                    <div className="bg-amber-500 p-6">
                        <DialogHeader>
                            <DialogTitle className="text-white text-xl font-black uppercase tracking-tight flex items-center gap-2">
                                <AlertCircle className="w-6 h-6" /> Future Override Warning
                            </DialogTitle>
                        </DialogHeader>
                    </div>
                    <div className="p-6 space-y-4">
                        <DialogDescription className="text-slate-700 font-medium leading-relaxed">
                            You are about to change the default operational mode to <span className="font-black">
                                {futureModeAction === 'AUTO_CONFIRM' ? 'Auto-Confirm' : futureModeAction === 'BLACKOUT' ? 'Blackout' : 'Standard'}
                            </span> for the next 365 days. How would you like to apply this?
                        </DialogDescription>
                    </div>
                    <div className="p-4 bg-slate-50 flex flex-col gap-2 border-t border-slate-100">
                        <Button 
                            onClick={() => handleFutureApply(true)} 
                            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-black uppercase"
                        >
                            1. Overwrite ALL Future Days
                        </Button>
                        <Button 
                            onClick={() => handleFutureApply(false)} 
                            variant="outline"
                            className="w-full h-12 border-blue-200 text-blue-700 hover:bg-blue-50 font-black uppercase"
                        >
                            2. Overwrite Only Unmodified Days
                        </Button>
                        <Button 
                            onClick={() => { setIsFutureDialogOpen(false); setFutureModeAction(null); }} 
                            variant="ghost"
                            className="w-full h-10 text-slate-400 hover:text-slate-600 font-bold uppercase"
                        >
                            3. Cancel Action
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}
