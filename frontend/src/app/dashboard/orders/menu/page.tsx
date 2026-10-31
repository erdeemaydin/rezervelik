'use client';

// Dashboard "Order Menu" window — the curated online-order catalog
// (docs/packaging/online-ordering-v2-plan.md decision #1). The tenant picks
// which MenuItems sell online and layers online-only overrides on top; the
// underlying MenuItem records are never forked, so this page only ever writes
// OrderMenuItem / OrderMenuCategory rows through /api/orders/order-menu.
//
// Replaces the inline per-item toggle that used to live on dashboard/menus.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  ArrowLeft, Plus, Search, GripVertical, Edit2, Trash2, PauseCircle, PlayCircle,
  Image as ImageIcon, Layers, ListChecks, Settings2, RotateCcw, Check,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/provider';

// --- Types (mirror src/controllers/orderMenuController.ts getOrderMenu) ---
interface OrderCategory {
  id: string;
  name: string;
  sortOrder: number;
}

interface SourceItem {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  categoryName: string;
  inCatalog: boolean;
}

interface CatalogRow {
  id: string;
  menuItemId: string;
  orderCategoryId: string | null;
  isListed: boolean;
  isAvailable: boolean;
  pausedUntil: string | null;
  pausedIndefinitely: boolean;
  priceOverride: number | null;
  nameOverride: string | null;
  descriptionOverride: string | null;
  imageUrlOverride: string | null;
  prepTimeMinutes: number | null;
  sortOrder: number;
  paused: boolean;
  menuItem: {
    id: string;
    name: string;
    price: number;
    description: string | null;
    imageUrl: string | null;
    isAvailable: boolean;
    prepTimeMinutes: number | null;
    order: number;
    category: { id: string; name: string } | null;
  };
  effective: {
    name: string;
    description: string | null;
    imageUrl: string | null;
    price: number;
    prepTimeMinutes: number;
  };
}

const NO_ORDER_CATEGORY = '__none__';

// Pause presets. The ISO instant is computed client-side (the backend takes an
// absolute timestamp, not a duration) so "until tomorrow" means the next
// midnight in the *staff member's* local time, which is the clock they're
// actually looking at when they pause a sold-out dish for the night.
type PausePreset = 'ONE_HOUR' | 'TWO_HOURS' | 'TOMORROW' | 'INDEFINITE';

const pausePayload = (preset: PausePreset): { pausedUntil?: string | null; pausedIndefinitely?: boolean } => {
  if (preset === 'INDEFINITE') return { pausedIndefinitely: true };
  const until = new Date();
  if (preset === 'ONE_HOUR') until.setTime(until.getTime() + 60 * 60 * 1000);
  else if (preset === 'TWO_HOURS') until.setTime(until.getTime() + 2 * 60 * 60 * 1000);
  else until.setHours(24, 0, 0, 0); // next local midnight
  return { pausedUntil: until.toISOString(), pausedIndefinitely: false };
};

