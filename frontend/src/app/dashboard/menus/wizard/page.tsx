'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { CaretRight, ArrowLeft, Image as ImageIcon, ForkKnife, Info, CheckCircle } from '@phosphor-icons/react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from "@/i18n/provider";

export default function MenuWizardPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [restaurant, setRestaurant] = useState<any>(null);

  // Form State
  const [menuInfo, setMenuInfo] = useState({ name: '', footnotes: '', isActive: true });
  const [categories, setCategories] = useState([{ id: 'cat-1', name: '', description: '', items: [] as any[] }]);

  useEffect(() => {
    // Fetch restaurant data for logo
    api.get('/restaurants/me').then(res => setRestaurant(res.data.data)).catch(console.error);
  }, []);

  const handleCreateMenu = async () => {
    try {
      setLoading(true);
      toast.loading(t("menusWizard.creatingMenu"), { id: 'wizard' });
      
      // 1. Create Menu
      const menuRes = await api.post('/menus', menuInfo);
      const menuId = menuRes.data.data.id;

      // 2. Create Categories & Items
      for (const cat of categories) {
        if (!cat.name.trim()) continue;
        const catRes = await api.post('/menus/categories', {
          menuId,
          name: cat.name,
          description: cat.description
        });
        const categoryId = catRes.data.data.id;

        for (const item of cat.items) {
          if (!item.name.trim()) continue;
          // Matches the actual registered route: POST /menus/items with
          // categoryId in the body, not a nested /categories/:id/items path.
          await api.post('/menus/items', {
            ...item,
            categoryId,
            price: parseFloat(item.price) || 0
          });
        }
      }

      toast.success(t("menusWizard.menuCreated"), { id: 'wizard' });
      router.push('/dashboard/menus');
    } catch (error) {
      console.error(error);
      toast.error(t("menusWizard.menuCreationFailed"), { id: 'wizard' });
      setLoading(false);
    }
  };

  const addCategory = () => {
    setCategories([...categories, { id: `cat-${Date.now()}`, name: '', description: '', items: [] }]);
  };

  const addItem = (catIndex: number) => {
    const newCategories = [...categories];
    newCategories[catIndex].items.push({
      id: `item-${Date.now()}`,
      name: '',
      description: '',
      price: '',
      imageUrl: ''
    });
    setCategories(newCategories);
  };

  const updateCategory = (index: number, field: string, value: string) => {
    const newCategories = [...categories];
    newCategories[index] = { ...newCategories[index], [field]: value };
    setCategories(newCategories);
  };

  const updateItem = (catIndex: number, itemIndex: number, field: string, value: string) => {
    const newCategories = [...categories];
    newCategories[catIndex].items[itemIndex] = { ...newCategories[catIndex].items[itemIndex], [field]: value };
    setCategories(newCategories);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, catIndex: number, itemIndex: number) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await api.post('/uploads/image', formData, { headers: { 'Content-Type': 'multipart/form-data' }});
      updateItem(catIndex, itemIndex, 'imageUrl', res.data.data.url);
      toast.success(t("menusWizard.imageUploaded"));
    } catch (error) {
      toast.error(t("menusWizard.imageUploadFailed"));
    }
  };

  return (
    <>
      <div className="max-w-4xl mx-auto pb-12">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t("menusWizard.title")}</h1>
            <p className="text-sm text-slate-500">{t("menusWizard.step")} {step} {t("menusWizard.of3")}</p>
          </div>
        </div>

        {/* STEP 1: Basic Info */}
        {step === 1 && (
          <Card className="border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">{t("menusWizard.basicInfo")}</CardTitle>
                <CardDescription>{t("menusWizard.basicInfoDesc")}</CardDescription>
              </div>
              {restaurant?.logoUrl ? (
                <img src={restaurant.logoUrl} alt="Logo" className="h-12 w-auto object-contain rounded" />
              ) : (
                <div className="h-12 w-12 rounded bg-blue-100 flex items-center justify-center text-blue-700 font-black tracking-widest text-xs">{t("menusWizard.logo")}</div>
              )}
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500">{t("menusWizard.menuName")}</Label>
                <Input value={menuInfo.name} onChange={(e) => setMenuInfo({...menuInfo, name: e.target.value})} placeholder={t("menusWizard.menuNamePlaceholder")} className="h-12 font-bold text-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Info className="w-3.5 h-3.5"/> {t("menusWizard.footnotes")}</Label>
                <Textarea value={menuInfo.footnotes} onChange={(e) => setMenuInfo({...menuInfo, footnotes: e.target.value})} placeholder={t("menusWizard.footnotesPlaceholder")} className="min-h-[100px]" />
              </div>
              <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <Checkbox checked={menuInfo.isActive} onCheckedChange={(c) => setMenuInfo({...menuInfo, isActive: !!c})} id="active" />
                <Label htmlFor="active" className="font-bold text-slate-700">{t("menusWizard.makeActive")}</Label>
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={() => setStep(2)} disabled={!menuInfo.name.trim()} className="h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                  {t("menusWizard.nextAddCategories")} <CaretRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: Categories & Items */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            {categories.map((cat, cIdx) => (
              <Card key={cat.id} className="border-slate-200 shadow-sm overflow-hidden border-t-4 border-t-blue-500">
                <CardHeader className="bg-slate-50 p-4 border-b border-slate-100">
                  <Input value={cat.name} onChange={(e) => updateCategory(cIdx, 'name', e.target.value)} placeholder={t("menusWizard.categoryNamePlaceholder")} className="h-10 font-bold text-base bg-white" />
                  <Input value={cat.description} onChange={(e) => updateCategory(cIdx, 'description', e.target.value)} placeholder={t("menusWizard.categoryDescPlaceholder")} className="h-8 text-xs bg-white mt-2" />
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-slate-100">
                    {cat.items.map((item, iIdx) => (
                      <div key={item.id} className="p-4 bg-white flex flex-col md:flex-row gap-4">
                        <div className="w-24 h-24 shrink-0 rounded-md bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center relative overflow-hidden group">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="preview" className="w-full h-full object-cover" />
                          ) : (
                            <><ImageIcon className="w-6 h-6 text-slate-300 mb-1" /><span className="text-[9px] font-bold text-slate-400">{t("menusWizard.upload")}</span></>
                          )}
                          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, cIdx, iIdx)} className="absolute inset-0 opacity-0 cursor-pointer" />
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex gap-3">
                            <Input value={item.name} onChange={(e) => updateItem(cIdx, iIdx, 'name', e.target.value)} placeholder={t("menusWizard.dishName")} className="font-bold" />
                            <Input type="number" value={item.price} onChange={(e) => updateItem(cIdx, iIdx, 'price', e.target.value)} placeholder={t("menusWizard.price")} className="w-32 font-mono" />
                          </div>
                          <Textarea value={item.description} onChange={(e) => updateItem(cIdx, iIdx, 'description', e.target.value)} placeholder={t("menusWizard.dishDescPlaceholder")} className="h-12 min-h-[48px] text-xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => addItem(cIdx)} className="text-xs font-bold text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100"><ForkKnife className="w-3.5 h-3.5 mr-2"/> {t("menusWizard.addDish")}</Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="flex justify-center mt-6">
              <Button variant="outline" onClick={addCategory} className="w-full h-14 border-2 border-dashed border-slate-300 text-slate-500 font-bold hover:border-blue-400 hover:text-blue-600">
                {t("menusWizard.addAnotherCategory")}
              </Button>
            </div>

            <div className="flex justify-between pt-8 border-t border-slate-200">
              <Button variant="ghost" onClick={() => setStep(1)} className="font-bold text-slate-500">{t("menusWizard.back")}</Button>
              <Button onClick={() => setStep(3)} className="h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                {t("menusWizard.reviewPublish")} <CaretRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: Review */}
        {step === 3 && (
          <Card className="border-slate-200 shadow-sm animate-in fade-in slide-in-from-right-4">
            <CardHeader className="text-center pb-8 pt-10">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <CardTitle className="text-2xl font-black">{t("menusWizard.readyToPublish")}</CardTitle>
              <CardDescription>{t("menusWizard.reviewDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="max-w-md mx-auto space-y-6 pb-10">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center">
                <h3 className="font-black text-lg text-slate-800">{menuInfo.name}</h3>
                <p className="text-xs text-slate-500 font-bold mt-1">{categories.length} {t("menusWizard.categories")} • {categories.reduce((acc, cat) => acc + cat.items.length, 0)} {t("menusWizard.items")}</p>
              </div>
              <Button disabled={loading} onClick={handleCreateMenu} className="w-full h-14 text-base bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg shadow-emerald-600/20">
                {loading ? t("menusWizard.publishing") : t("menusWizard.publishNow")}
              </Button>
              <Button variant="ghost" onClick={() => setStep(2)} className="w-full font-bold text-slate-500">{t("menusWizard.goBackEdit")}</Button>
            </CardContent>
          </Card>
        )}

      </div>
    </>
  );
}
