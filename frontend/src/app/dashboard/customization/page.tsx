'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { Save, Palette, Megaphone, FileText, Smartphone, Camera, Share2, Globe, RefreshCw, ExternalLink } from 'lucide-react';

interface SocialLinks {
    instagram: string;
    facebook: string;
    website: string;
}

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
    privacyNoticeText: string;
    socialLinks: SocialLinks;
}

const EMPTY_SOCIAL_LINKS: SocialLinks = { instagram: '', facebook: '', website: '' };

// The backend stores socialLinks as a raw JSON string (FrontendCustomization.socialLinks:
// String?). Parse defensively — a malformed/legacy value should never crash the page.
const parseSocialLinks = (raw: unknown): SocialLinks => {
    if (typeof raw !== 'string' || !raw) return { ...EMPTY_SOCIAL_LINKS };
    try {
        const parsed = JSON.parse(raw);
        return {
            instagram: typeof parsed.instagram === 'string' ? parsed.instagram : '',
            facebook: typeof parsed.facebook === 'string' ? parsed.facebook : '',
            website: typeof parsed.website === 'string' ? parsed.website : '',
        };
    } catch {
        return { ...EMPTY_SOCIAL_LINKS };
    }
};

// Serialize back to the wire shape: null when every field is empty (keeps the
// column clean) rather than persisting `{"instagram":"","facebook":"","website":""}`.
const serializeSocialLinks = (links: SocialLinks): string | null => {
    if (!links.instagram && !links.facebook && !links.website) return null;
    return JSON.stringify(links);
};

// Base logical width the public layouts are designed at (desktop reference) —
// the live preview iframe renders at this width and is scaled down via CSS
// transform to fit whatever width the sidebar panel actually has.
const PREVIEW_DESIGN_WIDTH = 1280;
const PREVIEW_DESIGN_HEIGHT = 1600;
const PREVIEW_VISIBLE_HEIGHT = 420;