export default function OrderMenuPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const localeTag = locale === 'tr' ? 'tr-TR' : 'en-US';

  const [restaurantProfile, setRestaurantProfile] = useState<any>(null);
  useEffect(() => {
    api.get('/restaurants/me').then((res) => setRestaurantProfile(res.data.data)).catch(() => {});
  }, []);

  const formatPrice = useMemo(() => {
    const currency = restaurantProfile?.settings?.currency || 'TRY';
    return (price: number) => {
      try {
        return price.toLocaleString(localeTag, { style: 'currency', currency });
      } catch {
        return `${price.toLocaleString(localeTag)} ${currency}`;
      }
    };
  }, [restaurantProfile, localeTag]);

  const [orderCategories, setOrderCategories] = useState<OrderCategory[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/orders/order-menu');
      const data = res.data.data;
      setOrderCategories(data.orderCategories ?? []);
      setCatalog(data.catalog ?? []);
      setSourceItems(data.sourceItems ?? []);
      setLoadFailed(false);
    } catch (err) {
      setLoadFailed(true);
      toast.error(t('orders.orderMenu.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // --- Sections -------------------------------------------------------------
  // Order-only categories first (their own sortOrder), then everything still
  // filed under its source MenuCategory. Same shape the customer menu uses.
  const rowsFor = useCallback(
    (categoryId: string | null) =>
      catalog
        .filter((r) => r.orderCategoryId === categoryId)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [catalog]
  );

  const orderOnlySections = useMemo(
    () =>
      orderCategories
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((c) => ({ key: `order:${c.id}`, name: c.name, rows: rowsFor(c.id) })),
    [orderCategories, rowsFor]
  );

  const menuSections = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; minOrder: number; rows: CatalogRow[] }>();
    for (const row of rowsFor(null)) {
      const cat = row.menuItem.category;
      const key = cat?.id ?? NO_ORDER_CATEGORY;
      const name = cat?.name ?? t('orders.orderMenu.sections.uncategorized');
      let group = groups.get(key);
      if (!group) {
        group = { key: `menu:${key}`, name, minOrder: Number.MAX_SAFE_INTEGER, rows: [] };
        groups.set(key, group);
      }
      group.rows.push(row);
      group.minOrder = Math.min(group.minOrder, row.menuItem.order ?? 0);
    }
    return Array.from(groups.values()).sort((a, b) => a.minOrder - b.minOrder || a.name.localeCompare(b.name));
  }, [rowsFor, t]);

  // --- Row mutations --------------------------------------------------------
  const patchRow = (id: string, patch: Partial<CatalogRow>) =>
    setCatalog((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const toggleFlag = async (row: CatalogRow, field: 'isListed' | 'isAvailable', value: boolean) => {
    patchRow(row.id, { [field]: value } as Partial<CatalogRow>);
    try {
      await api.put(`/orders/order-menu/items/${row.id}`, { [field]: value });
    } catch (err) {
      toast.error(t('orders.orderMenu.toggleFailed'));
      fetchAll();
    }
  };

  const [pauseOpenId, setPauseOpenId] = useState<string | null>(null);

  const applyPause = async (row: CatalogRow, preset: PausePreset | 'RESUME') => {
    setPauseOpenId(null);
    const body = preset === 'RESUME' ? { pausedUntil: null, pausedIndefinitely: false } : pausePayload(preset);
    try {
      const res = await api.patch(`/orders/order-menu/items/${row.id}/pause`, body);
      const updated = res.data.data;
      patchRow(row.id, {
        pausedUntil: updated?.pausedUntil ?? null,
        pausedIndefinitely: updated?.pausedIndefinitely ?? false,
        // `paused` is computed server-side on GET only, so keep the local flag
        // in step here rather than round-tripping the whole catalog.
        paused: preset !== 'RESUME',
      });
      toast.success(preset === 'RESUME' ? t('orders.orderMenu.pause.resumed') : t('orders.orderMenu.pause.paused'));
    } catch (err) {
      toast.error(t('orders.orderMenu.pause.failed'));
      fetchAll();
    }
  };

  const handleRemove = async (row: CatalogRow) => {
    const ok = await confirm({
      title: t('orders.orderMenu.remove.confirmTitle'),
      description: t('orders.orderMenu.remove.confirmDesc'),
      details: [{ label: t('orders.orderMenu.edit.name'), value: row.effective.name }],
      tone: 'danger',
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await api.delete(`/orders/order-menu/items/${row.id}`);
      toast.success(t('orders.orderMenu.remove.removed'));
      fetchAll();
    } catch (err) {
      toast.error(t('orders.orderMenu.remove.failed'));
    }
  };

  const persistItemOrder = async (ordered: CatalogRow[]) => {
    const items = ordered.map((r, index) => ({ id: r.id, sortOrder: index }));
    const bySortOrder = new Map(items.map((i) => [i.id, i.sortOrder]));
    setCatalog((prev) => prev.map((r) => (bySortOrder.has(r.id) ? { ...r, sortOrder: bySortOrder.get(r.id)! } : r)));
    try {
      await api.put('/orders/order-menu/reorder', { items });
    } catch (err) {
      toast.error(t('orders.orderMenu.reorder.failed'));
      fetchAll();
    }
  };

  // --- Add items ------------------------------------------------------------
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  const groupedSourceItems = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    const groups: { categoryId: string; categoryName: string; items: SourceItem[] }[] = [];
    for (const item of sourceItems) {
      if (q && !item.name.toLowerCase().includes(q) && !item.categoryName.toLowerCase().includes(q)) continue;
      let group = groups.find((g) => g.categoryId === item.categoryId);
      if (!group) {
        group = { categoryId: item.categoryId, categoryName: item.categoryName, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }, [sourceItems, addSearch]);

  const handleAddItem = async (item: SourceItem) => {
    setAddingId(item.id);
    try {
      await api.post('/orders/order-menu/items', { menuItemId: item.id });
      toast.success(t('orders.orderMenu.addDialog.added'));
      await fetchAll();
    } catch (err) {
      toast.error(t('orders.orderMenu.addDialog.addFailed'));
    } finally {
      setAddingId(null);
    }
  };

  // --- Edit dialog ----------------------------------------------------------
  const [editRow, setEditRow] = useState<CatalogRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    nameOverride: '', descriptionOverride: '', imageUrlOverride: '',
    priceOverride: '', prepTimeMinutes: '', orderCategoryId: NO_ORDER_CATEGORY,
  });

  const openEdit = (row: CatalogRow) => {
    setEditRow(row);
    setEditForm({
      nameOverride: row.nameOverride ?? '',
      descriptionOverride: row.descriptionOverride ?? '',
      imageUrlOverride: row.imageUrlOverride ?? '',
      priceOverride: row.priceOverride != null ? String(row.priceOverride) : '',
      prepTimeMinutes: row.prepTimeMinutes != null ? String(row.prepTimeMinutes) : '',
      orderCategoryId: row.orderCategoryId ?? NO_ORDER_CATEGORY,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRow || savingEdit) return;
    setSavingEdit(true);
    try {
      // Every override is sent on every save: '' is the wire form of "clear
      // this override and fall back to the menu item" (orderMenuController's
      // nullableString/nullableNumber), which is exactly what an emptied field
      // — or the "reset to menu default" button — means here.
      await api.put(`/orders/order-menu/items/${editRow.id}`, {
        nameOverride: editForm.nameOverride,
        descriptionOverride: editForm.descriptionOverride,
        imageUrlOverride: editForm.imageUrlOverride,
        priceOverride: editForm.priceOverride,
        prepTimeMinutes: editForm.prepTimeMinutes,
        orderCategoryId: editForm.orderCategoryId === NO_ORDER_CATEGORY ? null : editForm.orderCategoryId,
      });
      toast.success(t('orders.orderMenu.edit.saved'));
      setEditRow(null);
      fetchAll();
    } catch (err) {
      toast.error(t('orders.orderMenu.edit.saveFailed'));
    } finally {
      setSavingEdit(false);
    }
  };

  // --- Categories dialog ----------------------------------------------------
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name || savingCategory) return;
    setSavingCategory(true);
    try {
      await api.post('/orders/order-menu/categories', { name, sortOrder: orderCategories.length });
      setNewCategoryName('');
      toast.success(t('orders.orderMenu.categories.created'));
      fetchAll();
    } catch (err) {
      toast.error(t('orders.orderMenu.categories.saveFailed'));
    } finally {
      setSavingCategory(false);
    }
  };

  const handleRenameCategory = async (category: OrderCategory) => {
    const name = renameValue.trim();
    if (!name || name === category.name) { setRenamingId(null); return; }
    try {
      await api.put(`/orders/order-menu/categories/${category.id}`, { name });
      setRenamingId(null);
      toast.success(t('orders.orderMenu.categories.updated'));
      fetchAll();
    } catch (err) {
      toast.error(t('orders.orderMenu.categories.saveFailed'));
    }
  };

  const handleDeleteCategory = async (category: OrderCategory) => {
    const ok = await confirm({
      title: t('orders.orderMenu.categories.confirmDeleteTitle'),
      description: t('orders.orderMenu.categories.confirmDeleteDesc'),
      details: [{ label: t('orders.orderMenu.categories.nameLabel'), value: category.name }],
      tone: 'danger',
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await api.delete(`/orders/order-menu/categories/${category.id}`);
      toast.success(t('orders.orderMenu.categories.deleted'));
      fetchAll();
    } catch (err) {
      toast.error(t('orders.orderMenu.categories.deleteFailed'));
    }
  };

  const persistCategoryOrder = async (ordered: OrderCategory[]) => {
    const categories = ordered.map((c, index) => ({ id: c.id, sortOrder: index }));
    setOrderCategories(ordered.map((c, index) => ({ ...c, sortOrder: index })));
    try {
      await api.put('/orders/order-menu/reorder', { categories });
    } catch (err) {
      toast.error(t('orders.orderMenu.reorder.failed'));
      fetchAll();
    }
  };

  // --- Render ---------------------------------------------------------------
  const sortedCategories = useMemo(
    () => orderCategories.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [orderCategories]
  );

  const renderSection = (key: string, name: string, rows: CatalogRow[], isOrderOnly: boolean) => (
    <Card key={key} className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
      <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {isOrderOnly ? <Layers className="w-4 h-4 text-blue-500" /> : <ListChecks className="w-4 h-4 text-slate-400" />}
          <span className="text-xs font-black uppercase tracking-widest text-slate-700">{name}</span>
          {isOrderOnly && (
            <Badge variant="outline" className="text-[8px] font-black uppercase border-blue-200 bg-blue-50 text-blue-600">
              {t('orders.orderMenu.sections.orderOnlyBadge')}
            </Badge>
          )}
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          {rows.length} {t('orders.orderMenu.sections.itemsSuffix')}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-300">
            {t('orders.orderMenu.sections.emptySection')}
          </div>
        ) : (
          <SortableRows rows={rows} onReorder={persistItemOrder}>
            {(row, dragProps) => (
              <CatalogRowView
                row={row}
                dragProps={dragProps}
                formatPrice={formatPrice}
                localeTag={localeTag}
                pauseOpen={pauseOpenId === row.id}
                setPauseOpen={(open) => setPauseOpenId(open ? row.id : null)}
                onToggle={toggleFlag}
                onPause={applyPause}
                onEdit={openEdit}
                onRemove={handleRemove}
                t={t}
              />
            )}
          </SortableRows>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/orders')} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('orders.orderMenu.title')}</h1>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 italic">{t('orders.orderMenu.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/orders/settings">
            <Button variant="outline" size="sm" className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white">
              <Settings2 className="w-3.5 h-3.5 mr-1.5" /> {t('orders.settingsBtn')}
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => setCategoriesOpen(true)} className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white">
            <Layers className="w-3.5 h-3.5 mr-1.5" /> {t('orders.orderMenu.manageCategoriesBtn')}
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded-sm shadow-md shadow-blue-600/20">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> {t('orders.orderMenu.addItemsBtn')}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card className="rounded-md border-slate-200 shadow-sm bg-white">
          <CardContent className="h-48 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-300">
            {t('orders.orderMenu.loading')}
          </CardContent>
        </Card>
      ) : loadFailed ? (
        <Card className="rounded-md border-red-200 shadow-sm bg-red-50/40">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-sm font-black text-slate-700">{t('orders.orderMenu.loadFailed')}</p>
            <Button variant="outline" size="sm" onClick={fetchAll} className="h-9 text-[10px] font-black uppercase border-slate-200 bg-white">
              {t('orders.orderMenu.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : catalog.length === 0 ? (
        <Card className="rounded-md border-slate-200 border-dashed shadow-none bg-white">
          <CardContent className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto">
              <ListChecks className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-sm font-black text-slate-700">{t('orders.orderMenu.empty.title')}</p>
            <p className="text-xs text-slate-400 font-medium max-w-md mx-auto">{t('orders.orderMenu.empty.desc')}</p>
            <Button size="sm" onClick={() => setAddOpen(true)} className="h-9 px-5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> {t('orders.orderMenu.empty.cta')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orderOnlySections.map((s) => renderSection(s.key, s.name, s.rows, true))}
          {menuSections.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('orders.orderMenu.sections.fromMenu')}</span>
                <div className="h-px bg-slate-200 flex-1" />
              </div>
              {menuSections.map((s) => renderSection(s.key, s.name, s.rows, false))}
            </>
          )}
        </div>
      )}

      {/* ---- ADD ITEMS ---- */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent maxWidth="sm:max-w-2xl" className="p-0 rounded-md border-0 shadow-2xl">
          <div className="bg-slate-900 p-4 text-white">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold uppercase tracking-widest">{t('orders.orderMenu.addDialog.title')}</DialogTitle>
            </DialogHeader>
            <p className="text-[10px] text-slate-400 font-bold mt-1">{t('orders.orderMenu.addDialog.desc')}</p>
          </div>
          <div className="p-4 bg-white border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder={t('orders.orderMenu.addDialog.searchPlaceholder')}
                className="pl-10 h-10 text-xs font-bold bg-slate-50 border-slate-200 rounded-sm"
              />
            </div>
          </div>
          <div className="bg-white max-h-[55vh] overflow-y-auto">
            {groupedSourceItems.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-300">
                {sourceItems.length === 0 ? t('orders.orderMenu.addDialog.noItems') : t('orders.orderMenu.addDialog.noResults')}
              </div>
            ) : groupedSourceItems.map((group) => (
              <div key={group.categoryId}>
                <div className="px-5 py-2 bg-slate-50/70 border-y border-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  {group.categoryName}
                </div>
                {group.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-5 py-2.5 border-b border-slate-50 last:border-0">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">{item.name}</div>
                      <div className="text-[10px] font-bold text-slate-400">{formatPrice(item.price)}</div>
                    </div>
                    {item.inCatalog ? (
                      <Badge variant="outline" className="text-[9px] font-black uppercase border-emerald-200 bg-emerald-50 text-emerald-600 shrink-0">
                        <Check className="w-3 h-3 mr-1" /> {t('orders.orderMenu.addDialog.inCatalog')}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={addingId === item.id}
                        onClick={() => handleAddItem(item)}
                        className="h-7 px-3 text-[10px] font-black uppercase border-blue-200 text-blue-600 hover:bg-blue-50 shrink-0 disabled:opacity-60"
                      >
                        <Plus className="w-3 h-3 mr-1" /> {t('orders.orderMenu.addDialog.addBtn')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
            <Button variant="ghost" onClick={() => setAddOpen(false)} className="h-9 text-xs font-bold text-slate-500 uppercase">{t('orders.orderMenu.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- EDIT OVERRIDES ---- */}
      <Dialog open={!!editRow} onOpenChange={(open) => { if (!open) setEditRow(null); }}>
        <DialogContent maxWidth="sm:max-w-lg" className="p-0 rounded-md border-0 shadow-2xl">
          {editRow && (
            <form onSubmit={handleSaveEdit}>
              <div className="bg-slate-900 p-4 text-white">
                <DialogHeader>
                  <DialogTitle className="text-sm font-bold uppercase tracking-widest">{t('orders.orderMenu.edit.title')}</DialogTitle>
                </DialogHeader>
                <p className="text-[10px] text-slate-400 font-bold mt-1">{editRow.menuItem.name}</p>
              </div>
              <div className="p-6 space-y-4 bg-white max-h-[65vh] overflow-y-auto">
                <OverrideField
                  label={t('orders.orderMenu.edit.name')}
                  hint={`${t('orders.orderMenu.edit.menuDefault')}: ${editRow.menuItem.name}`}
                  isSet={editForm.nameOverride !== ''}
                  onReset={() => setEditForm((f) => ({ ...f, nameOverride: '' }))}
                  resetLabel={t('orders.orderMenu.edit.reset')}
                >
                  <Input
                    value={editForm.nameOverride}
                    onChange={(e) => setEditForm((f) => ({ ...f, nameOverride: e.target.value }))}
                    placeholder={editRow.menuItem.name}
                    className="h-10 text-sm font-bold border-slate-200 rounded-sm"
                  />
                </OverrideField>

                <OverrideField
                  label={t('orders.orderMenu.edit.description')}
                  hint={t('orders.orderMenu.edit.descriptionHint')}
                  isSet={editForm.descriptionOverride !== ''}
                  onReset={() => setEditForm((f) => ({ ...f, descriptionOverride: '' }))}
                  resetLabel={t('orders.orderMenu.edit.reset')}
                >
                  <Textarea
                    value={editForm.descriptionOverride}
                    onChange={(e) => setEditForm((f) => ({ ...f, descriptionOverride: e.target.value }))}
                    placeholder={editRow.menuItem.description ?? ''}
                    rows={3}
                    className="text-sm border-slate-200 rounded-sm"
                  />
                </OverrideField>

                <div className="grid grid-cols-2 gap-4">
                  <OverrideField
                    label={t('orders.orderMenu.edit.price')}
                    hint={`${t('orders.orderMenu.edit.menuDefault')}: ${formatPrice(editRow.menuItem.price)}`}
                    isSet={editForm.priceOverride !== ''}
                    onReset={() => setEditForm((f) => ({ ...f, priceOverride: '' }))}
                    resetLabel={t('orders.orderMenu.edit.reset')}
                  >
                    <Input
                      type="number" min="0" step="0.01"
                      value={editForm.priceOverride}
                      onChange={(e) => setEditForm((f) => ({ ...f, priceOverride: e.target.value }))}
                      placeholder={String(editRow.menuItem.price)}
                      className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono"
                    />
                  </OverrideField>

                  <OverrideField
                    label={t('orders.orderMenu.edit.prepTime')}
                    hint={`${t('orders.orderMenu.edit.effective')}: ${editRow.effective.prepTimeMinutes} ${t('orders.detail.minutesSuffix')}`}
                    isSet={editForm.prepTimeMinutes !== ''}
                    onReset={() => setEditForm((f) => ({ ...f, prepTimeMinutes: '' }))}
                    resetLabel={t('orders.orderMenu.edit.reset')}
                  >
                    <Input
                      type="number" min="0"
                      value={editForm.prepTimeMinutes}
                      onChange={(e) => setEditForm((f) => ({ ...f, prepTimeMinutes: e.target.value }))}
                      placeholder={String(editRow.effective.prepTimeMinutes)}
                      className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono"
                    />
                  </OverrideField>
                </div>

                <OverrideField
                  label={t('orders.orderMenu.edit.imageUrl')}
                  hint={t('orders.orderMenu.edit.imageUrlHint')}
                  isSet={editForm.imageUrlOverride !== ''}
                  onReset={() => setEditForm((f) => ({ ...f, imageUrlOverride: '' }))}
                  resetLabel={t('orders.orderMenu.edit.reset')}
                >
                  <Input
                    value={editForm.imageUrlOverride}
                    onChange={(e) => setEditForm((f) => ({ ...f, imageUrlOverride: e.target.value }))}
                    placeholder={editRow.menuItem.imageUrl ?? 'https://…'}
                    className="h-10 text-xs font-medium border-slate-200 rounded-sm"
                  />
                </OverrideField>

                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('orders.orderMenu.edit.category')}</Label>
                  <Select value={editForm.orderCategoryId} onValueChange={(v) => { if (v) setEditForm((f) => ({ ...f, orderCategoryId: v })); }}>
                    <SelectTrigger className="h-10 text-sm font-bold rounded-sm border-slate-200 focus:ring-0 shadow-none">
                      {/* §7 — the value shown is always a human name, never the id. */}
                      <SelectValue>
                        {editForm.orderCategoryId === NO_ORDER_CATEGORY
                          ? t('orders.orderMenu.edit.fromMenuCategory')
                          : sortedCategories.find((c) => c.id === editForm.orderCategoryId)?.name ?? t('orders.orderMenu.edit.fromMenuCategory')}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ORDER_CATEGORY} className="text-xs">{t('orders.orderMenu.edit.fromMenuCategory')}</SelectItem>
                      {sortedCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sortedCategories.length === 0 && (
                    <span className="text-[9px] text-slate-400 font-bold ml-1">{t('orders.orderMenu.edit.noCategoriesHint')}</span>
                  )}
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditRow(null)} disabled={savingEdit} className="h-9 text-xs font-bold text-slate-400 uppercase">{t('common.cancel')}</Button>
                <Button type="submit" disabled={savingEdit} className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm disabled:opacity-60">{t('orders.orderMenu.edit.save')}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- MANAGE ORDER-ONLY CATEGORIES ---- */}
      <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
        <DialogContent maxWidth="sm:max-w-lg" className="p-0 rounded-md border-0 shadow-2xl">
          <div className="bg-slate-900 p-4 text-white">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold uppercase tracking-widest">{t('orders.orderMenu.categories.title')}</DialogTitle>
            </DialogHeader>
            <p className="text-[10px] text-slate-400 font-bold mt-1">{t('orders.orderMenu.categories.desc')}</p>
          </div>
          <div className="p-5 space-y-3 bg-white max-h-[60vh] overflow-y-auto">
            {sortedCategories.length === 0 ? (
              <div className="h-20 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-300">
                {t('orders.orderMenu.categories.empty')}
              </div>
            ) : (
              <SortableCategoryList
                categories={sortedCategories}
                onReorder={persistCategoryOrder}
                renamingId={renamingId}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                onStartRename={(c) => { setRenamingId(c.id); setRenameValue(c.name); }}
                onCancelRename={() => setRenamingId(null)}
                onCommitRename={handleRenameCategory}
                onDelete={handleDeleteCategory}
                t={t}
              />
            )}
            <form onSubmit={handleCreateCategory} className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={t('orders.orderMenu.categories.namePlaceholder')}
                className="h-10 text-sm font-bold border-slate-200 rounded-sm"
              />
              <Button type="submit" disabled={savingCategory || !newCategoryName.trim()} className="h-10 shrink-0 bg-blue-600 hover:bg-blue-700 text-[10px] font-black uppercase px-4 rounded-sm disabled:opacity-60">
                <Plus className="w-3.5 h-3.5 mr-1" /> {t('orders.orderMenu.categories.addBtn')}
              </Button>
            </form>
          </div>
          <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end">
            <Button variant="ghost" onClick={() => setCategoriesOpen(false)} className="h-9 text-xs font-bold text-slate-500 uppercase">{t('orders.orderMenu.close')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Override field wrapper — label + "reset to menu default" affordance.
// ---------------------------------------------------------------------------
function OverrideField({
  label, hint, isSet, onReset, resetLabel, children,
}: {
  label: string;
  hint?: string;
  isSet: boolean;
  onReset: () => void;
  resetLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between ml-1">
        <Label className="text-[10px] font-black uppercase text-slate-400">{label}</Label>
        {isSet && (
          <button type="button" onClick={onReset} className="flex items-center gap-1 text-[9px] font-black uppercase text-blue-600 hover:text-blue-700">
            <RotateCcw className="w-3 h-3" /> {resetLabel}
          </button>
        )}
      </div>
      {children}
      {hint && <span className="text-[9px] text-slate-400 font-bold ml-1 truncate">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drag-sortable catalog rows (one DndContext per section — reordering is only
// ever meaningful *within* a section; moving an item between sections is done
// through the edit dialog's category select).
// ---------------------------------------------------------------------------
interface DragProps {
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  attributes: Record<string, any>;
  listeners: Record<string, any> | undefined;
}

function SortableRows({
  rows, onReorder, children,
}: {
  rows: CatalogRow[];
  onReorder: (ordered: CatalogRow[]) => void;
  children: (row: CatalogRow, dragProps: DragProps) => React.ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.id === active.id);
    const to = rows.findIndex((r) => r.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(rows, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        {rows.map((row) => (
          <SortableRow key={row.id} id={row.id}>
            {(dragProps) => children(row, dragProps)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: (dragProps: DragProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative bg-white', isDragging && 'z-10 shadow-lg opacity-90')}
    >
      {children({ setActivatorNodeRef, attributes, listeners })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One catalog row.
// ---------------------------------------------------------------------------
function CatalogRowView({
  row, dragProps, formatPrice, localeTag, pauseOpen, setPauseOpen, onToggle, onPause, onEdit, onRemove, t,
}: {
  row: CatalogRow;
  dragProps: DragProps;
  formatPrice: (n: number) => string;
  localeTag: string;
  pauseOpen: boolean;
  setPauseOpen: (open: boolean) => void;
  onToggle: (row: CatalogRow, field: 'isListed' | 'isAvailable', value: boolean) => void;
  onPause: (row: CatalogRow, preset: PausePreset | 'RESUME') => void;
  onEdit: (row: CatalogRow) => void;
  onRemove: (row: CatalogRow) => void;
  t: (key: string) => string;
}) {
  // `row.paused` already encodes "the pause is still in effect" (the server
  // computes it, and the optimistic local patch keeps it honest), so the badge
  // never has to re-check the clock during render.
  const resumesAt = row.pausedUntil ? new Date(row.pausedUntil) : null;
  const showsResumeTime = !row.pausedIndefinitely && resumesAt != null;
  const pauseLabel = showsResumeTime
    ? `${t('orders.orderMenu.pause.badge')} · ${t('orders.orderMenu.pause.resumesAt')} ${resumesAt!.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })}`
    : t('orders.orderMenu.pause.badge');

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors', !row.isListed && 'opacity-60')}>
      <button
        type="button"
        ref={dragProps.setActivatorNodeRef}
        {...dragProps.attributes}
        {...dragProps.listeners}
        aria-label={t('orders.orderMenu.row.dragHandle')}
        className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {row.effective.imageUrl ? (
        <img src={row.effective.imageUrl} alt={row.effective.name} className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
          <ImageIcon className="w-4 h-4 text-slate-300" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-black text-slate-800 truncate">{row.effective.name}</span>
          {row.nameOverride && (
            <Badge variant="outline" className="text-[8px] font-black uppercase border-blue-200 bg-blue-50 text-blue-600">
              {t('orders.orderMenu.row.overridden')}
            </Badge>
          )}
          {row.paused && (
            <Badge className="text-[8px] font-black uppercase border-0 bg-amber-100 text-amber-700">{pauseLabel}</Badge>
          )}
          {!row.menuItem.isAvailable && (
            <Badge variant="outline" className="text-[8px] font-black uppercase border-slate-200 bg-slate-50 text-slate-500">
              {t('orders.orderMenu.row.menuUnavailable')}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] font-black text-blue-700">{formatPrice(row.effective.price)}</span>
          {row.priceOverride != null && (
            <span className="text-[10px] font-bold text-slate-400 line-through">{formatPrice(row.menuItem.price)}</span>
          )}
          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest truncate">
            {row.menuItem.category?.name ?? ''}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{t('orders.orderMenu.row.listed')}</span>
          <Switch checked={row.isListed} onCheckedChange={(c) => onToggle(row, 'isListed', c)} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">{t('orders.orderMenu.row.available')}</span>
          <Switch checked={row.isAvailable} onCheckedChange={(c) => onToggle(row, 'isAvailable', c)} />
        </div>

        <Popover open={pauseOpen} onOpenChange={setPauseOpen}>
          <PopoverTrigger
            className={cn(
              'h-8 px-2.5 inline-flex items-center gap-1.5 rounded-sm border text-[9px] font-black uppercase transition-colors cursor-pointer',
              row.paused
                ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            )}
          >
            {row.paused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
            {row.paused ? t('orders.orderMenu.pause.resume') : t('orders.orderMenu.pause.trigger')}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-0 bg-white border border-slate-200 shadow-xl rounded-md overflow-hidden">
            <div className="bg-slate-900 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white">
              {t('orders.orderMenu.pause.title')}
            </div>
            <div className="p-1.5 flex flex-col">
              {row.paused && (
                <button type="button" onClick={() => onPause(row, 'RESUME')} className="text-left px-2.5 py-2 rounded-sm text-[11px] font-black uppercase text-emerald-600 hover:bg-emerald-50">
                  {t('orders.orderMenu.pause.resume')}
                </button>
              )}
              {([
                ['ONE_HOUR', 'orders.orderMenu.pause.oneHour'],
                ['TWO_HOURS', 'orders.orderMenu.pause.twoHours'],
                ['TOMORROW', 'orders.orderMenu.pause.untilTomorrow'],
                ['INDEFINITE', 'orders.orderMenu.pause.indefinite'],
              ] as [PausePreset, string][]).map(([preset, key]) => (
                <button key={preset} type="button" onClick={() => onPause(row, preset)} className="text-left px-2.5 py-2 rounded-sm text-[11px] font-bold text-slate-600 hover:bg-slate-50">
                  {t(key)}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => onEdit(row)} aria-label={t('orders.orderMenu.row.edit')} className="h-7 w-7 text-slate-300 hover:text-blue-600">
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onRemove(row)} aria-label={t('orders.orderMenu.row.remove')} className="h-7 w-7 text-slate-300 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order-only category list (drag to reorder, inline rename, delete).
// ---------------------------------------------------------------------------
function SortableCategoryList({
  categories, onReorder, renamingId, renameValue, setRenameValue,
  onStartRename, onCancelRename, onCommitRename, onDelete, t,
}: {
  categories: OrderCategory[];
  onReorder: (ordered: OrderCategory[]) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onStartRename: (c: OrderCategory) => void;
  onCancelRename: () => void;
  onCommitRename: (c: OrderCategory) => void;
  onDelete: (c: OrderCategory) => void;
  t: (key: string) => string;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = categories.findIndex((c) => c.id === active.id);
    const to = categories.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(categories, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {categories.map((category) => (
            <SortableRow key={category.id} id={category.id}>
              {(dragProps) => (
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/50 p-2">
                  <button
                    type="button"
                    ref={dragProps.setActivatorNodeRef}
                    {...dragProps.attributes}
                    {...dragProps.listeners}
                    aria-label={t('orders.orderMenu.row.dragHandle')}
                    className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none"
                  >
                    <GripVertical className="w-4 h-4" />
                  </button>
                  {renamingId === category.id ? (
                    <>
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); onCommitRename(category); }
                          if (e.key === 'Escape') onCancelRename();
                        }}
                        className="h-8 text-xs font-bold border-slate-200 rounded-sm"
                      />
                      <Button size="sm" onClick={() => onCommitRename(category)} className="h-8 shrink-0 bg-blue-600 hover:bg-blue-700 text-[9px] font-black uppercase px-3 rounded-sm">
                        {t('common.save')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={onCancelRename} className="h-8 shrink-0 text-[9px] font-black uppercase text-slate-400">
                        {t('common.cancel')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 truncate text-xs font-black text-slate-700">{category.name}</span>
                      <Button variant="ghost" size="icon" onClick={() => onStartRename(category)} aria-label={t('orders.orderMenu.categories.rename')} className="h-7 w-7 shrink-0 text-slate-300 hover:text-blue-600">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(category)} aria-label={t('common.delete')} className="h-7 w-7 shrink-0 text-slate-300 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
