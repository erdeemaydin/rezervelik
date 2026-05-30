'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Save, Hourglass, Users, ArrowLeft, Plus, CheckCircle2, MessageCircle, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

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
}

export default function WaitlistPage() {
    const router = useRouter();
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
    const [addForm, setAddForm] = useState({
        customerName: '', customerPhone: '', partySize: '2', quotedWaitTime: ''
    });

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
            toast.error('Failed to load waitlist data');
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
            toast.success('Wait time updated successfully');
        } catch (error) {
            toast.error('Failed to save config');
        } finally {
            setLoading(false);
        }
    };

    const handleAddWalkIn = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/wait-time/entries', addForm);
            toast.success('Guest added to waitlist');
            setIsAddModalOpen(false);
            setAddForm({ customerName: '', customerPhone: '', partySize: '2', quotedWaitTime: '' });
            fetchData();
        } catch (error) {
            toast.error('Failed to add guest');
        }
    };

    const updateStatus = async (entryId: string, status: string) => {
        try {
            await api.put(`/wait-time/entries/${entryId}/status`, { status });
            toast.success(`Guest marked as ${status}`);
            fetchData();
        } catch (error) {
            toast.error('Failed to update status');
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
            <div className="flex flex-col gap-6 max-w-6xl mx-auto pb-12">
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
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Config */}
                    <div className="lg:col-span-1 space-y-6">
                        <Card className="rounded-md border-slate-300 shadow-sm overflow-hidden bg-white">
                            <CardHeader className="p-4 bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-amber-100 rounded-sm text-amber-600"><Hourglass className="w-4 h-4" /></div>
                                    <CardTitle className="text-sm font-black uppercase tracking-tight">Waitlist Config</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-md border border-slate-100">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-bold text-slate-800">Accept Public Walk-ins (QR)</Label>
                                        <p className="text-[10px] text-slate-500">Allow guests to join via waitlist URL.</p>
                                    </div>
                                    <Switch checked={config.isWaitlistOpen} onCheckedChange={(v: boolean) => setConfig(prev => ({...prev, isWaitlistOpen: v}))} />
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-md border border-slate-100">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-bold text-slate-800">Display Estimated Time</Label>
                                        <p className="text-[10px] text-slate-500">Show calculated or manual wait time.</p>
                                    </div>
                                    <Switch checked={config.isWaitTimeEnabled} onCheckedChange={(v: boolean) => setConfig(prev => ({...prev, isWaitTimeEnabled: v}))} />
                                </div>
                                {config.isWaitTimeEnabled && (
                                    <>
                                        <div className="bg-blue-50 border border-blue-100 p-3 rounded-md mb-4 flex items-center justify-between">
                                            <div className="space-y-1">
                                                <div className="text-[9px] font-black uppercase text-blue-600">Public Waitlist URL</div>
                                                <div className="text-xs font-mono text-slate-700 select-all truncate max-w-[200px]">
                                                    {typeof window !== 'undefined' ? `${window.location.origin}/r/your-slug/waitlist` : 'Loading...'}
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" className="h-7 text-[10px] bg-white text-blue-700" onClick={() => {
                                                toast.info('QR Code Generation available in production');
                                            }}>
                                                Get QR
                                            </Button>
                                        </div>
                                        <div className="grid gap-1.5">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Wait Time Mode</Label>
                                            <Select value={config.isWaitTimeCalculated ? 'CALCULATED' : 'MANUAL'} onValueChange={(v: string | null) => setConfig(prev => ({...prev, isWaitTimeCalculated: v === 'CALCULATED'}))}>
                                                <SelectTrigger className="h-9 text-xs font-bold rounded-sm">
                                                    <SelectValue placeholder="Select mode" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="MANUAL" className="text-xs">Manual Entry</SelectItem>
                                                    <SelectItem value="CALCULATED" className="text-xs">Auto-Calculated</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        
                                        {!config.isWaitTimeCalculated ? (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="grid gap-1.5">
                                                    <Label className="text-[10px] font-black uppercase text-slate-400">Min. (Mins)</Label>
                                                    <Input type="number" value={config.manualWaitTimeLower || ''} onChange={(e) => setConfig({...config, manualWaitTimeLower: e.target.value ? parseInt(e.target.value) : null})} className="h-9 text-sm font-bold rounded-sm" placeholder="30" />
                                                </div>
                                                <div className="grid gap-1.5">
                                                    <Label className="text-[10px] font-black uppercase text-slate-400">Max. (Mins)</Label>
                                                    <Input type="number" value={config.manualWaitTimeUpper || ''} onChange={(e) => setConfig({...config, manualWaitTimeUpper: e.target.value ? parseInt(e.target.value) : null})} className="h-9 text-sm font-bold rounded-sm" placeholder="40" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="grid gap-1.5 col-span-2">
                                                    <Label className="text-[10px] font-black uppercase text-slate-400">People Waiting</Label>
                                                    <Input type="number" value={config.peopleWaiting} onChange={(e) => setConfig({...config, peopleWaiting: parseInt(e.target.value) || 0})} className="h-9 text-sm font-bold rounded-sm" />
                                                </div>
                                                <div className="grid gap-1.5">
                                                    <Label className="text-[10px] font-black uppercase text-slate-400">Min. Per Person</Label>
                                                    <Input type="number" value={config.waitTimePerPersonLower} onChange={(e) => setConfig({...config, waitTimePerPersonLower: parseInt(e.target.value) || 0})} className="h-9 text-sm font-bold rounded-sm" />
                                                </div>
                                                <div className="grid gap-1.5">
                                                    <Label className="text-[10px] font-black uppercase text-slate-400">Max. Per Person</Label>
                                                    <Input type="number" value={config.waitTimePerPersonUpper} onChange={(e) => setConfig({...config, waitTimePerPersonUpper: parseInt(e.target.value) || 0})} className="h-9 text-sm font-bold rounded-sm" />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                <Button onClick={handleSaveConfig} disabled={loading} className="w-full bg-slate-900 text-white font-black uppercase text-[10px] h-9 rounded-sm">
                                    {loading ? 'Saving...' : 'Save Config'}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Virtual Queue */}
                    <div className="lg:col-span-2">
                        <Card className="rounded-md border-slate-300 shadow-sm overflow-hidden bg-white h-full">
                            <CardHeader className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Users className="w-5 h-5 text-blue-600" />
                                    <CardTitle className="text-sm font-black uppercase tracking-tight">Active Virtual Queue</CardTitle>
                                </div>
                                <Button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 h-8 text-xs font-bold px-3">
                                    <Plus className="w-4 h-4 mr-1" /> Add Walk-In
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0">
                                {queue.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                        <Hourglass className="w-12 h-12 mb-4 text-slate-200" />
                                        <p className="text-sm font-bold">Queue is currently empty</p>
                                        <p className="text-xs">Walk-ins will appear here.</p>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader className="bg-slate-50">
                                            <TableRow>
                                                <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">Guest</TableHead>
                                                <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">Party</TableHead>
                                                <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">Wait Time</TableHead>
                                                <TableHead className="text-[9px] font-black uppercase tracking-widest text-slate-500">Status</TableHead>
                                                <TableHead className="text-right text-[9px] font-black uppercase tracking-widest text-slate-500">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {queue.map(entry => {
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
                                                                    {elapsed}m elapsed
                                                                </span>
                                                                {entry.quotedWaitTime && <span className="text-[9px] text-slate-400">Quoted: {entry.quotedWaitTime}m</span>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {entry.status === 'WAITING' ? (
                                                                <Badge className="bg-amber-100 text-amber-800 border-0 hover:bg-amber-100 text-[9px] font-black">WAITING</Badge>
                                                            ) : (
                                                                <Badge className="bg-blue-100 text-blue-800 border-0 hover:bg-blue-100 text-[9px] font-black">NOTIFIED</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right space-x-1">
                                                            {entry.status === 'WAITING' && (
                                                                <Button variant="outline" size="sm" onClick={() => updateStatus(entry.id, 'NOTIFIED')} className="h-7 text-[10px] font-bold border-blue-200 text-blue-700 hover:bg-blue-50">
                                                                    <MessageCircle className="w-3 h-3 mr-1" /> Notify
                                                                </Button>
                                                            )}
                                                            <Button variant="outline" size="sm" onClick={() => updateStatus(entry.id, 'SEATED')} className="h-7 text-[10px] font-bold border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                                                                <CheckCircle2 className="w-3 h-3 mr-1" /> Seat
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
                                <DialogTitle className="text-sm font-black uppercase tracking-widest">Add Walk-in Guest</DialogTitle>
                            </DialogHeader>
                        </div>
                        <form onSubmit={handleAddWalkIn} className="p-6 space-y-4 bg-white">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Guest Name</Label>
                                <Input required value={addForm.customerName} onChange={e => setAddForm({...addForm, customerName: e.target.value})} className="h-9 text-sm font-bold" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">Phone Number (For SMS)</Label>
                                <Input required type="tel" value={addForm.customerPhone} onChange={e => setAddForm({...addForm, customerPhone: e.target.value})} className="h-9 text-sm font-bold" placeholder="+90 5XX XXX XX XX" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Party Size</Label>
                                    <Input required type="number" min="1" value={addForm.partySize} onChange={e => setAddForm({...addForm, partySize: e.target.value})} className="h-9 text-sm font-bold" />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Quoted Wait (Mins)</Label>
                                    <Input type="number" value={addForm.quotedWaitTime} onChange={e => setAddForm({...addForm, quotedWaitTime: e.target.value})} className="h-9 text-sm font-bold" placeholder="Optional" />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-2">
                                <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)} className="h-9 text-xs font-bold">Cancel</Button>
                                <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase">Add to Queue</Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>

            </div>
        </AdminLayout>
    );
}
