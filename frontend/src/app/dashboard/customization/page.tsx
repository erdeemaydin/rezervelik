'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
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
            toast.error('Failed to load customization settings');
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
            toast.success('Frontend customization updated');
        } catch (error) {
            toast.error('Failed to save customization');
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
            <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Public Page Customization</h1>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Design and manage your customer-facing portal</p>
                    </div>
                    <Button onClick={handleSave} disabled={loading} className="bg-slate-900 hover:bg-black text-white font-black uppercase text-[10px] px-6 h-10 rounded-sm shadow-md transition-all active:scale-95">
                        {loading ? 'Saving...' : <><Save className="w-3.5 h-3.5 mr-2" /> Publish Changes</>}
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2">
                        <Tabs defaultValue="theming" className="w-full">
                            <TabsList className="grid w-full grid-cols-4 bg-slate-100 rounded-sm p-1">
                                <TabsTrigger value="theming" className="text-xs font-bold uppercase"><Palette className="w-3 h-3 mr-2" /> Theming</TabsTrigger>
                                <TabsTrigger value="announcements" className="text-xs font-bold uppercase"><Megaphone className="w-3 h-3 mr-2" /> Banner</TabsTrigger>
                                <TabsTrigger value="pages" className="text-xs font-bold uppercase"><FileText className="w-3 h-3 mr-2" /> Static Pages</TabsTrigger>
                                <TabsTrigger value="reservation" className="text-xs font-bold uppercase"><FileText className="w-3 h-3 mr-2" /> Booking Rules</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="theming" className="mt-4">
                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-6 border-b border-slate-100">
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">Design Templates & Colors</CardTitle>
                                        <CardDescription className="text-xs">Choose how your menu is presented to guests.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-6">
                                        <div className="space-y-3">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Typography</Label>
                                            <Select 
                                                value={customization.typography} 
                                                onValueChange={(v) => { if (v) setCustomization({...customization, typography: v}); }}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Select typography" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="SANS">Sans-Serif</SelectItem>
                                                    <SelectItem value="SERIF">Serif</SelectItem>
                                                    <SelectItem value="MONO">Monospace</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t border-slate-100">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Color Palette Preset</Label>
                                            <Select 
                                                value={customization.colorPalette} 
                                                onValueChange={(v) => { if (v) setCustomization({...customization, colorPalette: v}); }}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Select color palette" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="OBSIDIAN">Obsidian (Dark / Clean)</SelectItem>
                                                    <SelectItem value="EARTH">Earth (Warm / Rustic)</SelectItem>
                                                    <SelectItem value="CRIMSON">Crimson (Bold / Wine)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t border-slate-100">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Primary Brand Color (Hex)</Label>
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
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">Temporary Announcement</CardTitle>
                                        <CardDescription className="text-xs">Display a banner at the top of the customer page.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-4">
                                        <div className="space-y-3">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Banner Text</Label>
                                            <Textarea 
                                                placeholder="e.g. We are closed for private events this weekend!" 
                                                value={customization.announcementText} 
                                                onChange={(e) => setCustomization({...customization, announcementText: e.target.value})}
                                                className="min-h-[100px] text-sm" 
                                            />
                                            <p className="text-[10px] text-slate-400">Leave blank to hide the banner completely.</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="pages" className="mt-4 space-y-6">
                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                                        <div>
                                            <CardTitle className="text-sm font-black uppercase tracking-tight">About Us Page</CardTitle>
                                            <CardDescription className="text-[10px]">Your story and background</CardDescription>
                                        </div>
                                        <Switch checked={customization.showAboutUs} onCheckedChange={(c) => setCustomization({...customization, showAboutUs: c})} />
                                    </CardHeader>
                                    {customization.showAboutUs && (
                                        <CardContent className="p-6">
                                            <Textarea 
                                                placeholder="Write your story here..." 
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
                                            <CardTitle className="text-sm font-black uppercase tracking-tight">Legal / Terms</CardTitle>
                                            <CardDescription className="text-[10px]">Terms of service or privacy policy</CardDescription>
                                        </div>
                                        <Switch checked={customization.showLegal} onCheckedChange={(c) => setCustomization({...customization, showLegal: c})} />
                                    </CardHeader>
                                    {customization.showLegal && (
                                        <CardContent className="p-6">
                                            <Textarea 
                                                placeholder="Write your legal terms here..." 
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
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">Reservation Guidelines</CardTitle>
                                        <CardDescription className="text-xs">Provide general information and dress codes for reservations. You can use simple HTML for links.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-6">
                                        <div className="space-y-3">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">General Information Text (HTML/Text)</Label>
                                            <Textarea 
                                                placeholder="e.g. <p>Restoranımız 09:00 - 01:00 arası hizmet vermektedir.</p>" 
                                                value={customization.reservationInfoText} 
                                                onChange={(e) => setCustomization({...customization, reservationInfoText: e.target.value})}
                                                className="min-h-[120px] text-sm font-mono bg-slate-50" 
                                            />
                                            <p className="text-[10px] text-slate-500">Supports basic HTML (e.g. &lt;a href="..."&gt;, &lt;strong&gt;, &lt;p&gt;).</p>
                                        </div>

                                        <div className="space-y-3 pt-4 border-t border-slate-100">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Warning / Strict Rules (HTML/Text)</Label>
                                            <Textarea 
                                                placeholder="e.g. <p>Smart Casual dress code is strictly enforced.</p>" 
                                                value={customization.reservationWarningText} 
                                                onChange={(e) => setCustomization({...customization, reservationWarningText: e.target.value})}
                                                className="min-h-[120px] text-sm font-mono bg-slate-50" 
                                            />
                                            <p className="text-[10px] text-slate-500">This section will be highlighted to draw guest attention.</p>
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
                                    <Smartphone className="w-4 h-4" /> Live Preview
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                <div className="text-xs text-slate-500 mb-6 leading-relaxed">
                                    Changes made here will immediately affect your public reservation page.
                                </div>
                                <div 
                                    className="w-full h-32 rounded-md shadow-inner flex flex-col items-center justify-center border-2 border-dashed border-slate-300"
                                    style={{ backgroundColor: `${customization.primaryColor}20`, borderColor: customization.primaryColor }}
                                >
                                    <div className="font-black uppercase tracking-widest text-xs" style={{ color: customization.primaryColor }}>{customization.layoutStyle.replace('_', ' ')}</div>
                                    <div className="text-[10px] font-bold mt-1 text-slate-600">{customization.colorPalette} PALETTE / {customization.typography}</div>
                                    <div className="mt-2 w-1/2 h-1 rounded-full opacity-50" style={{ backgroundColor: customization.primaryColor }}></div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
