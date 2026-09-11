'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Star, CircleNotch, MapPin, ArrowSquareOut, ArrowClockwise, WarningCircle, Key } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/provider';

interface GoogleReview {
  author: string;
  authorUrl: string | null;
  photo: string | null;
  rating: number;
  text: string;
  relativeTime: string;
  time: number | null;
}

interface ReviewsData {
  configured: boolean;
  mapsUrl?: string | null;
  placeId?: string;
  apiKeyMissing?: boolean;
  error?: string;
  errorDetail?: string | null;
  name?: string | null;
  googleUrl?: string | null;
  rating?: number | null;
  total?: number;
  reviews?: GoogleReview[];
}

const Stars = ({ rating, className = 'w-3.5 h-3.5' }: { rating: number; className?: string }) => (
  <span className="flex items-center gap-0.5">
    {Array.from({ length: 5 }).map((_, i) => (
      <Star key={i} weight={i < Math.round(rating) ? 'fill' : 'regular'} className={`${className} ${i < Math.round(rating) ? 'text-amber-400' : 'text-slate-200'}`} />
    ))}
  </span>
);

export default function ReviewsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<ReviewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/reviews');
      setData(res.data.data);
      setLinkInput(res.data.data?.mapsUrl || '');
      // Open the editor automatically when nothing is connected yet.
      setEditing(!res.data.data?.configured);
    } catch {
      toast.error(t('reviews.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const saveLink = async () => {
    try {
      setSaving(true);
      const res = await api.put('/reviews/config', { googleMapsUrl: linkInput.trim() });
      // Warn if we stored the link but couldn't resolve a Google place from it.
      if (linkInput.trim() && !res.data.data?.resolved) {
        toast.error(t('reviews.invalidLink'));
      } else {
        toast.success(t('reviews.saved'));
      }
      setEditing(false);
      await fetchReviews();
    } catch {
      toast.error(t('reviews.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const Header = () => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t('reviews.title')}</h1>
        <p className="text-xs text-slate-500 font-medium">{t('reviews.subtitle')}</p>
      </div>
      <div className="flex items-center gap-2">
        {data?.configured && !editing && (
          <>
            <Button variant="outline" size="sm" className="h-9 text-xs font-bold" onClick={fetchReviews}>
              <ArrowClockwise className="w-3.5 h-3.5 mr-1.5" /> {t('reviews.refresh')}
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-xs font-bold" onClick={() => setEditing(true)}>
              <MapPin className="w-3.5 h-3.5 mr-1.5" /> {t('reviews.changeLink')}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  // Shared link editor / connect form.
  const LinkForm = () => (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-row items-center gap-3">
        <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600"><MapPin className="w-5 h-5" /></div>
        <div>
          <CardTitle className="text-base font-black text-slate-800">{t('reviews.connectTitle')}</CardTitle>
          <CardDescription className="text-xs">{t('reviews.connectDesc')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
        <label className="text-[11px] font-semibold text-slate-500">{t('reviews.mapsLinkLabel')}</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder={t('reviews.mapsLinkPlaceholder')}
            className="flex-1 text-sm"
          />
          <Button onClick={saveLink} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 h-10 shrink-0">
            {saving ? <><CircleNotch className="w-4 h-4 mr-2 animate-spin" /> {t('reviews.saving')}</> : t('reviews.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="flex flex-col gap-6 max-w-5xl">
        <Header />

        {loading ? (
          <div className="flex items-center justify-center h-[50vh]">
            <CircleNotch className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : editing || !data?.configured ? (
          <LinkForm />
        ) : data.apiKeyMissing ? (
          <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="p-2.5 bg-amber-100 rounded-lg text-amber-700 shrink-0"><Key className="w-5 h-5" /></div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">{t('reviews.apiKeyMissingTitle')}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{t('reviews.apiKeyMissingDesc')}</p>
              </div>
            </CardContent>
          </Card>
        ) : data.error ? (
          <Card className="border-rose-200 bg-rose-50/40 shadow-sm">
            <CardContent className="p-6 flex items-start gap-4">
              <div className="p-2.5 bg-rose-100 rounded-lg text-rose-700 shrink-0"><WarningCircle className="w-5 h-5" /></div>
              <div>
                <h3 className="font-black text-slate-800 text-sm">{t('reviews.googleErrorTitle')}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{data.errorDetail || data.error}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Summary */}
            <Card className="border-slate-100 shadow-sm bg-slate-900 text-white md:col-span-1 h-fit">
              <CardHeader className="p-4 pb-2">
                <CardDescription className="text-[10px] font-semibold text-slate-400">{t('reviews.averageRating')}</CardDescription>
                <CardTitle className="text-4xl font-black mt-2">{data.rating?.toFixed(1) ?? '—'}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="mb-3"><Stars rating={data.rating || 0} className="w-4 h-4" /></div>
                <p className="text-xs text-slate-400 font-medium">{t('reviews.basedOnCount').replace('{{count}}', String(data.total || 0))}</p>
                {data.googleUrl && (
                  <a href={data.googleUrl} target="_blank" rel="noopener noreferrer"
                     className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-400 hover:text-blue-300">
                    <ArrowSquareOut className="w-3.5 h-3.5" /> {t('reviews.openInGoogle')}
                  </a>
                )}
              </CardContent>
            </Card>

            {/* Review list */}
            <div className="md:col-span-3 space-y-4">
              <p className="text-[11px] font-bold text-slate-400">{t('reviews.fromGoogle')}</p>
              {(!data.reviews || data.reviews.length === 0) ? (
                <Card className="border-slate-100 shadow-sm"><CardContent className="p-8 text-center text-sm text-slate-500">{t('reviews.noReviews')}</CardContent></Card>
              ) : (
                data.reviews.map((review, idx) => (
                  <Card key={idx} className="border-slate-100 shadow-sm overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {review.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={review.photo} alt={review.author} className="w-9 h-9 rounded-full shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-black text-xs shrink-0">
                            {review.author?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-sm text-slate-800 truncate">{review.author}</h3>
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">{review.relativeTime}</span>
                          </div>
                          <div className="mt-1"><Stars rating={review.rating} /></div>
                          {review.text && <p className="text-sm text-slate-700 leading-relaxed mt-2">{review.text}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
              <p className="text-[11px] text-slate-400 font-medium pt-1">{t('reviews.replyComingSoon')}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
