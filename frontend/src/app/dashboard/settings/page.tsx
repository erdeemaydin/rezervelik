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
import { PasswordConfirmDialog } from '@/components/auth/PasswordConfirmDialog';
import { useTranslation } from "@/i18n/provider";

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
    const { t } = useTranslation();
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
            toast.error(t("settings.failedLoad"));
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
            toast.success(t("settings.updatedSuccessfully"));
        } catch (error) {
            toast.error(t("settings.failedSave"));
        } finally {
            setLoading(false);
        }
    };

    const [futureModeAction, setFutureModeAction] = useState<string | null>(null);
    const [isFutureDialogOpen, setIsFutureDialogOpen] = useState(false);
    const [pendingFutureApply, setPendingFutureApply] = useState<boolean | null>(null);

    const handleFutureApply = (overwriteAll: boolean) => {
        setIsFutureDialogOpen(false);
        setPendingFutureApply(overwriteAll);
    };

    const executeFutureApply = async () => {
        if (!futureModeAction || pendingFutureApply === null) return;
        const overwriteAll = pendingFutureApply;
        const modeToastId = toast.loading(t("settings.applyingFutureDays"));

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
                toast.info(t("settings.noNewDaysToUpdate"));
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
            toast.success(`${t("settings.successApplyPrefix")} ${datesToUpdate.length} ${t("settings.successApplySuffix")}`);
        } catch (err) {
            toast.dismiss(modeToastId);
            toast.error(t("settings.failedApplyFuture"));
        }
        setFutureModeAction(null);
        setPendingFutureApply(null);
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
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t("settings.title")}</h1>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">{t("settings.subtitle")}</p>
                        </div>
                    </div>
                    <Button onClick={handleSave} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs px-8 h-12 rounded-md shadow-md shadow-blue-600/20 transition-all active:scale-95">
                        {loading ? t("settings.saving") : <><Save className="w-5 h-5 mr-3" /> {t("settings.saveChanges")}</>}
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Scheduling System */}
                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white md:col-span-2">
                        <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-4">
                            <div className="p-3 bg-blue-100 rounded-lg text-blue-600"><Calendar className="w-6 h-6" /></div>
                            <div>
                                <CardTitle className="text-lg font-black uppercase tracking-tight">{t("settings.schedulingOperations")}</CardTitle>
                                <CardDescription className="text-sm">{t("settings.configureRosters")}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="grid gap-6">
                                <div className="flex flex-col gap-3">
                                    <Label className="text-xs font-black uppercase text-slate-500">{t("settings.rosterPreference")}</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div 
                                            onClick={() => setSettings({...settings, schedulingSystem: 'WEEKLY'})}
                                            className={`p-4 border-2 rounded-md cursor-pointer transition-all ${settings.schedulingSystem === 'WEEKLY' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 hover:border-slate-300'}`}
                                        >
                                            <div className="font-black text-sm text-slate-800">{t("settings.weeklyView")}</div>
                                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{t("settings.weeklyDesc")}</p>
                                        </div>
                                        <div 
                                            onClick={() => setSettings({...settings, schedulingSystem: 'MONTHLY'})}
                                            className={`p-4 border-2 rounded-md cursor-pointer transition-all ${settings.schedulingSystem === 'MONTHLY' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 hover:border-slate-300'}`}
                                        >
                                            <div className="font-black text-sm text-slate-800">{t("settings.monthlyView")}</div>
                                            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{t("settings.monthlyDesc")}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="pt-4 border-t border-slate-100 space-y-3">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-bold text-slate-700">{t("settings.staffPrivacy")}</Label>
                                        <p className="text-[10px] text-slate-400">{t("settings.staffPrivacyDesc")}</p>
                                    </div>
                                    <Select 
                                        value={settings.staffScheduleView} 
                                        onValueChange={(v: string | null) => setSettings(prev => ({...prev, staffScheduleView: v || 'OWN_ONLY'}))}
                                    >
                                        <SelectTrigger className="h-9 text-xs font-bold rounded-sm w-full">
                                            <SelectValue placeholder={t("settings.selectViewMode")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="OWN_ONLY" className="text-xs">{t("settings.onlyMyShifts")}</SelectItem>
                                            <SelectItem value="SHIFT_TEAM" className="text-xs">{t("settings.myShiftsAndTeam")}</SelectItem>
                                            <SelectItem value="FULL_ROSTER" className="text-xs">{t("settings.completeRoster")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Reservation Logic */}
                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                        <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-4">
                            <div className="p-3 bg-purple-100 rounded-lg text-purple-600"><Clock className="w-6 h-6" /></div>
                            <div>
                                <CardTitle className="text-lg font-black uppercase tracking-tight">{t("settings.reservationLogic")}</CardTitle>
                                <CardDescription className="text-sm">{t("settings.reservationLogicDesc")}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-bold text-slate-700">{t("settings.acceptOnlineReservations")}</Label>
                                <Switch checked={settings.isReservationEnabled} onCheckedChange={(v: boolean) => setSettings(prev => ({...prev, isReservationEnabled: v}))} className="scale-125" />
                            </div>
                            <div className="grid gap-3 pt-4">
                                <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("settings.defaultDuration")}</Label>
                                <Input type="number" value={settings.defaultDurationMinutes} onChange={(e) => setSettings({...settings, defaultDurationMinutes: parseInt(e.target.value)})} className="h-12 text-base font-bold rounded-lg px-4" />
                            </div>
                            <div className="grid gap-3 pt-2">
                                <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("settings.assignmentLogic")}</Label>
                                <Select value={settings.logic || 'DYNAMIC_DURATION'} onValueChange={(v: string | null) => setSettings(prev => ({...prev, logic: v || 'DYNAMIC_DURATION'}))}>
                                    <SelectTrigger className="h-12 text-sm font-bold rounded-lg px-4">
                                        <SelectValue placeholder={t("settings.selectLogic")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="DYNAMIC_DURATION" className="text-sm py-2">{t("settings.dynamicDuration")}</SelectItem>
                                        <SelectItem value="FIXED_SLOTS" className="text-sm py-2">{t("settings.fixedTimeSlots")}</SelectItem>
                                        </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment Settings */}
                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                        <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-4">
                            <div className="p-3 bg-emerald-100 rounded-lg text-emerald-600"><CreditCard className="w-6 h-6" /></div>
                            <div>
                                <CardTitle className="text-lg font-black uppercase tracking-tight">{t("settings.paymentsDeposits")}</CardTitle>
                                <CardDescription className="text-sm">{t("settings.secureBookings")}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <Label className="text-sm font-bold text-slate-700">{t("settings.enableDeposit")}</Label>
                                <Switch checked={settings.isPaidReservationEnabled} onCheckedChange={(v: boolean) => setSettings(prev => ({...prev, isPaidReservationEnabled: v}))} className="scale-125" />
                            </div>
                            <div className="grid gap-3 pt-4">
                                <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("settings.depositAmount")}</Label>
                                <div className="relative">
                                    <Input type="number" disabled={!settings.isPaidReservationEnabled} value={settings.depositAmount || 0} onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setSettings(prev => ({...prev, depositAmount: isNaN(val) ? 0 : val}));
                                    }} className="h-12 text-base font-bold rounded-lg px-4 pr-16" />
                                    <div className="absolute right-4 top-3.5 text-sm font-black text-slate-400">{settings.currency}</div>
                                </div>
                            </div>
                            <div className="grid gap-3 pt-2">
                                <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("settings.currency")}</Label>
                                <Select value={settings.currency || 'TRY'} onValueChange={(v: string | null) => setSettings(prev => ({...prev, currency: v || 'TRY'}))}>
                                    <SelectTrigger className="h-12 text-sm font-bold rounded-lg px-4">
                                        <SelectValue placeholder={t("settings.selectCurrency")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="TRY" className="text-sm py-2">{t("settings.tryCurrency")}</SelectItem>
                                        <SelectItem value="USD" className="text-sm py-2">{t("settings.usdCurrency")}</SelectItem>
                                        <SelectItem value="EUR" className="text-sm py-2">{t("settings.eurCurrency")}</SelectItem>
                                        <SelectItem value="GBP" className="text-sm py-2">{t("settings.gbpCurrency")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Calendar Master Customization */}
                    <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white md:col-span-2">
                        <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-4">
                            <div className="p-3 bg-indigo-100 rounded-lg text-indigo-600"><CalendarClock className="w-6 h-6" /></div>
                            <div>
                                <CardTitle className="text-lg font-black uppercase tracking-tight">{t("settings.calendarCustomization")}</CardTitle>
                                <CardDescription className="text-sm">{t("settings.calendarCustomizationDesc")}</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="grid gap-4 max-w-2xl">
                                <Label className="text-sm font-black uppercase tracking-wider text-slate-500">{t("settings.setFutureMode")}</Label>
                                <Select value={futureModeAction || ''} onValueChange={(v) => { setFutureModeAction(v); setIsFutureDialogOpen(true); }}>
                                    <SelectTrigger className="h-14 text-base font-bold rounded-lg border-slate-200 px-4">
                                        <SelectValue placeholder={t("settings.selectBulkAction")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AUTO_CONFIRM" className="text-sm font-bold py-3"><div className="flex items-center text-emerald-700"><Check className="w-5 h-5 mr-3" /> {t("settings.autoConfirmBulk")}</div></SelectItem>
                                        <SelectItem value="STANDARD" className="text-sm font-bold py-3"><div className="flex items-center text-amber-700"><Timer className="w-5 h-5 mr-3" /> {t("settings.standardBulk")}</div></SelectItem>
                                        <SelectItem value="BLACKOUT" className="text-sm font-bold py-3"><div className="flex items-center text-red-700"><AlertCircle className="w-5 h-5 mr-3" /> {t("settings.blackoutBulk")}</div></SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-sm text-slate-500 leading-relaxed mt-2">{t("settings.bulkActionDesc")}</p>
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
                                <AlertCircle className="w-6 h-6" /> {t("settings.futureOverrideWarning")}
                            </DialogTitle>
                        </DialogHeader>
                    </div>
                    <div className="p-6 space-y-4">
                        <DialogDescription className="text-slate-700 font-medium leading-relaxed">
                            {t("settings.changeDefaultMode1")} <span className="font-black">
                                {futureModeAction === 'AUTO_CONFIRM' ? t("settings.autoConfirmText") : futureModeAction === 'BLACKOUT' ? t("settings.blackoutText") : t("settings.standardText")}
                            </span> {t("settings.changeDefaultMode2")}
                        </DialogDescription>
                    </div>
                    <div className="p-4 bg-slate-50 flex flex-col gap-2 border-t border-slate-100">
                        <Button 
                            onClick={() => handleFutureApply(true)} 
                            className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-black uppercase"
                        >
                            {t("settings.overwriteAll")}
                        </Button>
                        <Button 
                            onClick={() => handleFutureApply(false)} 
                            variant="outline"
                            className="w-full h-12 border-blue-200 text-blue-700 hover:bg-blue-50 font-black uppercase"
                        >
                            {t("settings.overwriteUnmodified")}
                        </Button>
                        <Button 
                            onClick={() => { setIsFutureDialogOpen(false); setFutureModeAction(null); }} 
                            variant="ghost"
                            className="w-full h-10 text-slate-400 hover:text-slate-600 font-bold uppercase"
                        >
                            {t("settings.cancelAction")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <PasswordConfirmDialog 
                open={pendingFutureApply !== null} 
                onOpenChange={(open) => { if (!open) setPendingFutureApply(null); }}
                onConfirm={executeFutureApply}
                title={t("settings.confirmCalendarChange")}
                description={t("settings.bulkUpdateConfirm")}
                actionLabel={t("settings.updateCalendar")}
                isDangerous={true}
            />
        </AdminLayout>
    );
}
