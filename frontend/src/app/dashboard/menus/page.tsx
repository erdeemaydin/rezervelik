'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit2, Search, LayoutGrid, List, ChevronDown, ChevronRight, Image as ImageIcon, Flame, Leaf, AlertTriangle, Layers, QrCode, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { QRCodePDFGenerator } from '@/components/menus/QRCodePDFGenerator';
import { PrintableMenuPDFGenerator } from '@/components/menus/PrintableMenuPDFGenerator';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PasswordConfirmDialog } from '@/components/auth/PasswordConfirmDialog';
import { useTranslation } from "@/i18n/provider";
import { useAuthStore } from '@/store/useAuthStore';

// Types matching the new schema
interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  order: number;
  dietaryTags: string | null;
  allergens: string | null;
  spiceLevel: number;
  ingredients?: string | null;
  calories?: number | null;
  durationMinutes?: number | null;
  containsAlcohol?: boolean;
  containsPork?: boolean;
  categoryId: string;
  // Online-ordering add-on fields (see docs/packaging/online-ordering-plan.md
  // §1a) — surfaced here rather than duplicated in a separate list, per the
  // dashboard/orders/settings task brief.
  isOrderableOnline?: boolean;
  prepTimeMinutes?: number | null;
}

interface MenuCategory {
  id: string;
  menuId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  order: number;
  parentId: string | null;
  items: MenuItem[];
  children?: MenuCategory[]; // Nested sub-categories
}

interface Menu {
  id: string;
  name: string;
  isActive: boolean;
  footnotes: string | null;
  categories: MenuCategory[];
}

