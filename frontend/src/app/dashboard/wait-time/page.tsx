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
import { Save, Hourglass, Users, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface WaitTimeConfig {
    isWaitTimeEnabled: boolean;
    isWaitTimeCalculated: boolean;
    manualWaitTimeLower: number | null;
    manualWaitTimeUpper: number | null;
    peopleWaiting: number;
    waitTimePerPersonLower: number;
    waitTimePerPersonUpper: number;
}

export default function WaitlistPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [config, setConfig] = useState<WaitTimeConfig>({
        isWaitTimeEnabled: false,
        isWaitTimeCalculated: false,
        manualWaitTimeLower: null,
        manualWaitTimeUpper: null,
        peopleWaiting: 0,
        waitTimePerPersonLower: 5,
        waitTimePerPersonUpper: 8
    });

    const fetchConfig = useCallback(async () => {
        try {
            setFetching(true);
            const res = await api.get('/wait-time');
            if (res.data.data) {
                const data = res.data.data;
                setConfig({
                    isWaitTimeEnabled: data.isWaitTimeEnabled ?? false,
                    isWaitTimeCalculated: data.isWaitTimeCalculated ?? false,
                    manualWaitTimeLower: data.manualWaitTimeLower ?? null,
                    manualWaitTimeUpper: data.manualWaitTimeUpper ?? null,
                    peopleWaiting: data.peopleWaiting ?? 0,
                    waitTimePerPersonLower: data.waitTimePerPersonLower ?? 5,
                    waitTimePerPersonUpper: data.waitTimePerPersonUpper ?? 8
                });
            }
        } catch (error) {
            toast.error('Failed to load wait time config');
        } finally {
            setFetching(false);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async () => {
        try {
            setLoading(true);
            await api.put('/wait-time', config);
            toast.success('Wait time updated successfully');
        } catch (error) {
            toast.error('Failed to save config');
        } finally {
            setLoading(false);
        }
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
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Live Wait Time Manager</h1>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Manage walk-in queue and wait times</p>
                        </div>
                    </div>
                    <Button onClick={handleSave} disabled={loading} className="bg-amber-600 hover:bg-amber-700 text-white font-black uppercase text-[10px] px-6 h-10 rounded-sm shadow-md shadow-amber-600/20 transition-all active:scale-95">
                        {loading ? 'Saving...' : <><Save className="w-3.5 h-3.5 mr-2" /> Update Display</>}
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="rounded-md border-slate-300 shadow-sm overflow-hidden bg-white md:col-span-2">
                        <CardHeader className="p-4 bg-slate-50 border-b border-slate-100 flex flex-row items-center gap-3">
                            <div className="p-2 bg-amber-100 rounded-sm text-amber-600"><Hourglass className="w-4 h-4" /></div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-tight">Live Wait Time</CardTitle>
                                <CardDescription className="text-[10px]">Display estimated wait times for walk-ins on your menu page</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <Label className="text-xs font-bold text-slate-700">Enable Wait Time Display</Label>
                                <Switch checked={config.isWaitTimeEnabled} onCheckedChange={(v: boolean) => setConfig(prev => ({...prev, isWaitTimeEnabled: v}))} />
                            </div>
                            
                            {config.isWaitTimeEnabled && (
                                <>
                                    <div className="grid gap-1.5">
                                        <Label className="text-[10px] font-black uppercase text-slate-400">Wait Time Mode</Label>
                                        <Select value={config.isWaitTimeCalculated ? 'CALCULATED' : 'MANUAL'} onValueChange={(v: string | null) => setConfig(prev => ({...prev, isWaitTimeCalculated: v === 'CALCULATED'}))}>
                                            <SelectTrigger className="h-9 text-xs font-bold rounded-sm">
                                                <SelectValue placeholder="Select mode" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MANUAL" className="text-xs">Manual Entry (Interval)</SelectItem>
                                                <SelectItem value="CALCULATED" className="text-xs">Calculated automatically (Interval)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    {!config.isWaitTimeCalculated ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="grid gap-1.5">
                                                <Label className="text-[10px] font-black uppercase text-slate-400">Min. Wait Time (Mins)</Label>
                                                <Input type="number" value={config.manualWaitTimeLower || ''} onChange={(e) => setConfig({...config, manualWaitTimeLower: e.target.value ? parseInt(e.target.value) : null})} className="h-9 text-sm font-bold rounded-sm" placeholder="e.g. 30" />
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label className="text-[10px] font-black uppercase text-slate-400">Max. Wait Time (Mins)</Label>
                                                <Input type="number" value={config.manualWaitTimeUpper || ''} onChange={(e) => setConfig({...config, manualWaitTimeUpper: e.target.value ? parseInt(e.target.value) : null})} className="h-9 text-sm font-bold rounded-sm" placeholder="e.g. 40" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div className="grid gap-1.5 sm:col-span-3">
                                                <Label className="text-[10px] font-black uppercase text-slate-400">People Waiting</Label>
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-slate-400" />
                                                    <Input type="number" value={config.peopleWaiting} onChange={(e) => setConfig({...config, peopleWaiting: parseInt(e.target.value) || 0})} className="h-9 text-sm font-bold rounded-sm" />
                                                </div>
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label className="text-[10px] font-black uppercase text-slate-400">Min. Per Person</Label>
                                                <Input type="number" value={config.waitTimePerPersonLower} onChange={(e) => setConfig({...config, waitTimePerPersonLower: parseInt(e.target.value) || 0})} className="h-9 text-sm font-bold rounded-sm" />
                                            </div>
                                            <div className="flex items-center justify-center pt-5">
                                                <span className="text-slate-400 font-black">to</span>
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label className="text-[10px] font-black uppercase text-slate-400">Max. Per Person</Label>
                                                <Input type="number" value={config.waitTimePerPersonUpper} onChange={(e) => setConfig({...config, waitTimePerPersonUpper: parseInt(e.target.value) || 0})} className="h-9 text-sm font-bold rounded-sm" />
                                            </div>
                                            <div className="sm:col-span-3 bg-slate-50 p-3 rounded-md border border-slate-100 flex items-center justify-between mt-2">
                                                <span className="text-xs font-bold text-slate-600">Calculated Wait Interval:</span>
                                                <span className="text-sm font-black text-amber-600">{config.peopleWaiting * config.waitTimePerPersonLower} - {config.peopleWaiting * config.waitTimePerPersonUpper} mins</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AdminLayout>
    );
}
