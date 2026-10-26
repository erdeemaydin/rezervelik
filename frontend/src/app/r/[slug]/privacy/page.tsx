'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/i18n/provider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

// KVKK "aydınlatma metni" (privacy/disclosure notice) — linked from the
// consent checkbox on every layout's public booking form (see ConsentFields).
// Generic, structurally-correct bilingual content by default (what data is
// collected, why, how long it's kept, who it's shared with) — docs/planning/PRODUCTION_ROADMAP.md
// §7 is explicit this is "direction, not legal advice", so nothing here invents
// Turkish legal specifics. A tenant can override it with their own text via
// dashboard/customization (FrontendCustomization.privacyNoticeText), same
// tenant-editable-legal-text mechanism as legalText/aboutUsText.
export default function PrivacyNoticePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t } = useTranslation();
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRestaurant = async () => {
      try {
        const res = await api.get(`/public/restaurant/${slug}`);
        setRestaurant(res.data?.data || null);
      } catch {
        setRestaurant(null);
      } finally {
        setLoading(false);
      }
    };
    fetchRestaurant();
  }, [slug]);

  const tenantNotice: string | undefined = restaurant?.customization?.privacyNoticeText;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-neutral-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-10 px-4 sm:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link href={`/r/${slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-neutral-500 hover:text-neutral-900">
            <ArrowLeft className="h-4 w-4" /> {t('public.privacyNotice.backLink')}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="bg-white rounded-3xl border border-black/5 p-8 sm:p-10 space-y-8">
          <div>
            {restaurant?.name && (
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">{restaurant.name}</p>
            )}
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-900">{t('public.privacyNotice.title')}</h1>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600">{t('public.privacyNotice.intro')}</p>
          </div>

          {tenantNotice ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-3">{t('public.privacyNotice.tenantOverrideNote')}</p>
              <div
                className="text-sm leading-relaxed text-neutral-700 space-y-3 [&>p]:mb-3 [&>a]:underline [&>a]:text-neutral-900"
                dangerouslySetInnerHTML={{ __html: tenantNotice }}
              />
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900 mb-2">{t('public.privacyNotice.controllerTitle')}</h2>
                <p className="text-sm leading-relaxed text-neutral-600">{t('public.privacyNotice.controllerBody')}</p>
              </section>
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900 mb-2">{t('public.privacyNotice.whatTitle')}</h2>
                <p className="text-sm leading-relaxed text-neutral-600">{t('public.privacyNotice.whatBody')}</p>
              </section>
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900 mb-2">{t('public.privacyNotice.whyTitle')}</h2>
                <p className="text-sm leading-relaxed text-neutral-600">{t('public.privacyNotice.whyBody')}</p>
              </section>
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900 mb-2">{t('public.privacyNotice.howLongTitle')}</h2>
                <p className="text-sm leading-relaxed text-neutral-600">{t('public.privacyNotice.howLongBody')}</p>
              </section>
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900 mb-2">{t('public.privacyNotice.whoWithTitle')}</h2>
                <p className="text-sm leading-relaxed text-neutral-600">{t('public.privacyNotice.whoWithBody')}</p>
              </section>
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-900 mb-2">{t('public.privacyNotice.rightsTitle')}</h2>
                <p className="text-sm leading-relaxed text-neutral-600">{t('public.privacyNotice.rightsBody')}</p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