export default function MenuManagementPage() {
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Online-ordering "orderable" toggle (see docs/packaging/online-ordering-plan.md)
  // is only shown when the tenant has the add-on AND the current user actually
  // holds manage_orders — PATCH /orders/menu/:id/orderable lives behind that
  // permission (src/routes/orderRoutes.ts), which manage_menu alone does not
  // grant by default (the MANAGER preset role doesn't include manage_orders).
  // Showing the control to someone who can't use it would just 403 silently.
  const currentUser = useAuthStore((s) => s.user);
  const [hasOnlineOrdering, setHasOnlineOrdering] = useState(false);
  useEffect(() => {
    api.get('/settings').then((res) => setHasOnlineOrdering(res.data?.data?.hasOnlineOrdering === true)).catch(() => {});
  }, []);
  const canManageOrders = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN'
    || (currentUser?.permissions?.includes('manage_orders') ?? false);
  const showOnlineOrderingColumn = hasOnlineOrdering && canManageOrders;

  const [savingOrderableId, setSavingOrderableId] = useState<string | null>(null);
  const handleToggleOrderable = async (item: MenuItem, isOrderableOnline: boolean) => {
    setSavingOrderableId(item.id);
    // Optimistic local update so the switch responds immediately; reconciled
    // by fetchMenus() below regardless of outcome.
    setMenus((prev) => prev.map((m) => ({
      ...m,
      categories: m.categories.map((c) => ({
        ...c,
        items: c.items.map((i) => (i.id === item.id ? { ...i, isOrderableOnline } : i)),
        children: c.children?.map((sc) => ({
          ...sc,
          items: sc.items.map((i) => (i.id === item.id ? { ...i, isOrderableOnline } : i)),
        })),
      })),
    })));
    try {
      await api.patch(`/orders/menu/${item.id}/orderable`, { isOrderableOnline });
      toast.success(t('menus.onlineOrdering.updated'));
    } catch (err) {
      toast.error(t('menus.onlineOrdering.updateFailed'));
      fetchMenus();
    } finally {
      setSavingOrderableId(null);
    }
  };
  const handlePrepTimeBlur = async (item: MenuItem, raw: string) => {
    const prepTimeMinutes = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
    if (prepTimeMinutes === (item.prepTimeMinutes ?? null)) return;
    try {
      await api.patch(`/orders/menu/${item.id}/orderable`, { prepTimeMinutes });
      toast.success(t('menus.onlineOrdering.updated'));
      fetchMenus();
    } catch (err) {
      toast.error(t('menus.onlineOrdering.updateFailed'));
    }
  };

  // Dialog States
  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isSavingMenu, setIsSavingMenu] = useState(false);
  const [deleteMenuId, setDeleteMenuId] = useState<string | null>(null);
  const [restaurantProfile, setRestaurantProfile] = useState<any>(null);
  const [isQRDialogOpen, setIsQRDialogOpen] = useState(false);
  
  const [editId, setEditId] = useState<string | null>(null);
  
  // Forms
  const [menuForm, setMenuForm] = useState({ name: '', isActive: true, footnotes: '' });
  const [categoryForm, setCategoryForm] = useState({ menuId: '', name: '', description: '', imageUrl: '', parentId: 'none' });
  const [itemForm, setItemForm] = useState({
      categoryId: '', name: '', description: '', price: '',
      imageUrl: '', dietaryTags: '', allergens: '', spiceLevel: '0',
      ingredients: '', calories: '', durationMinutes: '', containsAlcohol: false, containsPork: false
  });
  
  const fetchMenus = useCallback(async () => {
    try {
      setLoading(true);
      const [res, profileRes] = await Promise.all([
          api.get('/menus'),
          api.get('/restaurants/me').catch(() => null)
      ]);
      if (profileRes && profileRes.data) {
          setRestaurantProfile(profileRes.data.data);
      }
      const data = res.data.data;
      setMenus(data);
      
      if (data.length > 0) {
          // If no active ID is set, or the current active ID no longer exists
          setActiveMenuId(prev => {
              if (!prev || !data.some((m: Menu) => m.id === prev)) {
                  const active = data.find((m: Menu) => m.isActive);
                  return active ? active.id : data[0].id;
              }
              return prev;
          });
      } else {
          setActiveMenuId(null);
      }
    } catch (error) {
      console.error('Error fetching menus:', error);
      toast.error(t('menus.toast.loadMenusFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  const activeMenu = menus.find(m => m.id === activeMenuId);

  // Format a dish price using the tenant's configured currency (RestaurantSettings.currency),
  // not a hardcoded TRY — restaurants can run in other currencies (see settings page).
  const formatPrice = useMemo(() => {
    const currency = restaurantProfile?.settings?.currency || 'TRY';
    const localeTag = locale === 'tr' ? 'tr-TR' : 'en-US';
    return (price: number) => {
      try {
        return price.toLocaleString(localeTag, { style: 'currency', currency });
      } catch {
        return `${price.toLocaleString(localeTag)} ${currency}`;
      }
    };
  }, [restaurantProfile, locale]);

  const toggleCategory = (id: string) => {
      const newSet = new Set(expandedCategories);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setExpandedCategories(newSet);
  };

  // --- MENU ACTIONS ---
  const handleMenuSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSavingMenu) return; // guards against double-click/double-submit races
      setIsSavingMenu(true);
      try {
          if (isEditMode && editId) {
              await api.put(`/menus/${editId}`, menuForm);
              toast.success(t('menus.toast.menuUpdated'));
          } else {
              const res = await api.post('/menus', menuForm);
              setActiveMenuId(res.data.data.id);
              toast.success(t('menus.toast.menuCreated'));
          }
          setIsMenuDialogOpen(false);
          fetchMenus();
      } catch (err: any) {
          toast.error(err?.response?.data?.error || t('menus.toast.menuSaveFailed'));
      } finally {
          setIsSavingMenu(false);
      }
  };

  const handleDeleteMenu = (id: string) => {
      setDeleteMenuId(id);
  };

  const executeDeleteMenu = async () => {
      if (!deleteMenuId) return;
      try {
          await api.delete(`/menus/${deleteMenuId}`);
          toast.success(t('menus.toast.menuDeleted'));
          if (activeMenuId === deleteMenuId) setActiveMenuId(null);
          setDeleteMenuId(null);
          fetchMenus();
      } catch (err) { toast.error(t('menus.toast.menuDeleteFailed')); }
  };

  // --- CATEGORY ACTIONS ---
  const handleOpenCategory = (menuId: string, parentId: string | null = null, editCat: MenuCategory | null = null) => {
      if (editCat) {
          setIsEditMode(true);
          setEditId(editCat.id);
          setCategoryForm({
              menuId: editCat.menuId, name: editCat.name, 
              description: editCat.description || '', imageUrl: editCat.imageUrl || '', 
              parentId: editCat.parentId || 'none'
          });
      } else {
          setIsEditMode(false);
          setEditId(null);
          setCategoryForm({ menuId, name: '', description: '', imageUrl: '', parentId: parentId || 'none' });
      }
      setIsCategoryDialogOpen(true);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          const payload = { ...categoryForm, parentId: categoryForm.parentId === 'none' ? null : categoryForm.parentId };
          if (isEditMode && editId) {
              await api.put(`/menus/categories/${editId}`, payload);
              toast.success(t('menus.toast.categoryUpdated'));
          } else {
              await api.post('/menus/categories', payload);
              toast.success(t('menus.toast.categoryCreated'));
          }
          setIsCategoryDialogOpen(false);
          fetchMenus();
      } catch (err) { toast.error(t('menus.toast.categorySaveFailed')); }
  };

  const handleDeleteCategory = async (id: string) => {
      const ok = await confirm({ title: t('menus.confirm.deleteCategory'), tone: 'danger', confirmText: t('common.delete'), cancelText: t('common.cancel') });
      if (!ok) return;
      try {
          await api.delete(`/menus/categories/${id}`);
          toast.success(t('menus.toast.categoryDeleted'));
          fetchMenus();
      } catch (err) { toast.error(t('menus.toast.categoryDeleteFailed')); }
  };

  // --- ITEM ACTIONS ---
  const handleOpenItem = (categoryId: string, editItem: MenuItem | null = null) => {
      if (editItem) {
          setIsEditMode(true);
          setEditId(editItem.id);
          setItemForm({ 
              categoryId: editItem.categoryId, name: editItem.name, 
              description: editItem.description || '', price: editItem.price.toString(), 
              imageUrl: editItem.imageUrl || '', dietaryTags: editItem.dietaryTags || '', 
              allergens: editItem.allergens || '', spiceLevel: editItem.spiceLevel?.toString() || '0',
              ingredients: editItem.ingredients || '', calories: editItem.calories?.toString() || '',
              durationMinutes: editItem.durationMinutes?.toString() || '',
              containsAlcohol: editItem.containsAlcohol || false, containsPork: editItem.containsPork || false
          });
      } else {
          setIsEditMode(false);
          setEditId(null);
          setItemForm({
              categoryId, name: '', description: '', price: '',
              imageUrl: '', dietaryTags: '', allergens: '', spiceLevel: '0',
              ingredients: '', calories: '', durationMinutes: '', containsAlcohol: false, containsPork: false
          });
      }
      setIsItemDialogOpen(true);
  };

  const handleItemSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          const payload = { ...itemForm, price: parseFloat(itemForm.price) };
          if (isEditMode && editId) {
              await api.put(`/menus/items/${editId}`, payload);
              toast.success(t('menus.toast.itemUpdated'));
          } else {
              // Matches the actual registered route: POST /menus/items with
              // categoryId in the body (src/routes/menuRoutes.ts) — not a
              // nested /categories/:categoryId/items path, which 404s.
              await api.post('/menus/items', payload);
              toast.success(t('menus.toast.itemAdded'));
          }
          setIsItemDialogOpen(false);
          fetchMenus();
      } catch (err) { toast.error(t('menus.toast.itemSaveFailed')); }
  };

  const handleDeleteItem = async (id: string) => {
      const ok = await confirm({ title: t('menus.confirm.deleteItem'), tone: 'danger', confirmText: t('common.delete'), cancelText: t('common.cancel') });
      if (!ok) return;
      try {
          await api.delete(`/menus/items/${id}`);
          toast.success(t('menus.toast.itemDeleted'));
          fetchMenus();
      } catch (err) { toast.error(t('menus.toast.itemDeleteFailed')); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, setForm: Function) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('image', file);
      
      try {
          toast.loading(t('menus.toast.uploadingImage'), { id: 'upload' });
          const res = await api.post('/uploads/image', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });
          setForm((prev: any) => ({ ...prev, imageUrl: res.data.data.url }));
          toast.success(t('menus.toast.imageUploaded'), { id: 'upload' });
      } catch (error) {
          console.error(error);
          toast.error(t('menus.toast.imageUploadFailed'), { id: 'upload' });
      }
  };

  // --- RENDER HELPERS ---
  const renderItemsTable = (items: MenuItem[], categoryId: string) => (
      <div className="bg-white border-t border-slate-100">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="h-8">
              <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">{t('menus.table.dishInfo')}</TableHead>
              <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{t('menus.table.tagsSpecs')}</TableHead>
              <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">{t('menus.table.price')}</TableHead>
              {showOnlineOrderingColumn && (
                <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{t('menus.table.onlineOrdering')}</TableHead>
              )}
              <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-4">{t('menus.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
                <TableRow><TableCell colSpan={showOnlineOrderingColumn ? 5 : 4} className="h-16 text-center text-xs text-slate-400 font-bold italic">{t('menus.table.noItems')}</TableCell></TableRow>
            ) : items.map(item => (
              <TableRow key={item.id} className="h-12 hover:bg-slate-50/50 border-b border-slate-50 transition-colors">
                <TableCell className="px-4 py-2">
                  <div className="flex items-start gap-3">
                    {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-md object-cover border border-slate-200 shadow-sm" />
                    ) : (
                        <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center border border-slate-200"><ImageIcon className="w-4 h-4 text-slate-300" /></div>
                    )}
                    <div className="flex flex-col max-w-[300px]">
                      <span className="font-bold text-slate-800 text-xs tracking-tight">{item.name}</span>
                      <span className="text-[10px] text-slate-500 line-clamp-1 leading-tight mt-0.5">{item.description}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-2 text-center">
                    <div className="flex flex-wrap items-center justify-center gap-1">
                        {item.spiceLevel > 0 && (
                            <Badge variant="outline" className="text-[8px] px-1 h-4 bg-red-50 text-red-600 border-red-200 shadow-none"><Flame className="w-2.5 h-2.5 mr-0.5" /> Lvl {item.spiceLevel}</Badge>
                        )}
                        {item.dietaryTags && item.dietaryTags.split(',').map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-[8px] px-1 h-4 bg-green-50 text-green-700 border-green-200 shadow-none"><Leaf className="w-2.5 h-2.5 mr-0.5" /> {tag.trim()}</Badge>
                        ))}
                        {item.allergens && (
                            <Badge variant="outline" className="text-[8px] px-1 h-4 bg-orange-50 text-orange-700 border-orange-200 shadow-none"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> {item.allergens}</Badge>
                        )}
                    </div>
                </TableCell>
                <TableCell className="text-right py-2">
                    <span className="font-black text-blue-700 text-sm">{formatPrice(item.price)}</span>
                </TableCell>
                {showOnlineOrderingColumn && (
                  <TableCell className="py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-center gap-1.5">
                      <Switch
                        checked={!!item.isOrderableOnline}
                        disabled={savingOrderableId === item.id}
                        onCheckedChange={(c) => handleToggleOrderable(item, c)}
                      />
                      {item.isOrderableOnline && (
                        <Input
                          type="number"
                          min="0"
                          defaultValue={item.prepTimeMinutes ?? ''}
                          placeholder={t('menus.onlineOrdering.prepTimePlaceholder')}
                          onBlur={(e) => handlePrepTimeBlur(item, e.target.value)}
                          className="h-6 w-20 text-[10px] font-bold text-center border-slate-200 rounded-sm px-1"
                        />
                      )}
                    </div>
                  </TableCell>
                )}
                <TableCell className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600 transition-colors" onClick={(e) => { e.stopPropagation(); handleOpenItem(categoryId, item); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 transition-colors" onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="p-2 bg-slate-50/50 border-t border-slate-100 flex justify-center">
            <Button variant="ghost" size="sm" className="h-7 text-[10px] font-black uppercase text-blue-600 hover:bg-blue-50 w-full" onClick={() => handleOpenItem(categoryId)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {t('menus.buttons.addDish')}
            </Button>
        </div>
      </div>
  );

  const renderCategory = (cat: MenuCategory, isSub: boolean = false) => {
      const isExpanded = expandedCategories.has(cat.id);
      return (
          <div key={cat.id} className={cn("border border-slate-200 rounded-md overflow-hidden bg-white mb-3 shadow-sm", isSub && "ml-6 border-l-4 border-l-blue-200 border-y-slate-100 border-r-slate-100 shadow-none mb-2")}>
              <div 
                className={cn("flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 transition-colors", isExpanded && "bg-slate-50 border-b border-slate-200")}
                onClick={() => toggleCategory(cat.id)}
              >
                  <div className="flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 p-0">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </Button>
                      {cat.imageUrl ? (
                          <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded object-cover border border-slate-200" />
                      ) : (
                          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center border border-slate-200"><Layers className="w-3.5 h-3.5 text-slate-300" /></div>
                      )}
                      <div>
                          <div className="font-black text-slate-800 text-sm uppercase tracking-tight flex items-center gap-2">
                              {cat.name}
                              <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200 border-0 text-[9px] px-1.5 shadow-none">{cat.items?.length || 0} {t('menus.badges.items')}</Badge>
                          </div>
                          {cat.description && <div className="text-[10px] text-slate-500 mt-0.5">{cat.description}</div>}
                      </div>
                  </div>
                  <div className="flex items-center gap-1">
                      {!isSub && (
                          <Button variant="outline" size="sm" className="h-7 px-3 text-[10px] font-black uppercase text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100" onClick={(e) => { e.stopPropagation(); handleOpenCategory(activeMenuId!, cat.id); }}>
                              <Plus className="w-3 h-3 mr-1" /> {t('menus.buttons.subCategory')}
                          </Button>
                      )}
                      <div className="w-px h-4 bg-slate-200 mx-2" />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-blue-600 transition-colors" onClick={(e) => { e.stopPropagation(); handleOpenCategory(activeMenuId!, cat.parentId, cat); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 transition-colors" onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
              </div>
              
              {isExpanded && (
                  <div className="bg-slate-50/30">
                      {/* Render Subcategories if any */}
                      {cat.children && cat.children.length > 0 && (
                          <div className="p-3 bg-slate-50/50 border-b border-slate-100">
                              {cat.children.map(child => renderCategory(child, true))}
                          </div>
                      )}
                      {/* Render Items */}
                      {renderItemsTable(cat.items, cat.id)}
                  </div>
              )}
          </div>
      );
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Header - High Density Corporate */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('menus.title.menuArchitecture')}</h1>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 italic">{t('menus.title.digitalCatalogue')}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/menus/bulk-prices">
              <Button size="sm" variant="outline" className="h-9 px-4 text-[10px] font-black uppercase border-blue-200 text-blue-700 shadow-sm bg-blue-50 hover:bg-blue-100">
                <ListChecks className="w-3.5 h-3.5 mr-1.5" /> {t('menus.buttons.bulkPriceUpdate')}
              </Button>
            </Link>
            <Button size="sm" variant="outline" onClick={() => { setIsEditMode(false); setMenuForm({name:'', isActive:true, footnotes: ''}); setIsMenuDialogOpen(true); }} className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> {t('menus.buttons.quickCreate')}
            </Button>
            <Button size="sm" onClick={() => window.location.href = '/dashboard/menus/wizard'} className="h-9 px-4 text-[10px] font-black uppercase border-0 text-white shadow-sm bg-blue-600 hover:bg-blue-700">
                {t('menus.buttons.menuWizard')}
            </Button>
            {restaurantProfile && menus.length > 0 && (
                <PrintableMenuPDFGenerator menu={menus.find(m => m.id === (activeMenuId || menus[0].id)) || menus[0]} restaurantProfile={restaurantProfile} />
            )}
            <Button size="sm" variant="outline" onClick={() => setIsQRDialogOpen(true)} className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white hover:bg-slate-50">
                <QrCode className="w-3.5 h-3.5 mr-1.5" /> {t('menus.buttons.downloadQR') || "QR Etiket"}
            </Button>
          </div>
        </div>

        <Dialog open={isQRDialogOpen} onOpenChange={setIsQRDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{t('menus.downloadQR.title') || "Download QR Label"}</DialogTitle>
                    <DialogDescription>
                        {t('menus.downloadQR.desc') || "Download a printable QR code label for your tables to comply with regulations."}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 flex justify-center">
                    {restaurantProfile ? (
                        <QRCodePDFGenerator 
                            restaurantSlug={restaurantProfile.slug} 
                            restaurantName={restaurantProfile.name} 
                        />
                    ) : (
                        <div className="text-sm text-slate-500">Loading...</div>
                    )}
                </div>
            </DialogContent>
        </Dialog>

        {/* Command Center & Active Menu Selection */}
        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                    <Select value={activeMenuId || ''} onValueChange={setActiveMenuId}>
                        <SelectTrigger className="h-10 w-[250px] text-sm font-black border-slate-200 shadow-sm bg-white uppercase">
                            <SelectValue placeholder={t('menus.form.selectActiveMenu')}>
                                {menus.find(m => m.id === activeMenuId)?.name || t('menus.form.selectActiveMenu')}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {menus.map(m => (
                                <SelectItem key={m.id} value={m.id} className="font-bold text-xs uppercase">{m.name} {m.isActive ? `(${t('menus.badges.live')})` : ''}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {activeMenu && (
                        <div className="flex items-center gap-2">
                            <Badge className={cn("text-[9px] font-black uppercase px-2 shadow-none rounded-sm", activeMenu.isActive ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600")}>
                                {activeMenu.isActive ? t('menus.badges.live') : t('menus.badges.draft')}
                            </Badge>
                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold text-blue-600 hover:bg-blue-50" onClick={() => {
                                setIsEditMode(true); setEditId(activeMenu.id); setMenuForm({name: activeMenu.name, isActive: activeMenu.isActive, footnotes: activeMenu.footnotes || ''}); setIsMenuDialogOpen(true);
                            }}>
                                <Edit2 className="w-3 h-3 mr-1" /> {t('menus.buttons.editMeta')}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold text-red-600 hover:bg-red-50" onClick={() => handleDeleteMenu(activeMenu.id)}>
                                <Trash2 className="w-3 h-3 mr-1" /> {t('menus.buttons.deleteMenu')}
                            </Button>
                        </div>
                    )}
                </div>
                {activeMenu && (
                    <Button size="sm" onClick={() => handleOpenCategory(activeMenu.id)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-sm h-9 px-6 font-black text-[10px] uppercase shadow-md shadow-blue-600/20">
                        <Plus className="w-3.5 h-3.5 mr-1.5 stroke-[3]" /> {t('menus.buttons.addRootCategory')}
                    </Button>
                )}
            </CardHeader>
            <CardContent className="p-6 bg-slate-50/30 min-h-[500px]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-600 mb-4"></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('menus.title.loadingCatalog')}</p>
                    </div>
                ) : !activeMenu ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded-lg bg-white">
                        <List className="w-12 h-12 text-slate-300 mb-4" />
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">{t('menus.title.noMenuSelected')}</h3>
                        <p className="text-xs text-slate-400 font-medium mt-1">{t('menus.title.noMenuDesc')}</p>
                    </div>
                ) : activeMenu.categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded-lg bg-white">
                        <Layers className="w-12 h-12 text-slate-300 mb-4" />
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">{t('menus.title.emptyMenuStructure')}</h3>
                        <p className="text-xs text-slate-400 font-medium mt-1 mb-4">{t('menus.title.emptyMenuDesc')}</p>
                        <Button size="sm" onClick={() => handleOpenCategory(activeMenu.id)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-sm h-9 px-6 font-black text-[10px] uppercase">{t('menus.buttons.addRootCategory')}</Button>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {activeMenu.categories.map(cat => renderCategory(cat))}
                    </div>
                )}
            </CardContent>
        </Card>

        {/* DIALOGS */}

        {/* Menu Dialog */}
        <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
            <DialogContent maxWidth="sm:max-w-md" className="p-0 rounded-md border-0 shadow-2xl">
                <form onSubmit={handleMenuSubmit}>
                    <div className="bg-slate-900 p-4 text-white">
                        <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">{isEditMode ? t('menus.title.editMenu') : t('menus.title.createMenu')}</DialogTitle></DialogHeader>
                    </div>
                    <div className="p-6 space-y-4 bg-white">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.menuTitle')}</Label>
                            <Input required value={menuForm.name} onChange={e => setMenuForm({...menuForm, name: e.target.value})} placeholder={t('menus.form.menuTitlePlaceholder')} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.footnotes')}</Label>
                            <Textarea value={menuForm.footnotes} onChange={e => setMenuForm({...menuForm, footnotes: e.target.value})} placeholder={t('menus.form.footnotesPlaceholder')} className="min-h-[60px] text-xs font-medium border-slate-200 rounded-sm" />
                        </div>
                        <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-sm">
                            <Checkbox checked={menuForm.isActive} onCheckedChange={(c) => setMenuForm({...menuForm, isActive: !!c})} />
                            <Label className="text-xs font-bold text-slate-700">{t('menus.form.active')}</Label>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsMenuDialogOpen(false)} disabled={isSavingMenu} className="h-9 text-xs font-bold text-slate-400 uppercase">{t('menus.buttons.cancel')}</Button>
                        <Button type="submit" disabled={isSavingMenu} className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm disabled:opacity-60">{isSavingMenu ? t('menus.buttons.saving') || '...' : t('menus.buttons.saveMenu')}</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>

        {/* Category Dialog */}
        <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
            <DialogContent maxWidth="sm:max-w-md" className="p-0 rounded-md border-0 shadow-2xl">
                <form onSubmit={handleCategorySubmit}>
                    <div className="bg-slate-900 p-4 text-white">
                        <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">{isEditMode ? t('menus.title.editCategory') : t('menus.title.createCategory')}</DialogTitle></DialogHeader>
                    </div>
                    <div className="p-6 space-y-4 bg-white">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.categoryName')}</Label>
                            <Input required value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})} placeholder={t('menus.form.categoryNamePlaceholder')} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.description')}</Label>
                            <Textarea value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description: e.target.value})} className="min-h-[60px] text-xs font-medium border-slate-200 rounded-sm" placeholder={t('menus.form.descriptionPlaceholder')} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.coverImage')}</Label>
                            <Input value={categoryForm.imageUrl} onChange={e => setCategoryForm({...categoryForm, imageUrl: e.target.value})} placeholder="https://..." className="h-10 text-xs font-medium border-slate-200 rounded-sm" />
                        </div>
                        <div className="grid gap-1.5 hidden">
                            {/* Hidden Parent ID mapping, passed via state logic */}
                            <Input type="hidden" value={categoryForm.parentId} />
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsCategoryDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400 uppercase">{t('menus.buttons.cancel')}</Button>
                        <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm">{t('menus.buttons.saveCategory')}</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>

        {/* Item Dialog */}
        <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
            <DialogContent maxWidth="sm:max-w-2xl" className="p-0 rounded-md border-0 shadow-2xl">
                <form onSubmit={handleItemSubmit}>
                    <div className="bg-slate-900 p-4 text-white">
                        <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">{isEditMode ? t('menus.title.editDish') : t('menus.title.addNewDish')}</DialogTitle></DialogHeader>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white">
                        <div className="space-y-4">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.dishName')}</Label>
                                <Input required value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} placeholder={t('menus.form.dishNamePlaceholder')} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.ingredients')}</Label>
                                <Textarea value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} className="min-h-[80px] text-xs font-medium border-slate-200 rounded-sm" placeholder="..." />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.exactIngredients')}</Label>
                                <Textarea value={itemForm.ingredients} onChange={e => setItemForm({...itemForm, ingredients: e.target.value})} className="min-h-[60px] text-xs font-medium border-slate-200 rounded-sm" placeholder="..." />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.priceTry')}</Label>
                                <Input type="number" step="0.01" required value={itemForm.price} onChange={e => setItemForm({...itemForm, price: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono" />
                            </div>
                            {/* Service/treatment duration — drives the booking window for
                                appointment verticals (salon/clinic). Optional; blank for menu dishes. */}
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.serviceDuration')}</Label>
                                <Input type="number" min="0" step="5" value={itemForm.durationMinutes} onChange={e => setItemForm({...itemForm, durationMinutes: e.target.value})} placeholder="—" className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('menus.form.imageUpload')}</Label>
                                <div className="flex items-center gap-3">
                                    {itemForm.imageUrl && (
                                        <img src={itemForm.imageUrl} alt="Preview" className="w-12 h-12 rounded object-cover border border-slate-200" />
                                    )}
                                    <div className="flex-1">
                                        <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setItemForm)} className="text-xs file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 file:border-0 file:rounded-sm file:mr-2 cursor-pointer h-10 py-1.5" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 border-l border-slate-100 pl-6">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-green-600 tracking-[0.2em] flex items-center gap-1"><Leaf className="w-3 h-3" /> {t('menus.form.dietaryTags')}</Label>
                                <Input value={itemForm.dietaryTags} onChange={e => setItemForm({...itemForm, dietaryTags: e.target.value})} placeholder={t('menus.form.dietaryTagsPlaceholder')} className="h-10 text-xs font-bold border-green-200 bg-green-50/30 rounded-sm focus:border-green-400" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-orange-600 tracking-[0.2em] flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t('menus.form.allergens')}</Label>
                                <Input value={itemForm.allergens} onChange={e => setItemForm({...itemForm, allergens: e.target.value})} placeholder={t('menus.form.allergensPlaceholder')} className="h-10 text-xs font-bold border-orange-200 bg-orange-50/30 rounded-sm focus:border-orange-400" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-red-600 tracking-[0.2em] flex items-center gap-1"><Flame className="w-3 h-3" /> {t('menus.form.spiceLevel')}</Label>
                                <Select value={itemForm.spiceLevel} onValueChange={v => setItemForm({...itemForm, spiceLevel: v || '0'})}>
                                    <SelectTrigger className="h-10 text-xs font-bold border-red-200 bg-red-50/30 rounded-sm">
                                        <SelectValue>
                                            {itemForm.spiceLevel === '0' ? t('menus.form.spiceLevel0') : 
                                             itemForm.spiceLevel === '1' ? t('menus.form.spiceLevel1') : 
                                             itemForm.spiceLevel === '2' ? t('menus.form.spiceLevel2') : 
                                             itemForm.spiceLevel === '3' ? t('menus.form.spiceLevel3') : 
                                             itemForm.spiceLevel === '4' ? t('menus.form.spiceLevel4') : t('menus.form.selectSpiceLevel')}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0" className="text-xs">{t('menus.form.spiceLevel0')}</SelectItem>
                                        <SelectItem value="1" className="text-xs">{t('menus.form.spiceLevel1')}</SelectItem>
                                        <SelectItem value="2" className="text-xs">{t('menus.form.spiceLevel2')}</SelectItem>
                                        <SelectItem value="3" className="text-xs">{t('menus.form.spiceLevel3')}</SelectItem>
                                        <SelectItem value="4" className="text-xs">{t('menus.form.spiceLevel4')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-blue-600 tracking-[0.2em] flex items-center gap-1">{t('menus.form.calories')}</Label>
                                <Input type="number" value={itemForm.calories} onChange={e => setItemForm({...itemForm, calories: e.target.value})} placeholder="0" className="h-10 text-xs font-bold border-blue-200 bg-blue-50/30 rounded-sm focus:border-blue-400" />
                            </div>
                            <div className="flex flex-col gap-3 mt-4">
                                <div className="flex items-center space-x-2 bg-rose-50/50 p-2 rounded border border-rose-100">
                                    <Checkbox id="containsAlcohol" checked={itemForm.containsAlcohol} onCheckedChange={(checked) => setItemForm({...itemForm, containsAlcohol: checked === true})} />
                                    <Label htmlFor="containsAlcohol" className="text-xs font-bold text-rose-700 cursor-pointer">{t('menus.form.containsAlcohol')}</Label>
                                </div>
                                <div className="flex items-center space-x-2 bg-pink-50/50 p-2 rounded border border-pink-100">
                                    <Checkbox id="containsPork" checked={itemForm.containsPork} onCheckedChange={(checked) => setItemForm({...itemForm, containsPork: checked === true})} />
                                    <Label htmlFor="containsPork" className="text-xs font-bold text-pink-700 cursor-pointer">{t('menus.form.containsPork')}</Label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsItemDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400 uppercase">{t('menus.buttons.cancel')}</Button>
                        <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-8 rounded-sm">{t('menus.buttons.saveDishDetails')}</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
        <PasswordConfirmDialog
            open={!!deleteMenuId} 
            onOpenChange={(open) => { if (!open) setDeleteMenuId(null); }}
            onConfirm={executeDeleteMenu}
            title={t('menus.title.deleteMenu')}
            description={t('menus.title.deleteMenuDesc')}
            actionLabel={t('menus.buttons.deleteMenu')}
            isDangerous={true}
        />
      </div>
    </>
  );
}
