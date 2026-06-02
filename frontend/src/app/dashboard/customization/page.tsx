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
    theme: string;
    primaryColor: string;
    announcementText: string;
    showAboutUs: boolean;
    aboutUsText: string;
    showLegal: boolean;
    legalText: string;
}

export default function CustomizationPage() {
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [customization, setCustomization] = useState<Customization>({
        theme: 'CLASSIC',
        primaryColor: '#0f172a',
        announcementText: '',
        showAboutUs: false,
        aboutUsText: '',
        showLegal: false,
        legalText: '',
    });

    const fetchCustomization = useCallback(async () => {
        try {
            setFetching(true);
            const res = await api.get('/customization');
            if (res.data.data) {
                const data = res.data.data;
                setCustomization({
                    theme: data.theme || 'CLASSIC',
                    primaryColor: data.primaryColor || '#0f172a',
                    announcementText: data.announcementText || '',
                    showAboutUs: data.showAboutUs || false,
                    aboutUsText: data.aboutUsText || '',
                    showLegal: data.showLegal || false,
                    legalText: data.legalText || '',
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
                            <TabsList className="grid w-full grid-cols-3 bg-slate-100 rounded-sm p-1">
                                <TabsTrigger value="theming" className="text-xs font-bold uppercase"><Palette className="w-3 h-3 mr-2" /> Theming</TabsTrigger>
                                <TabsTrigger value="announcements" className="text-xs font-bold uppercase"><Megaphone className="w-3 h-3 mr-2" /> Banner</TabsTrigger>
                                <TabsTrigger value="pages" className="text-xs font-bold uppercase"><FileText className="w-3 h-3 mr-2" /> Static Pages</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="theming" className="mt-4">
                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-6 border-b border-slate-100">
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">Design Templates & Colors</CardTitle>
                                        <CardDescription className="text-xs">Choose how your menu is presented to guests.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-6">
                                        <div className="space-y-3">
                                            <Label className="text-[10px] font-black uppercase text-slate-400">Menu Template</Label>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div 
                                                    onClick={() => setCustomization({...customization, theme: 'CLASSIC'})}
                                                    className={`p-4 border-2 rounded-md cursor-pointer transition-all ${customization.theme === 'CLASSIC' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 hover:border-slate-300'}`}
                                                >
                                                    <div className="font-black text-sm text-slate-800 uppercase">Classic</div>
                                                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Elegant, text-focused list style perfect for fine dining.</p>
                                                </div>
                                                <div 
                                                    onClick={() => setCustomization({...customization, theme: 'MODERN'})}
                                                    className={`p-4 border-2 rounded-md cursor-pointer transition-all ${customization.theme === 'MODERN' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-100 hover:border-slate-300'}`}
                                                >
                                                    <div className="font-black text-sm text-slate-800 uppercase">Modern Grid</div>
                                                    <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">Image-heavy card layout for casual or visual menus.</p>
                                                </div>
                                            </div>
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
