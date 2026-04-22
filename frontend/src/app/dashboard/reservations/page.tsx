'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, Check, X, Clock, Search, Edit2, Trash2, 
  Star, MessageSquare, RotateCcw, Calendar as CalendarIcon, 
  Timer, CheckCircle2, ListFilter, CalendarDays, ChevronLeft, ChevronRight, Info 
} from 'lucide-react';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  table: { id: string, identifier: string } | null;
  category: { id: string, name: string } | null;
  notes: string | null;
  internalNote: string | null;
  isVIP: boolean;
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('upcoming');
  const [timeFilter, setTimeFilter] = useState('all');
  const [customDate, setCustomFilterDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerName: '', customerPhone: '', guestCount: '2',
    tableId: 'none', categoryId: 'none', notes: '',
    internalNote: '', isVIP: false
  });

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('19:00');
  
  const filterDateRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resRes, tablesRes, catRes] = await Promise.all([
        api.get('/reservations'), api.get('/tables'), api.get('/categories')
      ]);
      setReservations(resRes.data.data);
      setTables(tablesRes.data.data);
      setCategories(catRes.data.data);
    } finally { setLoading(false); }
  };

  const filteredReservations = useMemo(() => {
    return reservations.filter(res => {
      const matchesSearch = res.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || res.customerPhone.includes(searchQuery);
      const isClosed = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(res.status);
      const tabMatch = activeTab === 'upcoming' ? !isClosed : isClosed;
      if (!tabMatch || !matchesSearch) return false;

      if (timeFilter === 'all') return true;
      
      const resDate = new Date(res.startTime);
      const today = new Date();
      today.setHours(0,0,0,0);
      
      if (timeFilter === 'today') {
          return res.startTime.startsWith(today.toISOString().split('T')[0]);
      }
      
      if (timeFilter === 'tomorrow') {
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);
          return res.startTime.startsWith(tomorrow.toISOString().split('T')[0]);
      }

      if (timeFilter === 'this-week') {
          const start = new Date(today);
          start.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
          const end = new Date(start);
          end.setDate(start.getDate() + 7);
          return resDate >= start && resDate < end;
      }

      if (timeFilter === 'next-week') {
          const start = new Date(today);
          start.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) + 7);
          const end = new Date(start);
          end.setDate(start.getDate() + 7);
          return resDate >= start && resDate < end;
      }

      if (timeFilter === 'custom' && customDate) {
          return res.startTime.startsWith(customDate);
      }

      return true;
    });
  }, [reservations, activeTab, timeFilter, customDate, searchQuery]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.put(`/reservations/${id}/status`, { status });
      toast.success(`Status updated`);
      fetchData();
    } catch (err) { toast.error('Update failed'); }
  };

  const handleOpenEdit = (res: Reservation) => {
    setIsEditMode(true);
    setSelectedId(res.id);
    const dateObj = new Date(res.startTime);
    setFormData({
      customerName: res.customerName,
      customerPhone: res.customerPhone,
      guestCount: res.guestCount.toString(),
      tableId: res.table?.id || 'none',
      categoryId: res.category?.id || 'none',
      notes: res.notes || '',
      internalNote: res.internalNote || '',
      isVIP: res.isVIP
    });
    setSelectedDate(dateObj.toISOString().split('T')[0]);
    setSelectedTime(dateObj.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }));
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedDateTime = new Date(`${selectedDate}T${selectedTime}`);
    try {
      const payload = {
        ...formData,
        guestCount: parseInt(formData.guestCount),
        startTime: combinedDateTime.toISOString()
      };
      if (isEditMode && selectedId) {
        await api.put(`/reservations/${selectedId}`, payload);
        toast.success('Reservation saved');
      } else {
        await api.post('/reservations', payload);
        toast.success('Reservation created');
      }
      setIsDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this reservation?')) return;
    try {
      await api.delete(`/reservations/${id}`);
      toast.success('Deleted');
      fetchData();
    } catch (err) { toast.error('Delete failed'); }
  };

  const getRowColor = (status: string, isVIP: boolean) => {
      if (isVIP) return "bg-blue-100 hover:bg-blue-200/80 transition-colors";
      switch(status) {
          case 'PENDING': return "bg-amber-100/60 hover:bg-amber-200/60";
          case 'CONFIRMED': return "bg-emerald-100/50 hover:bg-emerald-200/50";
          case 'CANCELLED': return "bg-rose-100/60 hover:bg-rose-200/60";
          case 'COMPLETED': return "bg-slate-100 hover:bg-slate-200";
          case 'NO_SHOW': return "bg-slate-200 hover:bg-slate-300";
          default: return "";
      }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      PENDING: "bg-amber-500 text-white border-transparent",
      CONFIRMED: "bg-blue-500 text-white border-transparent",
      CANCELLED: "bg-red-500 text-white border-transparent",
      COMPLETED: "bg-slate-400 text-white border-transparent",
      NO_SHOW: "bg-slate-900 text-white border-transparent"
    };
    return <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-sm shadow-sm", styles[status as keyof typeof styles])}>{status.replace('_', ' ')}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4">
        {/* Header - Corporate Blue */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Reservations Dashboard</h1>
            <div className="flex items-center gap-2 mt-1">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Service Control Unit</p>
            </div>
          </div>
          <Button onClick={() => { setIsEditMode(false); setIsDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white rounded-md h-10 px-6 font-black text-xs shadow-lg shadow-blue-600/20">
            <Plus className="w-4 h-4 mr-2 stroke-[3]" /> NEW RESERVATION
          </Button>
        </div>

        {/* Command Center - Integrated & High Density */}
        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="p-0 border-b border-slate-100">
            <div className="flex flex-col">
              {/* Tab Selector */}
              <div className="flex items-center border-b border-slate-50 p-1 bg-slate-50/50">
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('upcoming')} className={cn("flex-1 h-9 text-[10px] font-black uppercase rounded-sm transition-all", activeTab === 'upcoming' ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600")}>
                    <Timer className="w-3.5 h-3.5 mr-2" /> Live & Pending
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab('history')} className={cn("flex-1 h-9 text-[10px] font-black uppercase rounded-sm transition-all", activeTab === 'history' ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-400 hover:text-slate-600")}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Service History
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between p-3 gap-4">
                <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-md border border-slate-200/60">
                  {[
                    { label: 'All', value: 'all' },
                    { label: 'Today', value: 'today' },
                    { label: 'Tomorrow', value: 'tomorrow' },
                    { label: 'This Week', value: 'this-week' },
                    { label: 'Next Week', value: 'next-week' }
                  ].map(f => (
                    <Button key={f.value} variant="ghost" size="sm" onClick={() => setTimeFilter(f.value)} className={cn("h-7 text-[9px] font-black uppercase px-3 rounded-sm transition-all", timeFilter === f.value ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700")}>{f.label}</Button>
                  ))}
                  <div className="w-px h-4 bg-slate-300 mx-1" />
                  <div className="relative">
                    <input type="date" ref={filterDateRef} value={customDate} onChange={(e) => {setCustomFilterDate(e.target.value); setTimeFilter('custom');}} className="sr-only" />
                    <Button variant="ghost" size="sm" onClick={() => filterDateRef.current?.showPicker()} className={cn("h-7 text-[9px] font-black uppercase px-3 rounded-sm transition-all", timeFilter === 'custom' ? "bg-blue-600 text-white" : "text-slate-500")}>
                        <CalendarIcon className="w-3 h-3 mr-1.5" /> {timeFilter === 'custom' && customDate ? customDate : 'Picker'}
                    </Button>
                  </div>
                </div>

                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Search guest name, phone, table..." className="pl-10 h-10 text-xs bg-slate-50 border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-500/5 rounded-md transition-all font-bold" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="h-10 hover:bg-transparent border-b border-slate-200">
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-6">Schedule</TableHead>
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Guest Context</TableHead>
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Table</TableHead>
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Service Notes</TableHead>
                  <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right px-6">Command</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-64 text-center text-xs text-slate-300 font-black uppercase tracking-widest">Refreshing Floor Sync...</TableCell></TableRow>
                ) : filteredReservations.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-64 text-center text-xs text-slate-300 font-black uppercase tracking-widest">Zero Matching Records</TableCell></TableRow>
                ) : filteredReservations.map((res) => (
                  <TableRow key={res.id} className={cn("h-16 border-b border-slate-50 transition-colors", getRowColor(res.status, res.isVIP))}>
                    <TableCell className="px-6">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-xl tracking-tighter leading-none mb-1">
                            {new Date(res.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-tight bg-blue-50/50 w-fit px-1.5 rounded border border-blue-100/50">
                            {new Date(res.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span className="font-black text-slate-800 text-sm uppercase tracking-tight">{res.customerName}</span>
                            {res.isVIP && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 animate-pulse" />}
                            <div className="h-4 w-[1px] bg-slate-200 mx-1" />
                            <span className="text-[10px] font-black text-slate-500">{res.guestCount} PAX</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-slate-400 font-mono font-bold">{res.customerPhone}</span>
                            <Badge variant="outline" className="text-[8px] h-4 border-slate-200 bg-white font-black text-slate-400 rounded-sm shadow-none uppercase">{res.category?.name || 'Manual'}</Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {res.table ? (
                        <div className="inline-flex flex-col items-center">
                            <div className="font-black text-slate-900 text-lg leading-none">{res.table.identifier}</div>
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">ASSIGNED</span>
                        </div>
                      ) : (
                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-sm border border-amber-200 uppercase tracking-tighter">Needs Assign</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2 max-w-[280px]">
                        <div className="flex items-center gap-2">{getStatusBadge(res.status)}</div>
                        {res.internalNote ? (
                          <div className="text-[10px] text-slate-700 font-bold bg-white/60 p-2 rounded border border-slate-200/50 shadow-sm italic leading-tight">
                            <Info className="w-2.5 h-2.5 text-blue-500 inline mr-1" /> {res.internalNote}
                          </div>
                        ) : (
                            <span className="text-[9px] text-slate-300 italic font-medium uppercase tracking-widest">No Intelligence</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 text-right">
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1.5">
                            {res.status === 'PENDING' && (
                            <>
                                <Button size="sm" onClick={() => updateStatus(res.id, 'CONFIRMED')} className="h-8 px-4 bg-green-600 hover:bg-green-700 text-[10px] font-black uppercase rounded shadow-lg shadow-green-600/10"><Check className="w-3.5 h-3.5 mr-1.5" /> Accept</Button>
                                <Button size="sm" variant="outline" onClick={() => updateStatus(res.id, 'CANCELLED')} className="h-8 px-4 text-red-600 hover:bg-red-50 border-red-200 text-[10px] font-black uppercase rounded">Reject</Button>
                            </>
                            )}
                            {res.status === 'CONFIRMED' && (
                            <Button size="sm" onClick={() => updateStatus(res.id, 'COMPLETED')} className="h-8 px-6 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded shadow-lg shadow-blue-600/10">Arrived</Button>
                            )}
                            {(res.status === 'CANCELLED' || res.status === 'NO_SHOW' || res.status === 'COMPLETED') && (
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(res.id, 'CONFIRMED')} className="h-8 text-blue-600 hover:bg-blue-50 text-[10px] font-black uppercase rounded">
                                <RotateCcw className="w-3 h-3 mr-1.5 stroke-[3]" /> Restore
                            </Button>
                            )}
                        </div>
                        <div className="flex items-center space-x-1 bg-white/40 p-0.5 rounded border border-slate-100/50">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(res)} className="h-7 w-7 text-slate-300 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(res.id)} className="h-7 w-7 text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dialog - Flat ngx-admin Style */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent maxWidth="sm:max-w-2xl" className="p-0 rounded-md overflow-hidden border-0 shadow-2xl">
            <form onSubmit={handleSubmit}>
              <div className="bg-slate-900 p-5 text-white flex justify-between items-center">
                <DialogHeader>
                  <DialogTitle className="text-xl font-black uppercase tracking-tight">{isEditMode ? 'Update Record' : 'Initialize Booking'}</DialogTitle>
                </DialogHeader>
              </div>
              
              <div className="p-8 grid grid-cols-2 gap-10 bg-white">
                <div className="space-y-6">
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Full Name Identity</Label>
                    <Input required value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} className="h-12 text-sm font-bold border-slate-200 focus:border-blue-500 rounded-sm" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Mobile Contact</Label>
                    <Input required value={formData.customerPhone} onChange={e => setFormData({...formData, customerPhone: e.target.value})} className="h-12 text-sm font-bold border-slate-200 focus:border-blue-500 rounded-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Party Pax</Label>
                        <Input type="number" min="1" required value={formData.guestCount} onChange={e => setFormData({...formData, guestCount: e.target.value})} className="h-12 text-sm font-black text-center border-slate-200 rounded-sm" />
                    </div>
                    <div className="grid gap-2">
                        <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Entry Source</Label>
                        <Select value={formData.categoryId} onValueChange={(v) => setFormData({...formData, categoryId: v || 'none'})}>
                            <SelectTrigger className="h-12 text-sm font-bold rounded-sm border-slate-200 focus:ring-0 shadow-none">
                                <SelectValue>
                                    {categories.find(c => c.id === formData.categoryId)?.name || 'Standard Service'}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none" className="text-xs">Standard Service</SelectItem>
                                {categories.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Calendar Date</Label>
                    <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-12 text-sm font-bold border-slate-200 focus:border-blue-500 rounded-sm" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Arrival Time</Label>
                    <Input type="time" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} className="h-12 text-sm font-bold border-slate-200 focus:border-blue-500 rounded-sm" />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Table Location</Label>
                    <Select value={formData.tableId} onValueChange={(v) => setFormData({...formData, tableId: v || 'none'})}>
                        <SelectTrigger className="h-12 text-sm font-bold rounded-sm border-slate-200 focus:ring-0 shadow-none">
                            <SelectValue>
                                {tables.find(t => t.id === formData.tableId)?.identifier || "Auto-Selection"}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none" className="text-xs italic">Auto-Assign Best Available</SelectItem>
                            {tables.map(t => <SelectItem key={t.id} value={t.id} className="text-xs font-bold">{t.identifier} (PAX: {t.capacity})</SelectItem>)}
                        </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="col-span-2 space-y-6 pt-4 border-t border-slate-50">
                    <div className="grid gap-2">
                        <Label className="text-[10px] font-black uppercase text-blue-600 tracking-[0.2em]">Service Intelligence (Staff Only)</Label>
                        <Textarea value={formData.internalNote} onChange={e => setFormData({...formData, internalNote: e.target.value})} className="min-h-[80px] text-sm font-medium border-blue-100 bg-blue-50/20 rounded-sm p-4 focus:ring-0 focus:border-blue-300" placeholder="e.g. Allergy warning, Seating preference, VIP detail..." />
                    </div>
                    <div className="flex items-center gap-3 bg-slate-900 p-4 rounded-md shadow-lg shadow-slate-900/10">
                        <Checkbox checked={formData.isVIP} onCheckedChange={(c) => setFormData({...formData, isVIP: !!c})} className="border-white/20 data-[state=checked]:bg-blue-500" />
                        <Label className="text-[10px] font-black uppercase text-white tracking-[0.3em]">Elevate to VIP Priority Status</Label>
                        <Star className={cn("w-4 h-4 ml-auto", formData.isVIP ? "text-amber-400 fill-amber-400" : "text-slate-600")} />
                    </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-11 text-xs font-black text-slate-400 uppercase tracking-widest px-8">ABORT</Button>
                <Button type="submit" className="h-11 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase px-12 rounded-sm shadow-xl shadow-blue-600/20">COMMIT ENTRY</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