export default function CustomizationPage() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [slug, setSlug] = useState<string | null>(null);
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
        privacyNoticeText: '',
        socialLinks: { ...EMPTY_SOCIAL_LINKS },
    });

    // --- Live preview: an iframe of the tenant's real public page, scaled to
    // fit the sidebar panel, kept in sync with unsaved edits via postMessage
    // (see the `?preview=1` handling in frontend/src/app/r/[slug]/page.tsx).
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const previewFrameRef = useRef<HTMLIFrameElement>(null);
    const previewLoadedRef = useRef(false);
    const [previewScale, setPreviewScale] = useState(0.25);
    const [previewKey, setPreviewKey] = useState(0);

    useEffect(() => {
        const el = previewContainerRef.current;
        if (!el) return;
        const updateScale = () => {
            if (el.clientWidth > 0) setPreviewScale(el.clientWidth / PREVIEW_DESIGN_WIDTH);
        };
        updateScale();
        const ro = new ResizeObserver(updateScale);
        ro.observe(el);
        return () => ro.disconnect();
    }, [slug]);

    const postPreviewUpdate = useCallback((draft: Customization) => {
        if (!previewLoadedRef.current) return;
        previewFrameRef.current?.contentWindow?.postMessage(
            {
                source: 'reservepro-preview',
                customization: { ...draft, socialLinks: serializeSocialLinks(draft.socialLinks) },
            },
            window.location.origin
        );
    }, []);

    // Debounced so fast typing doesn't flood the iframe with messages.
    useEffect(() => {
        const timer = setTimeout(() => postPreviewUpdate(customization), 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customization]);

    const handlePreviewLoad = () => {
        previewLoadedRef.current = true;
        postPreviewUpdate(customization);
    };

    const reloadPreview = () => {
        previewLoadedRef.current = false;
        setPreviewKey(k => k + 1);
    };

    const fetchProfile = useCallback(async () => {
        try {
            const res = await api.get('/restaurants/me');
            setSlug(res.data?.data?.slug || null);
        } catch {
            setSlug(null);
        }
    }, []);

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
                    privacyNoticeText: data.privacyNoticeText || '',
                    socialLinks: parseSocialLinks(data.socialLinks),
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
        fetchProfile();
    }, [fetchCustomization, fetchProfile]);

    const handleSave = async () => {
        try {
            setLoading(true);
            await api.put('/customization', { ...customization, socialLinks: serializeSocialLinks(customization.socialLinks) });
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
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 font-heading">{t("customization.pageTitle")}</h1>
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
                                                    <SelectItem value="SAGE">{t("customization.theming.sage")}</SelectItem>
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

                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-4 border-b border-slate-100">
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">{t("customization.pages.privacyNotice.title")}</CardTitle>
                                        <CardDescription className="text-[10px]">{t("customization.pages.privacyNotice.desc")}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        <Textarea
                                            placeholder={t("customization.pages.privacyNotice.placeholder")}
                                            value={customization.privacyNoticeText}
                                            onChange={(e) => setCustomization({...customization, privacyNoticeText: e.target.value})}
                                            className="min-h-[150px] text-sm"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-2">{t("customization.pages.privacyNotice.hint")}</p>
                                    </CardContent>
                                </Card>

                                <Card className="rounded-sm border-slate-200 shadow-sm bg-white">
                                    <CardHeader className="p-4 border-b border-slate-100">
                                        <CardTitle className="text-sm font-black uppercase tracking-tight">{t("customization.pages.social.title")}</CardTitle>
                                        <CardDescription className="text-[10px]">{t("customization.pages.social.desc")}</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1.5"><Camera className="w-3 h-3" /> Instagram</Label>
                                            <Input
                                                type="url"
                                                placeholder="https://instagram.com/your-restaurant"
                                                value={customization.socialLinks.instagram}
                                                onChange={(e) => setCustomization({...customization, socialLinks: {...customization.socialLinks, instagram: e.target.value}})}
                                                className="h-10 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1.5"><Share2 className="w-3 h-3" /> Facebook</Label>
                                            <Input
                                                type="url"
                                                placeholder="https://facebook.com/your-restaurant"
                                                value={customization.socialLinks.facebook}
                                                onChange={(e) => setCustomization({...customization, socialLinks: {...customization.socialLinks, facebook: e.target.value}})}
                                                className="h-10 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1.5"><Globe className="w-3 h-3" /> {t("customization.pages.social.website")}</Label>
                                            <Input
                                                type="url"
                                                placeholder="https://your-restaurant.com"
                                                value={customization.socialLinks.website}
                                                onChange={(e) => setCustomization({...customization, socialLinks: {...customization.socialLinks, website: e.target.value}})}
                                                className="h-10 text-sm"
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-500">{t("customization.pages.social.hint")}</p>
                                    </CardContent>
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
                        <Card className="rounded-sm border-slate-200 shadow-sm bg-slate-50 sticky top-6 overflow-hidden">
                            <CardHeader className="p-6 border-b border-slate-200 flex flex-row items-center justify-between gap-2 space-y-0">
                                <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                                    <Smartphone className="w-4 h-4" /> {t("customization.preview.title")}
                                </CardTitle>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={reloadPreview}
                                        title={t("customization.preview.refresh")}
                                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                    {slug && (
                                        <a
                                            href={`/r/${slug}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title={t("customization.preview.openNewTab")}
                                            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="text-xs text-slate-500 px-6 py-4 leading-relaxed border-b border-slate-200 bg-white">
                                    {t("customization.preview.desc")}
                                </div>
                                {slug ? (
                                    <div ref={previewContainerRef} className="relative w-full bg-white" style={{ height: PREVIEW_VISIBLE_HEIGHT, overflow: 'hidden' }}>
                                        <iframe
                                            key={previewKey}
                                            ref={previewFrameRef}
                                            src={`/r/${slug}?preview=1`}
                                            onLoad={handlePreviewLoad}
                                            title={t("customization.preview.title")}
                                            style={{
                                                width: PREVIEW_DESIGN_WIDTH,
                                                height: PREVIEW_DESIGN_HEIGHT,
                                                border: 0,
                                                transform: `scale(${previewScale})`,
                                                transformOrigin: 'top left',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="p-6 text-xs text-slate-400 italic">{t("customization.preview.unavailable")}</div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </>
    );
}
