'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Edit2, Search, LayoutGrid, List, Layers, ShieldCheck, ShieldAlert } from 'lucide-react';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TableType {
  id: string;
  name: string;
  description: string;
}

interface DiningTable {
  id: string;
  identifier: string;
  capacity: number;
  isAvailable: boolean;
  tableType: TableType;
}

export default function TablesPage() {
  const [tableTypes, setTableTypes] = useState<TableType[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
  const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [tableForm, setTableForm] = useState({ identifier: '', capacity: '4', tableTypeId: '' });
  const [zoneForm, setZoneForm] = useState({ name: '', description: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [typesRes, tablesRes] = await Promise.all([
        api.get('/table-types'), api.get('/tables')
      ]);
      setTableTypes(typesRes.data.data);
      setTables(tablesRes.data.data);
    } finally { setLoading(false); }
  };

  const handleOpenCreateTable = () => {
    setIsEditMode(false);
    setSelectedId(null);
    setTableForm({ identifier: '', capacity: '4', tableTypeId: '' });
    setIsTableDialogOpen(true);
  };

  const handleOpenEditTable = (table: DiningTable) => {
    setIsEditMode(true);
    setSelectedId(table.id);
    setTableForm({
      identifier: table.identifier,
      capacity: table.capacity.toString(),
      tableTypeId: table.tableType?.id || ''
    });
    setIsTableDialogOpen(true);
  };

  const handleZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/table-types', zoneForm);
      toast.success('Zone created');
      setZoneForm({ name: '', description: '' });
      fetchData();
    } catch (err) { toast.error('Failed to create zone'); }
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm('Delete this zone? This might affect assigned tables.')) return;
    try {
      await api.delete(`/table-types/${id}`);
      toast.success('Zone deleted');
      fetchData();
    } catch (err) { toast.error('Delete failed'); }
  };

  const handleTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...tableForm, capacity: parseInt(tableForm.capacity) };
      if (isEditMode && selectedId) {
        await api.put(`/tables/${selectedId}`, payload);
        toast.success('Table updated');
      } else {
        await api.post('/tables', payload);
        toast.success('Table created');
      }
      setIsTableDialogOpen(false);
      fetchData();
    } catch (err) { toast.error('Save failed'); }
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm('Delete table?')) return;
    try {
      await api.delete(`/tables/${id}`);
      toast.success('Deleted');
      fetchData();
    } catch (err) { toast.error('Delete failed'); }
  };

  const filteredTables = tables.filter(t => t.identifier.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Floor & Tables</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black">Spatial Infrastructure</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isZoneDialogOpen} onOpenChange={setIsZoneDialogOpen}>
              <DialogTrigger render={
                <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase border-slate-200">Manage Zones</Button>
              } />
              <DialogContent maxWidth="sm:max-w-xl">
                <form onSubmit={handleZoneSubmit}>
                  <DialogHeader><DialogTitle className="text-2xl">Manage Zones</DialogTitle></DialogHeader>
                  <div className="space-y-6 py-6 border-b border-slate-50">
                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Zone Name</Label>
                            <Input required value={zoneForm.name} onChange={e => setZoneForm({...zoneForm, name: e.target.value})} placeholder="e.g. Garden, Terrace" className="h-10 rounded-sm font-bold" />
                        </div>
                        <div className="grid gap-2">
                            <Label className="text-[10px] font-black uppercase text-slate-400">Description</Label>
                            <Input value={zoneForm.description} onChange={e => setZoneForm({...zoneForm, description: e.target.value})} className="h-10 rounded-sm font-bold" />
                        </div>
                        <Button type="submit" className="bg-blue-600 h-10 text-[10px] font-black uppercase">Create Zone</Button>
                    </div>

                    <div className="mt-6">
                        <Label className="text-[10px] font-black uppercase text-slate-400">Existing Zones</Label>
                        <div className="mt-2 grid gap-2">
                            {tableTypes.map(t => (
                                <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-sm border border-slate-200/50">
                                    <div>
                                        <div className="text-xs font-black uppercase">{t.name}</div>
                                        <div className="text-[10px] text-slate-400 font-medium">{t.description || 'No description'}</div>
                                    </div>
                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteZone(t.id)} className="h-7 w-7 text-slate-300 hover:text-red-600">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                  </div>
                  <DialogFooter className="p-4"><Button type="button" variant="ghost" onClick={() => setIsZoneDialogOpen(false)} className="text-[10px] font-black">CLOSE</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Button size="sm" onClick={handleOpenCreateTable} className="bg-blue-600 hover:bg-blue-700 h-8 text-[10px] font-black uppercase">Add Physical Table</Button>
          </div>
        </div>

        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-bold text-slate-700">Physical Inventory</span>
                </div>
                <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input placeholder="Search identifier..." className="pl-8 h-8 text-xs bg-white border-slate-200 rounded-md" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
             </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="h-9 hover:bg-transparent">
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">Identifier</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Zone / Area</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Capacity</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Live Status</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">Refreshing Floor...</TableCell></TableRow>
                ) : filteredTables.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">No tables found</TableCell></TableRow>
                ) : filteredTables.map((table) => (
                  <TableRow key={table.id} className="h-12 hover:bg-slate-50/50 border-b border-slate-100 transition-colors">
                    <TableCell className="px-4">
                      <div className="font-black text-slate-900 uppercase text-sm tracking-tight">{table.identifier}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-white text-slate-500 border-slate-200 text-[9px] font-black uppercase px-1.5 py-0 rounded-sm">{table.tableType?.name || 'Standard'}</Badge>
                    </TableCell>
                    <TableCell className="text-center font-bold text-slate-700 text-xs">
                        {table.capacity} PAX
                    </TableCell>
                    <TableCell>
                        {table.isAvailable ? (
                            <div className="flex items-center gap-1.5 text-green-600 text-[10px] font-black uppercase tracking-tighter">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm" /> Available
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 text-red-600 text-[10px] font-black uppercase tracking-tighter">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm animate-pulse" /> Occupied
                            </div>
                        )}
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenEditTable(table)} className="h-7 w-7 text-slate-300 hover:text-blue-600 transition-colors"><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteTable(table.id)} className="h-7 w-7 text-slate-300 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Table Dialog */}
        <Dialog open={isTableDialogOpen} onOpenChange={setIsTableDialogOpen}>
          <DialogContent maxWidth="sm:max-w-md" className="p-0 rounded-md border-0 shadow-2xl">
            <form onSubmit={handleTableSubmit}>
                <div className="bg-slate-900 p-4 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold uppercase tracking-tight">{isEditMode ? 'Edit Table' : 'Add Physical Table'}</DialogTitle>
                    </DialogHeader>
                </div>
                <div className="p-6 space-y-5 bg-white">
                    <div className="grid gap-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Identifier</Label>
                        <Input required value={tableForm.identifier} onChange={e => setTableForm({...tableForm, identifier: e.target.value})} placeholder="e.g. T-10" className="h-10 text-sm font-bold rounded-sm border-slate-200" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Capacity</Label>
                            <Input type="number" min="1" required value={tableForm.capacity} onChange={e => setTableForm({...tableForm, capacity: e.target.value})} className="h-10 text-sm font-bold text-center rounded-sm border-slate-200" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Assign Zone</Label>
                            <Select value={tableForm.tableTypeId} onValueChange={(v) => setTableForm({...tableForm, tableTypeId: v || ''})}>
                                <SelectTrigger className="h-10 text-sm font-bold rounded-sm border-slate-200">
                                    <SelectValue placeholder="Select">
                                        {tableTypes.find(t => t.id === tableForm.tableTypeId)?.name || 'Select Zone'}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {tableTypes.map(t => <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setIsTableDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400">CANCEL</Button>
                    <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm">SAVE PHYSICAL TABLE</Button>
                </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
