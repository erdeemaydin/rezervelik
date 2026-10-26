'use client';

import { useState, useEffect, use } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Hourglass, Users, ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/i18n/provider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function PublicWaitlistPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params);
    const { t } = useTranslation();
    const [restaurant, setRestaurant] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [quotedTime, setQuotedTime] = useState<number | null>(null);

    const [form, setForm] = useState({
        customerName: '',
        customerPhone: '',
        partySize: '2'
    });

    useEffect(() => {
        const fetchRestaurant = async () => {
            try {
                const res = await api.get(`/public/restaurant/${slug}`);
                if (res.data.data) {
                    const r = res.data.data;
                    setRestaurant(r);
                    
                    if (r.waitTimeConfig?.isWaitTimeEnabled) {
                        if (r.waitTimeConfig.isWaitTimeCalculated) {
                            setQuotedTime(r.waitTimeConfig.peopleWaiting * r.waitTimeConfig.waitTimePerPersonUpper);
                        } else if (r.waitTimeConfig.manualWaitTimeUpper) {
                            setQuotedTime(r.waitTimeConfig.manualWaitTimeUpper);
                        }
                    }
                }
            } catch {
                toast.error(t('publicWaitlist.restaurantNotFound'));
            } finally {
                setLoading(false);
            }
        };
        fetchRestaurant();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            await api.post(`/public/restaurant/${slug}/waitlist`, form);
            setSuccess(true);
        } catch (error: any) {
            toast.error(error.response?.data?.message || t('publicWaitlist.joinFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
            </div>
        );
    }

    if (!restaurant) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-bold">
                {t('publicWaitlist.restaurantNotFound')}
            </div>
        );
    }

    const config = restaurant.waitTimeConfig;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 pt-12 sm:p-8">
            <div className="max-w-md w-full space-y-6">
                <div className="flex justify-end"><LanguageSwitcher /></div>
                <div className="text-center space-y-2">
                    {restaurant.logoUrl ? (
                        <img src={restaurant.logoUrl} alt={restaurant.name} className="h-16 w-16 mx-auto rounded-full object-cover shadow-sm mb-4" />
                    ) : (
                        <div className="h-16 w-16 mx-auto rounded-full bg-slate-900 text-white flex items-center justify-center text-2xl font-black mb-4">
                            {restaurant.name.charAt(0)}
                        </div>
                    )}
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">{restaurant.name}</h1>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('publicWaitlist.pageTag')}</p>
                </div>

                {success ? (
                    <Card className="border-0 shadow-xl overflow-hidden bg-white mt-8">
                        <CardContent className="p-8 text-center space-y-4 flex flex-col items-center">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle2 className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900">{t('publicWaitlist.successTitle')}</h2>
                            <p className="text-slate-600 text-sm leading-relaxed max-w-[250px] mx-auto">
                                {t('publicWaitlist.successDesc')}
                            </p>

                            {config?.isWaitTimeEnabled && (
                                <div className="bg-slate-50 p-4 rounded-xl w-full border border-slate-100 mt-4 space-y-2">
                                    <div className="text-[10px] font-black uppercase text-slate-400">{t('publicWaitlist.estimatedWaitLabel')}</div>
                                    <div className="text-xl font-black text-slate-800 flex items-center justify-center gap-2">
                                        <Clock className="w-5 h-5 text-amber-500" />
                                        {quotedTime ? `~${quotedTime} ${t('publicWaitlist.minsSuffix')}` : t('publicWaitlist.waitingForEstimate')}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : !config?.isWaitlistOpen ? (
                    <Card className="border-0 shadow-lg mt-8 text-center p-8">
                        <Hourglass className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-lg font-bold text-slate-800">{t('publicWaitlist.closedTitle')}</h2>
                        <p className="text-sm text-slate-500 mt-2">{t('publicWaitlist.closedDesc')}</p>
                    </Card>
                ) : (
                    <Card className="border-0 shadow-xl overflow-hidden bg-white mt-8">
                        <CardHeader className="bg-slate-900 text-white p-6 text-center">
                            <CardTitle className="text-xl font-bold">{t('publicWaitlist.joinTitle')}</CardTitle>
                            <CardDescription className="text-slate-300 mt-1">
                                {t('publicWaitlist.joinSubtitle')}
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleSubmit} className="p-6 space-y-5">

                            {config?.isWaitTimeEnabled && quotedTime && (
                                <div className="bg-amber-50 text-amber-800 p-3 rounded-md border border-amber-100 flex items-center justify-center gap-2 mb-2">
                                    <Clock className="w-4 h-4" />
                                    <span className="text-sm font-bold">{t('publicWaitlist.currentWaitPrefix')} {quotedTime} {t('publicWaitlist.minsSuffix')}</span>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label className="text-xs font-black uppercase text-slate-500">{t('publicWaitlist.nameLabel')}</Label>
                                <Input required value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} className="h-12 bg-slate-50 border-slate-200 text-base" placeholder={t('publicWaitlist.namePlaceholder')} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-black uppercase text-slate-500">{t('publicWaitlist.phoneLabel')}</Label>
                                <Input required type="tel" value={form.customerPhone} onChange={e => setForm({...form, customerPhone: e.target.value})} className="h-12 bg-slate-50 border-slate-200 text-base" placeholder={t('publicWaitlist.phonePlaceholder')} />
                                <p className="text-[10px] text-slate-400 font-medium">{t('publicWaitlist.phoneHint')}</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-black uppercase text-slate-500">{t('publicWaitlist.partySizeLabel')}</Label>
                                <div className="flex items-center">
                                    <div className="h-12 w-12 bg-slate-100 flex items-center justify-center border border-r-0 border-slate-200 rounded-l-md">
                                        <Users className="w-5 h-5 text-slate-500" />
                                    </div>
                                    <Input required type="number" min="1" max="20" value={form.partySize} onChange={e => setForm({...form, partySize: e.target.value})} className="h-12 bg-slate-50 border-slate-200 text-base rounded-l-none text-center font-bold" />
                                </div>
                            </div>

                            <Button type="submit" disabled={submitting} className="w-full h-12 text-base font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white mt-4">
                                {submitting ? t('publicWaitlist.joiningButton') : t('publicWaitlist.joinButton')} <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                        </form>
                    </Card>
                )}
            </div>
        </div>
    );
}
