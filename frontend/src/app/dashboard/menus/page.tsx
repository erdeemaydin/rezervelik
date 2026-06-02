'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit2, Search, LayoutGrid, List, ChevronDown, ChevronRight, Image as ImageIcon, Flame, Leaf, AlertTriangle, Layers } from 'lucide-react';
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
  categoryId: string;
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
  categories: MenuCategory[];
}

export default function MenuManagementPage() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Dialog States
  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isBulkPriceDialogOpen, setIsBulkPriceDialogOpen] = useState(false);
  
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Forms
  const [menuForm, setMenuForm] = useState({ name: '', isActive: true });
  const [categoryForm, setCategoryForm] = useState({ menuId: '', name: '', description: '', imageUrl: '', parentId: 'none' });
  const [itemForm, setItemForm] = useState({ 
      categoryId: '', name: '', description: '', price: '', 
      imageUrl: '', dietaryTags: '', allergens: '', spiceLevel: '0' 
  });
  
  // Bulk Pricing Form
  const [bulkPriceForm, setBulkPriceForm] = useState({
      updateType: 'PERCENTAGE', // PERCENTAGE or FIXED_AMOUNT
      value: '',
      isIncrease: true,
      scheduleUpdate: false,
      scheduledFor: ''
  });

  const handleBulkPriceSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!bulkPriceForm.value) return toast.error('Value is required');

      try {
          const payload: any = {
              updateType: bulkPriceForm.updateType,
              value: parseFloat(bulkPriceForm.value),
              isIncrease: bulkPriceForm.isIncrease
          };

          if (bulkPriceForm.scheduleUpdate && bulkPriceForm.scheduledFor) {
              payload.scheduledFor = new Date(bulkPriceForm.scheduledFor).toISOString();
          }

          await api.post('/menus/prices/bulk', payload);
          toast.success(bulkPriceForm.scheduleUpdate ? 'Price update scheduled' : 'Prices updated immediately');
          setIsBulkPriceDialogOpen(false);
          setBulkPriceForm({ updateType: 'PERCENTAGE', value: '', isIncrease: true, scheduleUpdate: false, scheduledFor: '' });
          if (!bulkPriceForm.scheduleUpdate) fetchMenus();
      } catch (err) {
          toast.error('Failed to apply bulk price update');
      }
  };

  const fetchMenus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/menus');
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
      toast.error('Failed to load menus');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenus();
  }, [fetchMenus]);

  const activeMenu = menus.find(m => m.id === activeMenuId);

  const toggleCategory = (id: string) => {
      const newSet = new Set(expandedCategories);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setExpandedCategories(newSet);
  };

  // --- MENU ACTIONS ---
  const handleMenuSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          if (isEditMode && editId) {
              await api.put(`/menus/${editId}`, menuForm);
              toast.success('Menu updated');
          } else {
              const res = await api.post('/menus', menuForm);
              setActiveMenuId(res.data.data.id);
              toast.success('Menu created');
          }
          setIsMenuDialogOpen(false);
          fetchMenus();
      } catch (err) { toast.error('Failed to save menu'); }
  };

  const handleDeleteMenu = async (id: string) => {
      if (!confirm('Delete this entire menu? This cannot be undone.')) return;
      try {
          await api.delete(`/menus/${id}`);
          toast.success('Menu deleted');
          if (activeMenuId === id) setActiveMenuId(null);
          fetchMenus();
      } catch (err) { toast.error('Failed to delete menu'); }
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
              toast.success('Category updated');
          } else {
              await api.post('/menus/categories', payload);
              toast.success('Category created');
          }
          setIsCategoryDialogOpen(false);
          fetchMenus();
      } catch (err) { toast.error('Failed to save category'); }
  };

  const handleDeleteCategory = async (id: string) => {
      if (!confirm('Delete category? All sub-items will be lost.')) return;
      try {
          await api.delete(`/menus/categories/${id}`);
          toast.success('Deleted');
          fetchMenus();
      } catch (err) { toast.error('Delete failed'); }
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
              allergens: editItem.allergens || '', spiceLevel: editItem.spiceLevel.toString()
          });
      } else {
          setIsEditMode(false);
          setEditId(null);
          setItemForm({ 
              categoryId, name: '', description: '', price: '', 
              imageUrl: '', dietaryTags: '', allergens: '', spiceLevel: '0' 
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
              toast.success('Item updated');
          } else {
              await api.post(`/menus/categories/${itemForm.categoryId}/items`, payload);
              toast.success('Item added');
          }
          setIsItemDialogOpen(false);
          fetchMenus();
      } catch (err) { toast.error('Failed to save item'); }
  };

  const handleDeleteItem = async (id: string) => {
      if (!confirm('Delete this item?')) return;
      try {
          await api.delete(`/menus/items/${id}`);
          toast.success('Item deleted');
          fetchMenus();
      } catch (err) { toast.error('Delete failed'); }
  };

  // --- RENDER HELPERS ---
  const renderItemsTable = (items: MenuItem[], categoryId: string) => (
      <div className="bg-white border-t border-slate-100">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow className="h-8">
              <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">Dish Information</TableHead>
              <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Tags / Specs</TableHead>
              <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Price</TableHead>
              <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="h-16 text-center text-xs text-slate-400 font-bold italic">No items in this category.</TableCell></TableRow>
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
                    <span className="font-black text-blue-700 text-sm">{item.price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</span>
                </TableCell>
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
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Dish to Category
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
                              <Badge className="bg-slate-200 text-slate-600 hover:bg-slate-200 border-0 text-[9px] px-1.5 shadow-none">{cat.items?.length || 0} Items</Badge>
                          </div>
                          {cat.description && <div className="text-[10px] text-slate-500 mt-0.5">{cat.description}</div>}
                      </div>
                  </div>
                  <div className="flex items-center gap-1">
                      {!isSub && (
                          <Button variant="outline" size="sm" className="h-7 px-3 text-[10px] font-black uppercase text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100" onClick={(e) => { e.stopPropagation(); handleOpenCategory(activeMenuId!, cat.id); }}>
                              <Plus className="w-3 h-3 mr-1" /> Sub-Category
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
    <AdminLayout>
      <div className="flex flex-col gap-4">
        {/* Header - High Density Corporate */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Menu Architecture</h1>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 italic">Digital Catalogue & Pricing</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsBulkPriceDialogOpen(true)} className="h-9 px-4 text-[10px] font-black uppercase border-blue-200 text-blue-700 shadow-sm bg-blue-50 hover:bg-blue-100">
                <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Bulk Price Update
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setIsEditMode(false); setMenuForm({name:'', isActive:true}); setIsMenuDialogOpen(true); }} className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Menu
            </Button>
          </div>
        </div>

        {/* Command Center & Active Menu Selection */}
        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between">
                <div className="flex items-center gap-4">
                    <Select value={activeMenuId || ''} onValueChange={setActiveMenuId}>
                        <SelectTrigger className="h-10 w-[250px] text-sm font-black border-slate-200 shadow-sm bg-white uppercase">
                            <SelectValue placeholder="Select Active Menu">
                                {menus.find(m => m.id === activeMenuId)?.name || 'Select Active Menu'}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {menus.map(m => (
                                <SelectItem key={m.id} value={m.id} className="font-bold text-xs uppercase">{m.name} {m.isActive ? '(Live)' : ''}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {activeMenu && (
                        <div className="flex items-center gap-2">
                            <Badge className={cn("text-[9px] font-black uppercase px-2 shadow-none rounded-sm", activeMenu.isActive ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600")}>
                                {activeMenu.isActive ? 'Live' : 'Draft'}
                            </Badge>
                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold text-blue-600 hover:bg-blue-50" onClick={() => {
                                setIsEditMode(true); setEditId(activeMenu.id); setMenuForm({name: activeMenu.name, isActive: activeMenu.isActive}); setIsMenuDialogOpen(true);
                            }}>
                                <Edit2 className="w-3 h-3 mr-1" /> Edit Meta
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 text-[10px] font-bold text-red-600 hover:bg-red-50" onClick={() => handleDeleteMenu(activeMenu.id)}>
                                <Trash2 className="w-3 h-3 mr-1" /> Delete Menu
                            </Button>
                        </div>
                    )}
                </div>
                {activeMenu && (
                    <Button size="sm" onClick={() => handleOpenCategory(activeMenu.id)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-sm h-9 px-6 font-black text-[10px] uppercase shadow-md shadow-blue-600/20">
                        <Plus className="w-3.5 h-3.5 mr-1.5 stroke-[3]" /> Add Root Category
                    </Button>
                )}
            </CardHeader>
            <CardContent className="p-6 bg-slate-50/30 min-h-[500px]">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-blue-600 mb-4"></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Catalog...</p>
                    </div>
                ) : !activeMenu ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded-lg bg-white">
                        <List className="w-12 h-12 text-slate-300 mb-4" />
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">No Menu Selected</h3>
                        <p className="text-xs text-slate-400 font-medium mt-1">Create a new menu or select an existing one.</p>
                    </div>
                ) : activeMenu.categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-slate-200 rounded-lg bg-white">
                        <Layers className="w-12 h-12 text-slate-300 mb-4" />
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Empty Menu Structure</h3>
                        <p className="text-xs text-slate-400 font-medium mt-1 mb-4">Start organizing your offerings by creating root categories.</p>
                        <Button size="sm" onClick={() => handleOpenCategory(activeMenu.id)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-sm h-9 px-6 font-black text-[10px] uppercase">Add Root Category</Button>
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
                        <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">{isEditMode ? 'Edit Menu' : 'Create Menu'}</DialogTitle></DialogHeader>
                    </div>
                    <div className="p-6 space-y-4 bg-white">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Menu Title</Label>
                            <Input required value={menuForm.name} onChange={e => setMenuForm({...menuForm, name: e.target.value})} placeholder="e.g. Dinner Menu, Summer Special" className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                        </div>
                        <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-sm">
                            <Checkbox checked={menuForm.isActive} onCheckedChange={(c) => setMenuForm({...menuForm, isActive: !!c})} />
                            <Label className="text-xs font-bold text-slate-700">Active (Visible to customers)</Label>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsMenuDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400 uppercase">Cancel</Button>
                        <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm">Save Menu</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>

        {/* Category Dialog */}
        <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
            <DialogContent maxWidth="sm:max-w-md" className="p-0 rounded-md border-0 shadow-2xl">
                <form onSubmit={handleCategorySubmit}>
                    <div className="bg-slate-900 p-4 text-white">
                        <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">{isEditMode ? 'Edit Category' : 'Create Category'}</DialogTitle></DialogHeader>
                    </div>
                    <div className="p-6 space-y-4 bg-white">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Category Name</Label>
                            <Input required value={categoryForm.name} onChange={e => setCategoryForm({...categoryForm, name: e.target.value})} placeholder="e.g. Main Courses, Cocktails" className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Description (Optional)</Label>
                            <Textarea value={categoryForm.description} onChange={e => setCategoryForm({...categoryForm, description: e.target.value})} className="min-h-[60px] text-xs font-medium border-slate-200 rounded-sm" placeholder="A brief overview of this section..." />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Cover Image URL (Optional)</Label>
                            <Input value={categoryForm.imageUrl} onChange={e => setCategoryForm({...categoryForm, imageUrl: e.target.value})} placeholder="https://..." className="h-10 text-xs font-medium border-slate-200 rounded-sm" />
                        </div>
                        <div className="grid gap-1.5 hidden">
                            {/* Hidden Parent ID mapping, passed via state logic */}
                            <Input type="hidden" value={categoryForm.parentId} />
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsCategoryDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400 uppercase">Cancel</Button>
                        <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm">Save Category</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>

        {/* Item Dialog */}
        <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
            <DialogContent maxWidth="sm:max-w-2xl" className="p-0 rounded-md border-0 shadow-2xl">
                <form onSubmit={handleItemSubmit}>
                    <div className="bg-slate-900 p-4 text-white">
                        <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">{isEditMode ? 'Edit Dish' : 'Add New Dish'}</DialogTitle></DialogHeader>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white">
                        <div className="space-y-4">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Dish Name</Label>
                                <Input required value={itemForm.name} onChange={e => setItemForm({...itemForm, name: e.target.value})} placeholder="e.g. Truffle Risotto" className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Description / Ingredients</Label>
                                <Textarea value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} className="min-h-[80px] text-xs font-medium border-slate-200 rounded-sm" placeholder="..." />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Price (TRY)</Label>
                                <Input type="number" step="0.01" required value={itemForm.price} onChange={e => setItemForm({...itemForm, price: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Image URL (Optional)</Label>
                                <Input value={itemForm.imageUrl} onChange={e => setItemForm({...itemForm, imageUrl: e.target.value})} placeholder="https://..." className="h-10 text-xs font-medium border-slate-200 rounded-sm" />
                            </div>
                        </div>

                        <div className="space-y-4 border-l border-slate-100 pl-6">
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-green-600 tracking-[0.2em] flex items-center gap-1"><Leaf className="w-3 h-3" /> Dietary Tags</Label>
                                <Input value={itemForm.dietaryTags} onChange={e => setItemForm({...itemForm, dietaryTags: e.target.value})} placeholder="e.g. Vegan, Gluten-Free (Comma separated)" className="h-10 text-xs font-bold border-green-200 bg-green-50/30 rounded-sm focus:border-green-400" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-orange-600 tracking-[0.2em] flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Allergens</Label>
                                <Input value={itemForm.allergens} onChange={e => setItemForm({...itemForm, allergens: e.target.value})} placeholder="e.g. Nuts, Dairy, Shellfish" className="h-10 text-xs font-bold border-orange-200 bg-orange-50/30 rounded-sm focus:border-orange-400" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-red-600 tracking-[0.2em] flex items-center gap-1"><Flame className="w-3 h-3" /> Spice Level</Label>
                                <Select value={itemForm.spiceLevel} onValueChange={v => setItemForm({...itemForm, spiceLevel: v || '0'})}>
                                    <SelectTrigger className="h-10 text-xs font-bold border-red-200 bg-red-50/30 rounded-sm">
                                        <SelectValue>
                                            {itemForm.spiceLevel === '0' ? '0 - None' : 
                                             itemForm.spiceLevel === '1' ? '1 - Mild' : 
                                             itemForm.spiceLevel === '2' ? '2 - Medium' : 
                                             itemForm.spiceLevel === '3' ? '3 - Hot' : 
                                             itemForm.spiceLevel === '4' ? '4 - Extreme' : 'Select Spice Level'}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0" className="text-xs">0 - None</SelectItem>
                                        <SelectItem value="1" className="text-xs">1 - Mild</SelectItem>
                                        <SelectItem value="2" className="text-xs">2 - Medium</SelectItem>
                                        <SelectItem value="3" className="text-xs">3 - Hot</SelectItem>
                                        <SelectItem value="4" className="text-xs">4 - Extreme</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsItemDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400 uppercase">Cancel</Button>
                        <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-8 rounded-sm">Save Dish Details</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
        {/* Bulk Price Update Dialog */}
        <Dialog open={isBulkPriceDialogOpen} onOpenChange={setIsBulkPriceDialogOpen}>
            <DialogContent maxWidth="sm:max-w-md" className="p-0 rounded-md border-0 shadow-2xl">
                <form onSubmit={handleBulkPriceSubmit}>
                    <div className="bg-slate-900 p-4 text-white">
                        <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">Bulk Price Update</DialogTitle></DialogHeader>
                    </div>
                    <div className="p-6 space-y-6 bg-white">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Type</Label>
                                <Select value={bulkPriceForm.updateType} onValueChange={v => setBulkPriceForm({...bulkPriceForm, updateType: v})}>
                                    <SelectTrigger className="h-10 text-xs font-bold border-slate-200 rounded-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PERCENTAGE" className="text-xs">Percentage (%)</SelectItem>
                                        <SelectItem value="FIXED_AMOUNT" className="text-xs">Fixed Amount</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Direction</Label>
                                <Select value={bulkPriceForm.isIncrease ? 'true' : 'false'} onValueChange={v => setBulkPriceForm({...bulkPriceForm, isIncrease: v === 'true'})}>
                                    <SelectTrigger className="h-10 text-xs font-bold border-slate-200 rounded-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true" className="text-xs">Increase (+)</SelectItem>
                                        <SelectItem value="false" className="text-xs">Decrease (-)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Value ({bulkPriceForm.updateType === 'PERCENTAGE' ? '%' : 'TRY'})</Label>
                            <Input required type="number" step="0.01" value={bulkPriceForm.value} onChange={e => setBulkPriceForm({...bulkPriceForm, value: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono" />
                        </div>

                        <div className="pt-4 border-t border-slate-100 space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-slate-700">Schedule for Later?</Label>
                                <Checkbox checked={bulkPriceForm.scheduleUpdate} onCheckedChange={c => setBulkPriceForm({...bulkPriceForm, scheduleUpdate: !!c})} />
                            </div>
                            {bulkPriceForm.scheduleUpdate && (
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Date & Time</Label>
                                    <Input required type="datetime-local" value={bulkPriceForm.scheduledFor} onChange={e => setBulkPriceForm({...bulkPriceForm, scheduledFor: e.target.value})} className="h-10 text-xs font-medium border-slate-200 rounded-sm" />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsBulkPriceDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400 uppercase">Cancel</Button>
                        <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase px-6 rounded-sm">
                            {bulkPriceForm.scheduleUpdate ? 'Schedule Update' : 'Apply Now'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
