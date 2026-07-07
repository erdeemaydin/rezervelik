'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Save, Hourglass, Users, ArrowLeft, Plus, CheckCircle2, MessageCircle, XCircle, Calendar as CalendarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTranslation } from "@/i18n/provider";

interface WaitTimeConfig {
    isWaitlistOpen: boolean;
    isWaitTimeEnabled: boolean;
    isWaitTimeCalculated: boolean;
    manualWaitTimeLower: number | null;
    manualWaitTimeUpper: number | null;
    peopleWaiting: number;
    waitTimePerPersonLower: number;
    waitTimePerPersonUpper: number;
}

interface WaitlistEntry {
    id: string;
    customerName: string;
    customerPhone: string;
    partySize: number;
    quotedWaitTime: number | null;
    status: string;
    joinedAt: string;
    notifiedAt: string | null;
    targetDate: string | null;
    offerExpiresAt: string | null;
}

export default function WaitlistPage() {
    const router = useRouter();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    
    // Config state
    const [config, setConfig] = useState<WaitTimeConfig>({
        isWaitlistOpen: false,
        isWaitTimeEnabled: false,
        isWaitTimeCalculated: false,
        manualWaitTimeLower: null,
        manualWaitTimeUpper: null,
        peopleWaiting: 0,
        waitTimePerPersonLower: 5,
        waitTimePerPersonUpper: 8
    });

    // Waitlist queue state
    const [queue, setQueue] = useState<WaitlistEntry[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'walkin' | 'future'>('walkin');
    const [addForm, setAddForm] = useState({
        customerName: '', customerPhone: '', partySize: '2', quotedWaitTime: ''
    });

    const [offerForm, setOfferForm] = useState({ entryId: '', offeredTime: '19:00', expiresInHours: '2' });
    const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            setFetching(true);
            const [configRes, queueRes] = await Promise.all([
                api.get('/wait-time/config'),
                api.get('/wait-time/entries')
            ]);
            
            if (configRes.data.data) {
                const data = configRes.data.data;
                setConfig({
                    isWaitlistOpen: data.isWaitlistOpen ?? false,
                    isWaitTimeEnabled: data.isWaitTimeEnabled ?? false,
                    isWaitTimeCalculated: data.isWaitTimeCalculated ?? false,
                    manualWaitTimeLower: data.manualWaitTimeLower ?? null,
                    manualWaitTimeUpper: data.manualWaitTimeUpper ?? null,
                    peopleWaiting: data.peopleWaiting ?? 0,
                    waitTimePerPersonLower: data.waitTimePerPersonLower ?? 5,
                    waitTimePerPersonUpper: data.waitTimePerPersonUpper ?? 8
                });
            }

            if (queueRes.data.data) {
                setQueue(queueRes.data.data);
            }
        } catch (error) {
            toast.error(t("waitTime.error.load"));
        } finally {
            setFetching(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveConfig = async () => {
        try {
            setLoading(true);
            await api.put('/wait-time/config', config);
            toast.success(t("waitTime.success.update"));
        } catch (error) {
            toast.error(t("waitTime.error.save"));
        } finally {
            setLoading(false);
        }
    };

    const handleAddWalkIn = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/wait-time/entries', addForm);
            toast.success(t("waitTime.success.addGuest"));
            setIsAddModalOpen(false);
            setAddForm({ customerName: '', customerPhone: '', partySize: '2', quotedWaitTime: '' });
            fetchData();
        } catch (error) {
            toast.error(t("waitTime.error.addGuest"));
        }
    };

    const updateStatus = async (entryId: string, status: string) => {
        try {
            await api.put(`/wait-time/entries/${entryId}/status`, { status });
            toast.success(`${t("waitTime.success.markStatus")} ${status}`);
            fetchData();
        } catch (error) {
            toast.error(t("waitTime.error.updateStatus"));
        }
    };

    const handleSendOffer = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post(`/wait-time/entries/${offerForm.entryId}/offer`, {
                offeredTime: offerForm.offeredTime,
                expiresInHours: parseInt(offerForm.expiresInHours)
            });
            toast.success(t("waitTime.success.offerSent"));
            setIsOfferModalOpen(false);
            fetchData();
        } catch (error) {
            toast.error(t("waitTime.error.offerSent"));
        }
    };

    const walkinQueue = queue.filter(e => !e.targetDate);
    const futureQueue = queue.filter(e => !!e.targetDate);

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
            <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-12">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t("waitTime.title")}</h1>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">{t("waitTime.subtitle")}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Config */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white">
                            <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-amber-100 rounded-lg text-amber-600"><Hourglass className="w-6 h-6" /></div>
                                    <CardTitle className="text-lg font-black uppercase tracking-tight">{t("waitTime.config.title")}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-bold text-slate-800">{t("waitTime.config.acceptPublic")}</Label>
                                        <p className="text-xs text-slate-500">{t("waitTime.config.acceptPublicDesc")}</p>
                                    </div>
                                    <Switch checked={config.isWaitlistOpen} onCheckedChange={(v: boolean) => setConfig(prev => ({...prev, isWaitlistOpen: v}))} className="scale-125" />
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="space-y-1">
                                        <Label className="text-sm font-bold text-slate-800">{t("waitTime.config.displayEstimatedTime")}</Label>
                                        <p className="text-xs text-slate-500">{t("waitTime.config.displayEstimatedTimeDesc")}</p>
                                    </div>
                                    <Switch checked={config.isWaitTimeEnabled} onCheckedChange={(v: boolean) => setConfig(prev => ({...prev, isWaitTimeEnabled: v}))} className="scale-125" />
                                </div>
                                {config.isWaitTimeEnabled && (
                                    <>
                                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-4 flex items-center justify-between">
                                            <div className="space-y-2">
                                                <div className="text-xs font-black uppercase text-blue-600">{t("waitTime.config.publicUrl")}</div>
                                                <div className="text-sm font-mono text-slate-700 select-all truncate max-w-[200px]">
                                                    {typeof window !== 'undefined' ? `${window.location.origin}/r/your-slug/waitlist` : t("waitTime.loading")}
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-9 text-xs bg-white text-blue-700" onClick={() => {
                                                toast.info(t("waitTime.info.qrGeneration"));
                                            }}>
                                                {t("waitTime.config.getQr")}
                                            </Button>
                                        </div>
                                        <div className="grid gap-2 pt-2">
                                            <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("waitTime.config.mode")}</Label>
                                            <Select value={config.isWaitTimeCalculated ? 'CALCULATED' : 'MANUAL'} onValueChange={(v: string | null) => setConfig(prev => ({...prev, isWaitTimeCalculated: v === 'CALCULATED'}))}>
                                                <SelectTrigger className="h-12 text-sm font-bold rounded-lg px-4">
                                                    <SelectValue placeholder={t("waitTime.config.selectMode")} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="MANUAL" className="text-sm py-2">{t("waitTime.config.modeManual")}</SelectItem>
                                                    <SelectItem value="CALCULATED" className="text-sm py-2">{t("waitTime.config.modeCalculated")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        
                                        {!config.isWaitTimeCalculated ? (
                                            <div className="grid grid-cols-2 gap-4 pt-2">
                                                <div className="grid gap-2">
                                                    <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("waitTime.config.minMins")}</Label>
                                                    <Input type="number" value={config.manualWaitTimeLower || ''} onChange={(e) => setConfig({...config, manualWaitTimeLower: e.target.value ? parseInt(e.target.value) : null})} className="h-12 text-base font-bold rounded-lg px-4" placeholder="30" />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("waitTime.config.maxMins")}</Label>
                                                    <Input type="number" value={config.manualWaitTimeUpper || ''} onChange={(e) => setConfig({...config, manualWaitTimeUpper: e.target.value ? parseInt(e.target.value) : null})} className="h-12 text-base font-bold rounded-lg px-4" placeholder="40" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-4 pt-2">
                                                <div className="grid gap-2 col-span-2">
                                                    <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("waitTime.config.peopleWaiting")}</Label>
                                                    <Input type="number" value={config.peopleWaiting} onChange={(e) => setConfig({...config, peopleWaiting: parseInt(e.target.value) || 0})} className="h-12 text-base font-bold rounded-lg px-4" />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("waitTime.config.minPerPerson")}</Label>
                                                    <Input type="number" value={config.waitTimePerPersonLower} onChange={(e) => setConfig({...config, waitTimePerPersonLower: parseInt(e.target.value) || 0})} className="h-12 text-base font-bold rounded-lg px-4" />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("waitTime.config.maxPerPerson")}</Label>
                                                    <Input type="number" value={config.waitTimePerPersonUpper} onChange={(e) => setConfig({...config, waitTimePerPersonUpper: parseInt(e.target.value) || 0})} className="h-12 text-base font-bold rounded-lg px-4" />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                <Button onClick={handleSaveConfig} disabled={loading} className="w-full bg-slate-900 text-white font-black uppercase text-xs h-12 rounded-lg mt-4">
                                    {loading ? t("waitTime.saving") : t("waitTime.config.save")}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Virtual Queue */}
                    <div className="lg:col-span-2">
                        <Card className="rounded-xl border-slate-200 shadow-sm overflow-hidden bg-white h-full">
                            <CardHeader className="p-6 bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('walkin')} className={cn("h-10 px-4 text-xs font-black uppercase rounded-lg transition-all", activeTab === 'walkin' ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800")}>{t("waitTime.tabs.walkins")}</Button>
                                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('future')} className={cn("h-10 px-4 text-xs font-black uppercase rounded-lg transition-all", activeTab === 'future' ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800")}>{t("waitTime.tabs.futureDates")}</Button>
                                </div>
                                {activeTab === 'walkin' && (
                                    <Button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 h-10 text-sm font-bold px-4 rounded-lg">
                                        <Plus className="w-5 h-5 mr-2" /> {t("waitTime.tabs.addWalkIn")}
                                    </Button>
                                )}
                            </CardHeader>
                            <CardContent className="p-0">
                                {activeTab === 'walkin' ? (
                                    walkinQueue.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                            <Hourglass className="w-12 h-12 mb-4 text-slate-200" />
                                            <p className="text-sm font-bold">{t("waitTime.empty.queueTitle")}</p>
                                            <p className="text-xs">{t("waitTime.empty.queueDesc")}</p>
                                        </div>
                                    ) : (
                                        <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.guest")}</TableHead>
                                                <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.party")}</TableHead>
                                                <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.waitTime")}</TableHead>
                                                <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.status")}</TableHead>
                                                <TableHead className="text-right text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.actions")}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {walkinQueue.map(entry => {
                                                const joined = new Date(entry.joinedAt);
                                                const elapsed = Math.floor((new Date().getTime() - joined.getTime()) / 60000);
                                                
                                                return (
                                                    <TableRow key={entry.id} className="hover:bg-slate-50/50">
                                                        <TableCell>
                                                            <div className="font-bold text-slate-800 text-xs">{entry.customerName}</div>
                                                            <div className="text-[9px] text-slate-400 font-mono">{entry.customerPhone}</div>
                                                        </TableCell>
                                                        <TableCell className="font-bold text-slate-700">{entry.partySize}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className={cn("font-bold text-xs", elapsed > (entry.quotedWaitTime || 0) ? "text-red-500" : "text-emerald-600")}>
                                                                    {elapsed} {t("waitTime.table.mElapsed")}
                                                                </span>
                                                                {entry.quotedWaitTime && <span className="text-[9px] text-slate-400">{t("waitTime.table.quoted")}: {entry.quotedWaitTime}m</span>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {entry.status === 'WAITING' ? (
                                                                <Badge className="bg-amber-100 text-amber-800 border-0 hover:bg-amber-100 text-[9px] font-black">{t("waitTime.status.waiting")}</Badge>
                                                            ) : (
                                                                <Badge className="bg-blue-100 text-blue-800 border-0 hover:bg-blue-100 text-[9px] font-black">{t("waitTime.status.notified")}</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right space-x-1">
                                                            {entry.status === 'WAITING' && (
                                                                <Button variant="outline" size="sm" onClick={() => updateStatus(entry.id, 'NOTIFIED')} className="h-7 text-[10px] font-bold border-blue-200 text-blue-700 hover:bg-blue-50">
                                                                    <MessageCircle className="w-3 h-3 mr-1" /> {t("waitTime.action.notify")}
                                                                </Button>
                                                            )}
                                                            <Button variant="outline" size="sm" onClick={() => updateStatus(entry.id, 'SEATED')} className="h-7 text-[10px] font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                                                <CheckCircle2 className="w-3 h-3 mr-1" /> {t("waitTime.action.seat")}
                                                            </Button>
                                                            <Button variant="ghost" size="icon" onClick={() => updateStatus(entry.id, 'CANCELED')} className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50">
                                                                <XCircle className="w-4 h-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                    )
                                ) : (
                                    futureQueue.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                            <CalendarIcon className="w-12 h-12 mb-4 text-slate-200" />
                                            <p className="text-sm font-bold">{t("waitTime.empty.futureTitle")}</p>
                                            <p className="text-xs">{t("waitTime.empty.futureDesc")}</p>
                                        </div>
                                    ) : (
                                        <Table>
                                            <TableHeader className="bg-slate-50">
                                                <TableRow>
                                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.date")}</TableHead>
                                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.guest")}</TableHead>
                                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.party")}</TableHead>
                                                    <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.status")}</TableHead>
                                                    <TableHead className="text-right text-[9px] font-black uppercase tracking-widest text-slate-500">{t("waitTime.table.actions")}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {futureQueue.map(entry => (
                                                    <TableRow key={entry.id} className="hover:bg-slate-50/50">
                                                        <TableCell className="font-bold text-slate-800 text-xs">{entry.targetDate}</TableCell>
                                                        <TableCell>
                                                            <div className="font-bold text-slate-800 text-xs">{entry.customerName}</div>
                                                            <div className="text-[9px] text-slate-400 font-mono">{entry.customerPhone}</div>
                                                        </TableCell>
                                                        <TableCell className="font-bold text-slate-700">{entry.partySize}</TableCell>
                                                        <TableCell>
                                                            {entry.status === 'WAITING' ? (
                                                                <Badge className="bg-amber-100 text-amber-800 border-0 hover:bg-amber-100 text-[9px] font-black">{t("waitTime.status.waiting")}</Badge>
                                                            ) : entry.status === 'OFFERED' ? (
                                                                <Badge className="bg-purple-100 text-purple-800 border-0 hover:bg-purple-100 text-[9px] font-black">{t("waitTime.status.offerSent")}</Badge>
                                                            ) : (
                                                                <Badge className="bg-blue-100 text-blue-800 border-0 hover:bg-blue-100 text-[9px] font-black">{entry.status}</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right space-x-1">
                                                            {entry.status === 'WAITING' && (
                                                                <Button variant="outline" size="sm" onClick={() => {
                                                                    setOfferForm(prev => ({...prev, entryId: entry.id}));
                                                                    setIsOfferModalOpen(true);
                                                                }} className="h-7 text-[10px] font-bold border-purple-200 text-purple-700 hover:bg-purple-50">
                                                                    <MessageCircle className="w-3 h-3 mr-1" /> {t("waitTime.action.sendOffer")}
                                                                </Button>
                                                            )}
                                                            <Button variant="ghost" size="icon" onClick={() => updateStatus(entry.id, 'CANCELED')} className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50">
                                                                <XCircle className="w-4 h-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
                
                {/* Add Walk-in Modal */}
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                    <DialogContent className="sm:max-w-md p-0 border-0 overflow-hidden">
                        <div className="bg-slate-900 p-4 text-white">
                            <DialogHeader>
                                <DialogTitle className="text-sm font-black uppercase tracking-widest">{t("waitTime.modal.addWalkInTitle")}</DialogTitle>
                            </DialogHeader>
                        </div>
                        <form onSubmit={handleAddWalkIn} className="p-6 space-y-4 bg-white">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("waitTime.modal.guestName")}</Label>
                                <Input required value={addForm.customerName} onChange={e => setAddForm({...addForm, customerName: e.target.value})} className="h-9 text-sm font-bold" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("waitTime.modal.phone")}</Label>
                                <Input required type="tel" value={addForm.customerPhone} onChange={e => setAddForm({...addForm, customerPhone: e.target.value})} className="h-9 text-sm font-bold" placeholder={t("waitTime.modal.phonePlaceholder")} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">{t("waitTime.modal.partySize")}</Label>
                                    <Input required type="number" min="1" value={addForm.partySize} onChange={e => setAddForm({...addForm, partySize: e.target.value})} className="h-9 text-sm font-bold" />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">{t("waitTime.modal.quotedWait")}</Label>
                                    <Input type="number" value={addForm.quotedWaitTime} onChange={e => setAddForm({...addForm, quotedWaitTime: e.target.value})} className="h-9 text-sm font-bold" placeholder={t("waitTime.modal.optional")} />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)} className="h-9 text-xs font-bold">{t("waitTime.modal.cancel")}</Button>
                                <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase">{t("waitTime.modal.addToQueue")}</Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>

            </div>

            {/* Send Offer Modal */}
            <Dialog open={isOfferModalOpen} onOpenChange={setIsOfferModalOpen}>
                <DialogContent className="sm:max-w-md p-0 border-0 overflow-hidden">
                    <div className="bg-purple-900 p-4 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-sm font-black uppercase tracking-widest">{t("waitTime.modal.sendOfferTitle")}</DialogTitle>
                        </DialogHeader>
                    </div>
                    <form onSubmit={handleSendOffer} className="p-6 space-y-4 bg-white">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("waitTime.modal.offerTime")}</Label>
                                <TimeSelect value={offerForm.offeredTime} onChange={v => setOfferForm({...offerForm, offeredTime: v})} className="w-full h-9 text-sm font-bold" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("waitTime.modal.expiresIn")}</Label>
                                <Input type="number" required min="1" max="72" value={offerForm.expiresInHours} onChange={e => setOfferForm({...offerForm, expiresInHours: e.target.value})} className="h-9 text-sm font-bold" />
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            {t("waitTime.modal.offerDesc")}
                        </p>
                        <div className="pt-4 flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setIsOfferModalOpen(false)} className="h-9 text-xs font-bold">{t("waitTime.modal.cancel")}</Button>
                            <Button type="submit" className="h-9 bg-purple-600 hover:bg-purple-700 text-xs font-black uppercase text-white">{t("waitTime.modal.sendOfferBtn")}</Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

        </AdminLayout>
    );
}
