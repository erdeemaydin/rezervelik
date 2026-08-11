'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, Clock, Users, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function WaitlistOfferPage() {
  const { slug, token } = useParams();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const dateLocale = locale === 'en' ? 'en-US' : 'tr-TR';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<any>(null);
  const [status, setStatus] = useState<'pending' | 'accepted' | 'declined'>('pending');

  useEffect(() => {
    const fetchOffer = async () => {
      try {
        const res = await api.get(`/public/offer/${token}`);
        setOffer(res.data.data);
      } catch (err: any) {
        setError(err.response?.data?.message || t('waitlistOffer.notFoundOrExpired'));
      } finally {
        setLoading(false);
      }
    };
    fetchOffer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAction = async (action: 'accept' | 'decline') => {
    try {
      setLoading(true);
      await api.post(`/public/offer/${token}/${action}`);
      setStatus(action === 'accept' ? 'accepted' : 'declined');
    } catch (err: any) {
      setError(err.response?.data?.message || t(action === 'accept' ? 'waitlistOffer.acceptFailed' : 'waitlistOffer.declineFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-4">
          <div className="flex justify-end -mt-2 -mr-2"><LanguageSwitcher /></div>
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-xl font-bold text-zinc-900">{t('waitlistOffer.notFoundTitle')}</h1>
          <p className="text-zinc-500">{error}</p>
          <Button onClick={() => router.push(`/r/${slug}`)} className="mt-4 w-full" variant="outline">
            {t('waitlistOffer.returnToRestaurant')}
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">
          <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto" />
          <h1 className="text-2xl font-serif font-medium text-zinc-900">{t('waitlistOffer.confirmedTitle')}</h1>
          <p className="text-zinc-500 font-light">{t('waitlistOffer.confirmedDesc')}</p>
          <Button onClick={() => router.push(`/r/${slug}`)} className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-12">
            {t('waitlistOffer.backToRestaurant')}
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'declined') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">
          <XCircle className="w-20 h-20 text-zinc-300 mx-auto" />
          <h1 className="text-2xl font-serif font-medium text-zinc-900">{t('waitlistOffer.declinedTitle')}</h1>
          <p className="text-zinc-500 font-light">{t('waitlistOffer.declinedDesc')}</p>
          <Button onClick={() => router.push(`/r/${slug}`)} className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl h-12">
            {t('waitlistOffer.backToRestaurant')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 font-sans">
      <div className="bg-white rounded-[2rem] shadow-xl max-w-md w-full overflow-hidden">
        <div className="bg-zinc-900 p-8 text-center text-white space-y-2 relative">
          <div className="absolute top-3 right-3"><LanguageSwitcher /></div>
          <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400">{t('waitlistOffer.badge')}</h2>
          <h1 className="text-2xl font-serif font-medium">{offer.restaurant.name}</h1>
        </div>

        <div className="p-8 space-y-8">
          <p className="text-zinc-600 text-center text-sm leading-relaxed">
            {t('waitlistOffer.greetingBefore')}<strong>{offer.customerName}</strong>{t('waitlistOffer.greetingAfter')}
          </p>

          <div className="bg-zinc-50 rounded-2xl p-6 space-y-4 border border-zinc-100">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-zinc-600" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{t('waitlistOffer.dateLabel')}</div>
                <div className="font-medium text-zinc-800">{offer.targetDate}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-zinc-600" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{t('waitlistOffer.timeLabel')}</div>
                <div className="font-medium text-zinc-800">{offer.offeredTime || t('waitlistOffer.dinnerService')}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-zinc-600" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{t('waitlistOffer.partySizeLabel')}</div>
                <div className="font-medium text-zinc-800">{offer.partySize} {t('waitlistOffer.guestsSuffix')}</div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{t('waitlistOffer.expiresLabel')}</div>
                <div className="font-medium text-zinc-800">{new Date(offer.offerExpiresAt).toLocaleTimeString(dateLocale, {hour12: false, hour: '2-digit', minute:'2-digit'})}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button onClick={() => handleAction('decline')} variant="outline" className="h-12 rounded-xl text-zinc-600 border-zinc-200 hover:bg-zinc-50">
              {t('waitlistOffer.decline')}
            </Button>
            <Button onClick={() => handleAction('accept')} className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md shadow-emerald-600/20">
              {t('waitlistOffer.accept')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
