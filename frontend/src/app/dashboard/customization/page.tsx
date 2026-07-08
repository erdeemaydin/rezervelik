'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from "@/i18n/provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from '@/lib/api';
import { toast } from 'sonner';
import { Save, Palette, Megaphone, FileText, Smartphone } from 'lucide-react';

interface Customization {
    layoutStyle: string;
    typography: string;
    colorPalette: string;
    primaryColor: string;
    announcementText: string;
    showAboutUs: boolean;
    aboutUsText: string;
    showLegal: boolean;
    legalText: string;
    reservationInfoText: string;
    reservationWarningText: string;
}

export default function CustomizationPage() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [customization, setCustomization] = useState<Customization>({
        layoutStyle: 'CLASSIC_LIST',
        typography: 'SANS',
        colorPalette: 'OBSIDIAN',
        primaryColor: '#0f172a',
        announcementText: '',
        showAboutUs: false,
        aboutUsText: '',
        showLegal: false,
        legalText: '',
        reservationInfoText: '',
        reservationWarningText: '',
    });

    const fetchCustomization = useCallback(async () => {
        try {
            setFetching(true);
            const res = await api.get('/customization');
            if (res.data.data) {
                const data = res.data.data;
                setCustomization({
                    layoutStyle: data.layoutStyle || 'CLASSIC_LIST',
                    typography: data.typography || 'SANS',
                    colorPalette: data.colorPalette || 'OBSIDIAN',
                    primaryColor: data.primaryColor || '#0f172a',
                    announcementText: data.announcementText || '',
                    showAboutUs: data.showAboutUs || false,
                    aboutUsText: data.aboutUsText || '',
                    showLegal: data.showLegal || false,
                    legalText: data.legalText || '',
                    reservationInfoText: data.reservationInfoText || '',
                    reservationWarningText: data.reservationWarningText || '',
                });
            }
        } catch (error) {
            toast.error(t("customization.loadError"));
        } finally {
            setFetching(false);
        }
    }, []);

    useEffect(() => {
        fetchCustomization();
    }, [fetchCustomization]);

    const handleSave = async () => {
        try {
            setLoading(true);
            await api.put('/customization', customization);
            toast.success(t("customization.updateSuccess"));
        } catch (error) {
            toast.error(t("customization.saveError"));
        } finally {
            setLoading(false);
        }
    };

    if (fetching) {
        return (
            <>
                <div className="flex items-center justify-center h-[60vh]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">{t("customization.pageTitle")}</h1>
                        <p className="text-xs text-slate-500 font-black uppercase tracking-[0.2em] mt-2">{t("customization.pageSubtitle")}</p>
                    </div>
                    <Button onClick={handleSave} disabled={loading} className="bg-slate-900 hover:bg-black text-white font-black uppercase text-xs px-8 h-12 rounded-lg shadow-md transition-all active:scale-95">
                        {loading ? t("customization.saving") : <><Save className="w-5 h-5 mr-3" /> {t("customization.publishChanges")}</>}
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2">
                        <Tabs defaultValue="theming" className="w-full">
                            <TabsList className="grid w-full grid-cols-4 bg-slate-100 rounded-sm p-1">
                                <TabsTrigger value="theming" className="text-xs font-bold uppercase"><Palette className="w-3 h-3 mr-2" /> {t("customization.tabs.theming")}</TabsTrigger>
                                <TabsTrigger value="announcements" className="text-xs font-bold uppercase"><Megaphone className="w-3 h-3 mr-2" /> {t("customization.tabs.banner")}</TabsTrigger>
                                <TabsTrigger value="pages" className="text-xs font-bold uppercase"><FileText className="w-3 h-3 mr-2" /> {t("customization.tabs.staticPages")}</TabsTrigger>
                                <TabsTrigger value="reservation" className="text-xs font-bold uppercase"><FileText className="w-3 h-3 mr-2" /> {t("customization.tabs.bookingRules")}</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="theming" className="mt-6">
                                <Card className="rounded-xl border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-8 border-b border-slate-100">
                                        <CardTitle className="text-lg font-black uppercase tracking-tight">{t("customization.theming.title")}</CardTitle>
                                        <CardDescription className="text-sm mt-1">{t("customization.theming.desc")}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-8 space-y-8">
                                        <div className="space-y-4">
                                            <Label className="text-xs font-black uppercase tracking-wider text-slate-500">{t("customization.theming.typography")}</Label>
                                            <Select 
                                                value={customization.typography} 
                                                onValueChange={(v) => { if (v) setCustomization({...customization, typography: v}); }}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder={t("customization.theming.selectTypography")} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="SANS">{t("customization.theming.sansSerif")}</SelectItem>
                                                    <SelectItem value="SERIF">{t("customization.theming.serif")}</SelectItem>
                                                    <SelectItem value="MONO">{t("customization.theming.monospace")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t border-slate-100">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("customization.theming.colorPalette")}</Label>
                                            <Select 
                                                value={customization.colorPalette} 
                                                onValueChange={(v) => { if (v) setCustomization({...customization, colorPalette: v}); }}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder={t("customization.theming.selectPalette")} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="OBSIDIAN">{t("customization.theming.obsidian")}</SelectItem>
                                                    <SelectItem value="EARTH">{t("customization.theming.earth")}</SelectItem>
                                                    <SelectItem value="CRIMSON">{t("customization.theming.crimson")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t border-slate-100">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("customization.theming.primaryColor")}</Label>
                                            <div className="flex gap-4">
                                                <Input 
                                                    type="color" 
                                                    value={customization.primaryColor} 
                                                    onChange={(e) => setCustomization({...customization, primaryColor: e.target.value})}
                                                    className="w-16 h-12 p-1 cursor-pointer" 
                                                />
                                                <Input 
                                                    type="text" 
                                                    value={customization.primaryColor} 
                                                    onChange={(e) => setCustomization({...customization, primaryColor: e.target.value})}
                                                    className="flex-1 h-12 font-bold uppercase" 
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="announcements" className="mt-4">
                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-6 border-b border-slate-100">
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">{t("customization.banner.title")}</CardTitle>
                                        <CardDescription className="text-xs">{t("customization.banner.desc")}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-4">
                                        <div className="space-y-3">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("customization.banner.textLabel")}</Label>
                                            <Textarea 
                                                placeholder={t("customization.banner.placeholder")} 
                                                value={customization.announcementText} 
                                                onChange={(e) => setCustomization({...customization, announcementText: e.target.value})}
                                                className="min-h-[100px] text-sm" 
                                            />
                                            <p className="text-[10px] text-slate-400">{t("customization.banner.hint")}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="pages" className="mt-4 space-y-6">
                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle className="text-sm font-black uppercase tracking-tight">{t("customization.pages.aboutUs.title")}</CardTitle>
                                            <CardDescription className="text-[10px]">{t("customization.pages.aboutUs.desc")}</CardDescription>
                                        </div>
                                        <Switch checked={customization.showAboutUs} onCheckedChange={(c) => setCustomization({...customization, showAboutUs: c})} />
                                    </CardHeader>
                                    {customization.showAboutUs && (
                                        <CardContent className="p-6">
                                            <Textarea 
                                                placeholder={t("customization.pages.aboutUs.placeholder")} 
                                                value={customization.aboutUsText} 
                                                onChange={(e) => setCustomization({...customization, aboutUsText: e.target.value})}
                                                className="min-h-[150px] text-sm" 
                                            />
                                        </CardContent>
                                    )}
                                </Card>

                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle className="text-sm font-black uppercase tracking-tight">{t("customization.pages.legal.title")}</CardTitle>
                                            <CardDescription className="text-[10px]">{t("customization.pages.legal.desc")}</CardDescription>
                                        </div>
                                        <Switch checked={customization.showLegal} onCheckedChange={(c) => setCustomization({...customization, showLegal: c})} />
                                    </CardHeader>
                                    {customization.showLegal && (
                                        <CardContent className="p-6">
                                            <Textarea 
                                                placeholder={t("customization.pages.legal.placeholder")} 
                                                value={customization.legalText} 
                                                onChange={(e) => setCustomization({...customization, legalText: e.target.value})}
                                                className="min-h-[150px] text-sm" 
                                            />
                                        </CardContent>
                                    )}
                                </Card>
                            </TabsContent>

                            <TabsContent value="reservation" className="mt-4 space-y-6">
                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-6 border-b border-slate-100">
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">{t("customization.rules.title")}</CardTitle>
                                        <CardDescription className="text-xs">{t("customization.rules.desc")}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-6">
                                        <div className="space-y-3">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("customization.rules.infoLabel")}</Label>
                                            <Textarea 
                                                placeholder={t("customization.rules.infoPlaceholder")} 
                                                value={customization.reservationInfoText} 
                                                onChange={(e) => setCustomization({...customization, reservationInfoText: e.target.value})}
                                                className="min-h-[120px] text-sm font-mono bg-slate-50" 
                                            />
                                            <p className="text-[10px] text-slate-500">{t("customization.rules.infoHint")}</p>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t border-slate-100">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">{t("customization.rules.warningLabel")}</Label>
                                            <Textarea 
                                                placeholder={t("customization.rules.warningPlaceholder")} 
                                                value={customization.reservationWarningText} 
                                                onChange={(e) => setCustomization({...customization, reservationWarningText: e.target.value})}
                                                className="min-h-[120px] text-sm font-mono bg-slate-50" 
                                            />
                                            <p className="text-[10px] text-slate-500">{t("customization.rules.warningHint")}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>

                    {/* Preview / Instructions */}
                    <div className="lg:col-span-1">
                        <Card className="rounded-sm border-slate-200 shadow-sm bg-slate-50 sticky top-6">
                            <CardHeader className="p-6 border-b border-slate-200">
                                <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                                    <Smartphone className="w-4 h-4" /> {t("customization.preview.title")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="text-xs text-slate-500 mb-6 leading-relaxed">
                                    {t("customization.preview.desc")}
                                </div>
                                <div 
                                    className="w-full h-32 rounded-md shadow-inner flex flex-col items-center justify-center border-2 border-dashed border-slate-300"
                                    style={{ backgroundColor: `${customization.primaryColor}20`, borderColor: customization.primaryColor }}
                                >
                                    <div className="font-black uppercase tracking-widest text-xs" style={{ color: customization.primaryColor }}>{customization.layoutStyle.replace('_', ' ')}</div>
                                    <div className="text-[10px] font-bold mt-1 text-slate-600">{customization.colorPalette} {t("customization.preview.palette")} / {customization.typography}</div>
                                    <div className="mt-2 w-1/2 h-1 rounded-full opacity-50" style={{ backgroundColor: customization.primaryColor }}></div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
}
