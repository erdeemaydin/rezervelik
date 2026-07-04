'use client';

import { useState, useEffect, useRef } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Edit2, Search, LayoutGrid, List, Layers, Move, ShieldCheck, Square } from 'lucide-react';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from "@/i18n/provider";
import { useConfirm } from '@/components/ui/confirm-dialog';

interface TableType {
  id: string;
  name: string;
  description: string;
  parentId?: string | null;
}

interface DiningTable {
  id: string;
  identifier: string;
  capacity: number;
  isAvailable: boolean;
  tableType: TableType;
  positionX: number;
  positionY: number;
  shape: string;
  width: number;
  height: number;
  color: string | null;
}

// Fixed logical canvas size the floor plan is designed in. The canvas is scaled
// via CSS transform to fit whatever container width is available (any resolution),
// so stored positions/sizes stay in this logical coordinate space regardless of viewport.
const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 800;

interface FloorElement {
  id: string;
  type: string;
  label: string | null;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  color: string | null;
  tableTypeId: string;
}

export default function TablesPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const currentUser = useAuthStore(state => state.user);
  const hasEditPermission = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'ADMIN' || (currentUser?.permissions || '').includes('edit_floor_plan');

  const [tableTypes, setTableTypes] = useState<TableType[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [floorElements, setFloorElements] = useState<FloorElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isTableDialogOpen, setIsTableDialogOpen] = useState(false);
  const [isZoneDialogOpen, setIsZoneDialogOpen] = useState(false);
  const [isElementDialogOpen, setIsElementDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [isFloorPlanEditMode, setIsFloorPlanEditMode] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('all');

  const [tableForm, setTableForm] = useState({
    identifier: '', capacity: '4', tableTypeId: '',
    shape: 'rectangle', width: '60', height: '60', color: '#ffffff'
  });
  const [elementForm, setElementForm] = useState({
    tableTypeId: '', type: 'box', label: '', width: '200', height: '100', color: '#f8fafc'
  });
  const [zoneForm, setZoneForm] = useState({ name: '', description: '', parentId: '' });

  // Drag and drop state
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragInfo = useRef({ isDragging: false, isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0, dragId: null as string | null, dragType: null as 'table' | 'element' | null });

  // Scale factor so the fixed-size logical canvas fits any container width (any resolution/device).
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const updateScale = () => {
      const width = outer.clientWidth;
      const height = outer.clientHeight;
      if (!width || !height) return;
      // Fit the whole logical floor inside the visible area (both axes), so the
      // entire floor is always shown and rescales with the window — no scroll,
      // no dead space on the right. Capped at 1.5 to avoid over-zooming.
      const next = Math.min(1.5, width / CANVAS_WIDTH, height / CANVAS_HEIGHT);
      scaleRef.current = next;
      setScale(next);
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [typesRes, tablesRes, elementsRes] = await Promise.all([
        api.get('/table-types'), 
        api.get('/tables'),
        api.get('/floor-elements')
      ]);
      setTableTypes(typesRes.data.data);
      setTables(tablesRes.data.data);
      setFloorElements(elementsRes.data.data);
      if (selectedZoneId === 'all' && typesRes.data.data.length > 0) {
          setSelectedZoneId(typesRes.data.data[0].id);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const getFullZoneName = (zoneId: string, types: TableType[] = tableTypes): string => {
      const zone = types.find(t => t.id === zoneId);
      if (!zone) return '';
      if (zone.parentId) {
          return `${getFullZoneName(zone.parentId, types)} > ${zone.name}`;
      }
      return zone.name;
  };

  const handleOpenCreateTable = () => {
    setIsEditMode(false);
    setSelectedId(null);
    setTableForm({ identifier: '', capacity: '4', tableTypeId: selectedZoneId === 'all' ? (tableTypes[0]?.id || '') : selectedZoneId, shape: 'rectangle', width: '60', height: '60', color: '#ffffff' });
    setIsTableDialogOpen(true);
  };

  const handleOpenEditTable = (table: DiningTable) => {
    setIsEditMode(true);
    setSelectedId(table.id);
    setTableForm({
      identifier: table.identifier,
      capacity: table.capacity.toString(),
      tableTypeId: table.tableType?.id || '',
      shape: table.shape || 'rectangle',
      width: (table.width || 60).toString(),
      height: (table.height || 60).toString(),
      color: table.color || '#ffffff'
    });
    setIsTableDialogOpen(true);
  };

  const handleZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/table-types', {
          ...zoneForm,
          parentId: zoneForm.parentId || undefined
      });
      toast.success(t("tables.zoneCreated"));
      setZoneForm({ name: '', description: '', parentId: '' });
      fetchData();
    } catch (err) { toast.error(t("tables.zoneCreateFailed")); }
  };

  const handleDeleteZone = async (id: string) => {
    if (!await confirm({ title: t("tables.confirmDeleteZone"), tone: 'danger', confirmText: t("tables.deleteBtn") })) return;
    try {
      await api.delete(`/table-types/${id}`);
      toast.success(t("tables.zoneDeleted"));
      if (selectedZoneId === id) setSelectedZoneId('all');
      fetchData();
    } catch (err) { toast.error(t("tables.deleteFailed")); }
  };

  const handleTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { 
        ...tableForm, 
        capacity: parseInt(tableForm.capacity),
        width: parseInt(tableForm.width),
        height: parseInt(tableForm.height)
      };
      if (isEditMode && selectedId) {
        await api.put(`/tables/${selectedId}`, payload);
        toast.success(t("tables.tableUpdated"));
      } else {
        await api.post('/tables', payload);
        toast.success(t("tables.tableCreated"));
      }
      setIsTableDialogOpen(false);
      fetchData();
    } catch (err) { toast.error(t("tables.saveFailed")); }
  };

  const handleDeleteTable = async (id: string) => {
    if (!await confirm({ title: t("tables.confirmDeleteTable"), tone: 'danger', confirmText: t("tables.deleteBtn") })) return;
    try {
      await api.delete(`/tables/${id}`);
      toast.success(t("tables.deleted"));
      fetchData();
    } catch (err) { toast.error(t("tables.deleteFailed")); }
  };

  const handleOpenCreateElement = () => {
    setIsEditMode(false);
    setSelectedId(null);
    setElementForm({ tableTypeId: selectedZoneId === 'all' ? (tableTypes[0]?.id || '') : selectedZoneId, type: 'box', label: '', width: '200', height: '100', color: '#f8fafc' });
    setIsElementDialogOpen(true);
  };

  const handleOpenEditElement = (element: FloorElement) => {
    setIsEditMode(true);
    setSelectedId(element.id);
    setElementForm({
      tableTypeId: element.tableTypeId,
      type: element.type,
      label: element.label || '',
      width: element.width.toString(),
      height: element.height.toString(),
      color: element.color || '#f8fafc'
    });
    setIsElementDialogOpen(true);
  };

  const handleElementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { 
        ...elementForm, 
        width: parseInt(elementForm.width),
        height: parseInt(elementForm.height)
      };
      if (isEditMode && selectedId) {
        await api.put(`/floor-elements/${selectedId}`, payload);
        toast.success(t("tables.boxUpdated"));
      } else {
        await api.post('/floor-elements', payload);
        toast.success(t("tables.boxCreated"));
      }
      setIsElementDialogOpen(false);
      fetchData();
    } catch (err) { toast.error(t("tables.saveFailed")); }
  };

  const handleDeleteElement = async (id: string) => {
    if (!await confirm({ title: t("tables.confirmDeleteBox"), tone: 'danger', confirmText: t("tables.deleteBtn") })) return;
    try {
      await api.delete(`/floor-elements/${id}`);
      toast.success(t("tables.deleted"));
      fetchData();
    } catch (err) { toast.error(t("tables.deleteFailed")); }
  };

  const syncTablePosition = async (id: string, x: number, y: number) => {
    try {
        await api.put(`/tables/${id}`, { positionX: x, positionY: y });
        toast.success(t("tables.tablePosSaved"));
    } catch (error) {
        toast.error(t("tables.posSaveFailed"));
        fetchData();
    }
  };

  const syncTableSize = async (id: string, w: number, h: number) => {
    try {
        await api.put(`/tables/${id}`, { width: w, height: h });
        toast.success(t("tables.tableSizeSaved"));
    } catch (error) {
        toast.error(t("tables.posSaveFailed"));
        fetchData();
    }
  };

  const syncElementPosition = async (id: string, x: number, y: number) => {
    try {
        await api.put(`/floor-elements/${id}`, { positionX: x, positionY: y });
        toast.success(t("tables.boxPosSaved"));
    } catch (error) {
        toast.error(t("tables.posSaveFailed"));
        fetchData();
    }
  };

  const syncElementSize = async (id: string, w: number, h: number) => {
    try {
        await api.put(`/floor-elements/${id}`, { width: w, height: h });
        toast.success(t("tables.boxSizeSaved"));
    } catch (error) {
        toast.error(t("tables.sizeSaveFailed"));
        fetchData();
    }
  };

  const handlePointerDown = (e: React.PointerEvent, id: string, type: 'table' | 'element') => {
    if (!isFloorPlanEditMode) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragInfo.current = { 
        isDragging: false, 
        isResizing: false,
        startX: e.clientX, 
        startY: e.clientY,
        startWidth: 0,
        startHeight: 0,
        dragId: id,
        dragType: type
    };
  };

  const handleResizeDown = (e: React.PointerEvent, id: string, type: 'table' | 'element') => {
    if (!isFloorPlanEditMode) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (type === 'table') {
        const table = tables.find(tableItem => tableItem.id === id);
        if (!table) return;
        dragInfo.current = {
            isDragging: false,
            isResizing: true,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: table.width || 60,
            startHeight: table.height || 60,
            dragId: id,
            dragType: 'table'
        };
    } else {
        const element = floorElements.find(el => el.id === id);
        if (!element) return;
        dragInfo.current = {
            isDragging: false,
            isResizing: true,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: element.width || 200,
            startHeight: element.height || 100,
            dragId: id,
            dragType: 'element'
        };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isFloorPlanEditMode) return;
    const info = dragInfo.current;
    if (!info.dragId || !containerRef.current) return;
    const currentScale = scaleRef.current || 1;

    if (info.isResizing) {
        const minSize = info.dragType === 'table' ? 40 : 50;
        let newWidth = info.startWidth + (e.clientX - info.startX) / currentScale;
        let newHeight = info.startHeight + (e.clientY - info.startY) / currentScale;
        newWidth = Math.max(minSize, newWidth);
        newHeight = Math.max(minSize, newHeight);
        if (info.dragType === 'table') {
            setTables(prev => prev.map(tableItem => tableItem.id === info.dragId ? { ...tableItem, width: newWidth, height: newHeight } : tableItem));
        } else {
            setFloorElements(prev => prev.map(el => el.id === info.dragId ? { ...el, width: newWidth, height: newHeight } : el));
        }
        return;
    }

    if (!info.isDragging && (Math.abs(e.clientX - info.startX) > 5 || Math.abs(e.clientY - info.startY) > 5)) {
        info.isDragging = true;
    }

    if (!info.isDragging) return;

    const rect = containerRef.current.getBoundingClientRect();

    let itemWidth = 60;
    let itemHeight = 60;

    if (info.dragType === 'table') {
        const table = tables.find(t => t.id === info.dragId);
        if (!table) return;
        itemWidth = table.width || 60;
        itemHeight = table.height || 60;
    } else {
        const element = floorElements.find(el => el.id === info.dragId);
        if (!element) return;
        itemWidth = element.width || 200;
        itemHeight = element.height || 100;
    }

    // rect is in on-screen (scaled) pixels; convert back to the logical canvas space.
    let x = (e.clientX - rect.left) / currentScale - (itemWidth / 2);
    let y = (e.clientY - rect.top) / currentScale - (itemHeight / 2);

    x = Math.max(0, Math.min(x, CANVAS_WIDTH - itemWidth));
    y = Math.max(0, Math.min(y, CANVAS_HEIGHT - itemHeight));

    if (info.dragType === 'table') {
        setTables(prev => prev.map(tableItem => tableItem.id === info.dragId ? { ...tableItem, positionX: x, positionY: y } : tableItem));
    } else {
        setFloorElements(prev => prev.map(el => el.id === info.dragId ? { ...el, positionX: x, positionY: y } : el));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isFloorPlanEditMode) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const info = dragInfo.current;
    
    if (info.isResizing && info.dragId) {
        if (info.dragType === 'table') {
            const table = tables.find(t => t.id === info.dragId);
            if (table) syncTableSize(table.id, table.width, table.height);
        } else {
            const element = floorElements.find(el => el.id === info.dragId);
            if (element) syncElementSize(element.id, element.width, element.height);
        }
    } else if (info.isDragging && info.dragId) {
        if (info.dragType === 'table') {
            const table = tables.find(t => t.id === info.dragId);
            if (table) syncTablePosition(table.id, table.positionX, table.positionY);
        } else {
            const element = floorElements.find(el => el.id === info.dragId);
            if (element) syncElementPosition(element.id, element.positionX, element.positionY);
        }
    }
    
    dragInfo.current = { isDragging: false, isResizing: false, startX: 0, startY: 0, startWidth: 0, startHeight: 0, dragId: null, dragType: null };
  };

  const filteredTables = tables.filter(t => t.identifier.toLowerCase().includes(searchQuery.toLowerCase()));
  const zoneTables = selectedZoneId === 'all' ? tables : tables.filter(t => t.tableType?.id === selectedZoneId);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4 h-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{t("tables.pageTitle")}</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black">{t("tables.pageSubtitle")}</p>
          </div>
          <div className="flex items-center gap-4">
            {hasEditPermission && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-md">
                 <Label htmlFor="edit-mode" className="text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> {t("tables.enableLayoutEditing")}
                 </Label>
                 <Switch id="edit-mode" checked={isFloorPlanEditMode} onCheckedChange={setIsFloorPlanEditMode} />
              </div>
            )}
            
            {isFloorPlanEditMode && (
              <>
                <Dialog open={isZoneDialogOpen} onOpenChange={setIsZoneDialogOpen}>
                  <DialogTrigger render={
                    <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase border-slate-200">{t("tables.manageZones")}</Button>
                  } />
                  <DialogContent className="sm:max-w-xl">
                    <form onSubmit={handleZoneSubmit}>
                      <DialogHeader><DialogTitle className="text-2xl">{t("tables.manageZones")}</DialogTitle></DialogHeader>
                      <div className="space-y-6 py-6 border-b border-slate-50">
                        <div className="grid gap-4">
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.zoneName")}</Label>
                                <Input required value={zoneForm.name} onChange={e => setZoneForm({...zoneForm, name: e.target.value})} placeholder={t("tables.zoneNamePlaceholder")} className="h-10 rounded-sm font-bold" />
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.description")}</Label>
                                <Input value={zoneForm.description} onChange={e => setZoneForm({...zoneForm, description: e.target.value})} className="h-10 rounded-sm font-bold" />
                            </div>
                            <div className="grid gap-2">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.parentZone")}</Label>
                                <Select value={zoneForm.parentId} onValueChange={(v) => setZoneForm({...zoneForm, parentId: v === 'none' ? '' : (v || '')})}>
                                    <SelectTrigger className="h-10 text-sm font-bold rounded-sm border-slate-200">
                                        <SelectValue placeholder={t("tables.noParent")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t("tables.noParent")}</SelectItem>
                                        {tableTypes.map(tableItem => <SelectItem key={tableItem.id} value={tableItem.id} className="text-xs">{getFullZoneName(tableItem.id)}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="bg-blue-600 h-10 text-[10px] font-black uppercase">{t("tables.createZoneBtn")}</Button>
                        </div>

                        <div className="mt-6">
                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.existingZones")}</Label>
                            <div className="mt-2 grid gap-2 max-h-64 overflow-y-auto pr-2">
                                {tableTypes.map(zoneItem => (
                                    <div key={zoneItem.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-sm border border-slate-200/50">
                                        <div>
                                            <div className="text-xs font-black uppercase">{getFullZoneName(zoneItem.id)}</div>
                                            <div className="text-[10px] text-slate-400 font-medium">{zoneItem.description || t("tables.noDescription")}</div>
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDeleteZone(zoneItem.id)} className="h-7 w-7 text-slate-300 hover:text-red-600">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                      </div>
                      <DialogFooter className="p-4"><Button type="button" variant="ghost" onClick={() => setIsZoneDialogOpen(false)} className="text-[10px] font-black">{t("tables.closeBtn")}</Button></DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <Button size="sm" onClick={handleOpenCreateTable} className="bg-blue-600 hover:bg-blue-700 h-8 text-[10px] font-black uppercase">
                    <Plus className="w-3.5 h-3.5 mr-1" /> {t("tables.addTable")}
                </Button>
                <Button size="sm" onClick={handleOpenCreateElement} variant="secondary" className="h-8 text-[10px] font-black uppercase">
                    <Square className="w-3.5 h-3.5 mr-1" /> {t("tables.addBox")}
                </Button>
              </>
            )}
          </div>
        </div>

        <Tabs defaultValue="floor-plan" className="flex-1 flex flex-col h-[calc(100vh-150px)]">
            <div className="flex items-center justify-between mb-2">
                <TabsList className="bg-slate-100/50">
                    <TabsTrigger value="floor-plan" className="text-xs font-bold"><LayoutGrid className="w-4 h-4 mr-2" /> {t("tables.floorPlan")}</TabsTrigger>
                    <TabsTrigger value="list-view" className="text-xs font-bold"><List className="w-4 h-4 mr-2" /> {t("tables.listView")}</TabsTrigger>
                </TabsList>
                
                {isFloorPlanEditMode && (
                  <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-1"><Move className="w-3 h-3" /> {t("tables.dragToMove")}</div>
                    <div className="flex items-center gap-1"><Edit2 className="w-3 h-3" /> {t("tables.clickPencilToEdit")}</div>
                  </div>
                )}
            </div>

            <TabsContent value="floor-plan" className="flex-1 flex flex-col mt-0 data-[state=active]:flex">
                {/* Zone Filter Tabs */}
                {tableTypes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {tableTypes.map(zone => (
                      <Badge 
                        key={zone.id} 
                        variant="outline" 
                        onClick={() => setSelectedZoneId(zone.id)}
                        className={cn(
                          "cursor-pointer text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-sm transition-colors",
                          selectedZoneId === zone.id ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {getFullZoneName(zone.id)}
                      </Badge>
                    ))}
                  </div>
                )}

                <div ref={outerRef} className="flex-1 min-h-[420px] border border-slate-200 rounded-lg bg-slate-50 relative overflow-hidden flex items-center justify-center">
                    {/* Sizer: its box occupies the scaled footprint so the transformed
                        canvas has no dead layout space and stays centered. */}
                    <div style={{ width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale }} className="relative">
                    <div
                        ref={containerRef}
                        className="relative bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]"
                        style={{
                            width: CANVAS_WIDTH,
                            height: CANVAS_HEIGHT,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left'
                        }}
                    >
                        {floorElements.filter(el => selectedZoneId === 'all' || el.tableTypeId === selectedZoneId).map(el => (
                            <div
                                key={el.id}
                                className={cn(
                                    "absolute flex items-center justify-center border-2 border-dashed shadow-sm transition-colors group select-none overflow-hidden z-0",
                                    el.type === 'circle' ? 'rounded-full' : 'rounded-md',
                                    isFloorPlanEditMode ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                                    dragInfo.current.dragId === el.id && !dragInfo.current.isResizing ? 'z-40 shadow-xl border-blue-500 opacity-80' : 'border-slate-300 opacity-60 hover:opacity-100 hover:border-slate-400'
                                )}
                                style={{
                                    width: `${el.width || 200}px`,
                                    height: `${el.height || 100}px`,
                                    transform: `translate3d(${el.positionX || 0}px, ${el.positionY || 0}px, 0)`,
                                    backgroundColor: el.color || '#f8fafc',
                                    touchAction: isFloorPlanEditMode ? 'none' : 'auto'
                                }}
                                onPointerDown={(e) => handlePointerDown(e, el.id, 'element')}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerUp}
                            >
                                {el.label && <span className="absolute top-2 left-2 font-black text-slate-400/80 uppercase tracking-widest pointer-events-none px-2">{el.label}</span>}
                                
                                {isFloorPlanEditMode && (
                                    <>
                                        <div 
                                        className="absolute -top-2 -right-2 bg-blue-600 text-white p-1 rounded-full shadow-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-50 hover:bg-blue-700"
                                        onClick={(e) => { e.stopPropagation(); handleOpenEditElement(el); }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </div>
                                        <div 
                                        className="absolute bottom-0 right-0 w-4 h-4 bg-slate-400/50 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity z-50 rounded-tl-sm rounded-br-sm"
                                        onPointerDown={(e) => handleResizeDown(e, el.id, 'element')}
                                        />
                                    </>
                                )}
                            </div>
                        ))}
                        {zoneTables.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
                                <Layers className="w-12 h-12 mb-4 text-slate-200" />
                                <p className="text-sm font-bold">{t("tables.zoneEmpty")}</p>
                                {isFloorPlanEditMode && <p className="text-xs mt-1">{t("tables.clickAddTableToStart")}</p>}
                            </div>
                        ) : (
                            zoneTables.map(table => (
                                <div
                                    key={table.id}
                                    className={cn(
                                        "absolute flex flex-col items-center justify-center border-2 shadow-sm transition-colors group select-none z-10",
                                        table.shape === 'circle' ? 'rounded-full' : 'rounded-md',
                                        isFloorPlanEditMode ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                                        dragInfo.current.dragId === table.id ? 'z-50 shadow-xl border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400'
                                    )}
                                    style={{
                                        width: `${table.width || 60}px`,
                                        height: `${table.height || 60}px`,
                                        transform: `translate3d(${table.positionX || 0}px, ${table.positionY || 0}px, 0)`,
                                        backgroundColor: table.color || '#ffffff',
                                        touchAction: isFloorPlanEditMode ? 'none' : 'auto'
                                    }}
                                    onPointerDown={(e) => handlePointerDown(e, table.id, 'table')}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    onPointerCancel={handlePointerUp}
                                >
                                    <span className="font-black text-slate-800 pointer-events-none">{table.identifier}</span>
                                    <span className="text-[9px] text-slate-500 font-bold pointer-events-none">{table.capacity} {t("tables.pax")}</span>

                                    {/* Status Indicator */}
                                    <div className={cn(
                                        "absolute -bottom-1 w-3 h-3 rounded-full border-2 border-white",
                                        table.isAvailable ? 'bg-emerald-500' : 'bg-red-500'
                                    )} />

                                    {/* Edit Button overlay */}
                                    {isFloorPlanEditMode && (
                                      <>
                                        <div
                                          className="absolute -top-2 -right-2 bg-blue-600 text-white p-1 rounded-full shadow-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-50 hover:bg-blue-700"
                                          onClick={(e) => { e.stopPropagation(); handleOpenEditTable(table); }}
                                          onPointerDown={(e) => e.stopPropagation()} // Prevent drag start
                                        >
                                          <Edit2 className="w-3 h-3" />
                                        </div>
                                        <div
                                          className="absolute bottom-0 right-0 w-4 h-4 bg-slate-400/60 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity z-50 rounded-tl-sm"
                                          onPointerDown={(e) => handleResizeDown(e, table.id, 'table')}
                                        />
                                      </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="list-view" className="mt-0 flex-1 overflow-auto">
                <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
                <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-bold text-slate-700">{t("tables.physicalInventory")}</span>
                        </div>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <Input placeholder={t("tables.searchIdentifier")} className="pl-8 h-8 text-xs bg-white border-slate-200 rounded-md" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                    <TableHeader className="bg-slate-50/80">
                        <TableRow className="h-9 hover:bg-transparent">
                        <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">{t("tables.identifierHeader")}</TableHead>
                        <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t("tables.zoneAreaHeader")}</TableHead>
                        <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{t("tables.capacityHeader")}</TableHead>
                        <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t("tables.liveStatusHeader")}</TableHead>
                        <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-4">{t("tables.actionsHeader")}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">{t("tables.refreshing")}</TableCell></TableRow>
                        ) : filteredTables.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">{t("tables.noTablesFound")}</TableCell></TableRow>
                        ) : filteredTables.map((table) => (
                        <TableRow key={table.id} className="h-12 hover:bg-slate-50/50 border-b border-slate-100 transition-colors">
                            <TableCell className="px-4">
                            <div className="font-black text-slate-900 uppercase text-sm tracking-tight">{table.identifier}</div>
                            </TableCell>
                            <TableCell>
                            <Badge variant="outline" className="bg-white text-slate-500 border-slate-200 text-[9px] font-black uppercase px-1.5 py-0 rounded-sm">{table.tableType?.id ? getFullZoneName(table.tableType.id) : t("tables.standard")}</Badge>
                            </TableCell>
                            <TableCell className="text-center font-bold text-slate-700 text-xs">
                                {table.capacity} {t("tables.pax")}
                            </TableCell>
                            <TableCell>
                                {table.isAvailable ? (
                                    <div className="flex items-center gap-1.5 text-green-600 text-[10px] font-black uppercase tracking-tighter">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-sm" /> {t("tables.available")}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-red-600 text-[10px] font-black uppercase tracking-tighter">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm animate-pulse" /> {t("tables.occupied")}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell className="px-4 text-right">
                            {/* Edit/Delete are always available in the list view — only
                                dragging tables on the floor plan is gated by edit mode (#4.2) */}
                            <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEditTable(table)} className="h-7 w-7 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteTable(table.id)} className="h-7 w-7 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </CardContent>
                </Card>
            </TabsContent>
        </Tabs>

        {/* Table Dialog */}
        <Dialog open={isTableDialogOpen} onOpenChange={setIsTableDialogOpen}>
          <DialogContent className="sm:max-w-md p-0 rounded-md border-0 shadow-2xl">
            <form onSubmit={handleTableSubmit}>
                <div className="bg-slate-900 p-4 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold uppercase tracking-tight">{isEditMode ? t("tables.editTable") : t("tables.addPhysicalTable")}</DialogTitle>
                    </DialogHeader>
                </div>
                <div className="p-6 space-y-5 bg-white">
                    <div className="grid gap-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.identifier")}</Label>
                        <Input required value={tableForm.identifier} onChange={e => setTableForm({...tableForm, identifier: e.target.value})} placeholder={t("tables.identifierPlaceholder")} className="h-10 text-sm font-bold rounded-sm border-slate-200" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.capacityPax")}</Label>
                            <Input type="number" min="1" required value={tableForm.capacity} onChange={e => setTableForm({...tableForm, capacity: e.target.value})} className="h-10 text-sm font-bold rounded-sm border-slate-200" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.assignZone")}</Label>
                            <Select value={tableForm.tableTypeId} onValueChange={(v) => setTableForm({...tableForm, tableTypeId: v || ''})}>
                                <SelectTrigger className="h-10 text-sm font-bold rounded-sm border-slate-200">
                                    <SelectValue placeholder={t("tables.selectZone")}>
                                        {tableForm.tableTypeId ? getFullZoneName(tableForm.tableTypeId) : t("tables.selectZone")}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {tableTypes.map(tableItem => <SelectItem key={tableItem.id} value={tableItem.id} className="text-xs">{getFullZoneName(tableItem.id)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-5">
                        <Label className="text-xs font-black uppercase tracking-tight text-slate-800 mb-3 block">{t("tables.visualSettings")}</Label>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.shape")}</Label>
                                <Select value={tableForm.shape} onValueChange={(v) => setTableForm({...tableForm, shape: v || 'rectangle'})}>
                                    <SelectTrigger className="h-10 text-sm font-bold rounded-sm border-slate-200">
                                        <SelectValue placeholder={t("tables.shapePlaceholder")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="rectangle">{t("tables.rectangle")}</SelectItem>
                                        <SelectItem value="circle">{t("tables.circle")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.backgroundColor")}</Label>
                                <Input type="color" value={tableForm.color} onChange={e => setTableForm({...tableForm, color: e.target.value})} className="h-10 w-full p-1 rounded-sm border-slate-200" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.widthPx")}</Label>
                                <Input type="number" min="40" max="300" required value={tableForm.width} onChange={e => setTableForm({...tableForm, width: e.target.value})} className="h-10 text-sm font-bold rounded-sm border-slate-200" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.heightPx")}</Label>
                                <Input type="number" min="40" max="300" required value={tableForm.height} onChange={e => setTableForm({...tableForm, height: e.target.value})} className="h-10 text-sm font-bold rounded-sm border-slate-200" />
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium mt-3">{t("tables.dragResizeHint")}</p>
                    </div>

                    {isEditMode && (
                        <div className="pt-2">
                             <Button type="button" variant="destructive" className="w-full text-xs font-bold uppercase tracking-widest" onClick={() => {
                                 setIsTableDialogOpen(false);
                                 handleDeleteTable(selectedId!);
                             }}>
                                <Trash2 className="w-4 h-4 mr-2" /> {t("tables.deleteTableBtn")}
                             </Button>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setIsTableDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400">{t("tables.cancelBtn")}</Button>
                    <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm">{t("tables.savePhysicalTableBtn")}</Button>
                </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Floor Element Dialog */}
        <Dialog open={isElementDialogOpen} onOpenChange={setIsElementDialogOpen}>
          <DialogContent className="sm:max-w-md p-0 rounded-md border-0 shadow-2xl">
            <form onSubmit={handleElementSubmit}>
                <div className="bg-slate-900 p-4 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold uppercase tracking-tight">{isEditMode ? t("tables.editVisualBox") : t("tables.addVisualBox")}</DialogTitle>
                    </DialogHeader>
                </div>
                <div className="p-6 space-y-5 bg-white">
                    <div className="grid gap-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.labelOptional")}</Label>
                        <Input value={elementForm.label} onChange={e => setElementForm({...elementForm, label: e.target.value})} placeholder={t("tables.labelPlaceholder")} className="h-10 text-sm font-bold rounded-sm border-slate-200" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.assignZone")}</Label>
                            <Select value={elementForm.tableTypeId} onValueChange={(v) => setElementForm({...elementForm, tableTypeId: v || ''})}>
                                <SelectTrigger className="h-10 text-sm font-bold rounded-sm border-slate-200">
                                    <SelectValue placeholder={t("tables.selectZone")}>
                                        {elementForm.tableTypeId ? getFullZoneName(elementForm.tableTypeId) : t("tables.selectZone")}
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                    {tableTypes.map(tableItem => <SelectItem key={tableItem.id} value={tableItem.id} className="text-xs">{getFullZoneName(tableItem.id)}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.backgroundColor")}</Label>
                            <Input type="color" value={elementForm.color} onChange={e => setElementForm({...elementForm, color: e.target.value})} className="h-10 w-full p-1 rounded-sm border-slate-200" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.widthPx")}</Label>
                            <Input type="number" min="50" max="1000" required value={elementForm.width} onChange={e => setElementForm({...elementForm, width: e.target.value})} className="h-10 text-sm font-bold rounded-sm border-slate-200" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("tables.heightPx")}</Label>
                            <Input type="number" min="50" max="1000" required value={elementForm.height} onChange={e => setElementForm({...elementForm, height: e.target.value})} className="h-10 text-sm font-bold rounded-sm border-slate-200" />
                        </div>
                    </div>

                    {isEditMode && (
                        <div className="pt-2">
                             <Button type="button" variant="destructive" className="w-full text-xs font-bold uppercase tracking-widest" onClick={() => {
                                 setIsElementDialogOpen(false);
                                 handleDeleteElement(selectedId!);
                             }}>
                                <Trash2 className="w-4 h-4 mr-2" /> {t("tables.deleteBoxBtn")}
                             </Button>
                        </div>
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setIsElementDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400">{t("tables.cancelBtn")}</Button>
                    <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm">{t("tables.saveBoxBtn")}</Button>
                </div>
            </form>
          </DialogContent>
        </Dialog>

      </div>
    </AdminLayout>
  );
}