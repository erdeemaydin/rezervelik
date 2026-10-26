'use client';

import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from '@/i18n/provider';

// KVKK consent block shared by every public layout's reservation form
// (ClassicLayout, PremiumLayout, OldenLayout, GardenLayout, NoirLoungeLayout,
// NordicMinimalLayout, TrattoriaRusticLayout, BoldEditorialLayout). See
// docs/planning/PRODUCTION_ROADMAP.md §7.3: the booking-data-processing consent is
// REQUIRED (an "açık rıza" checkbox, blocked client-side and re-checked
// server-side in reservationController.createReservation), while the
// WhatsApp/marketing consent is a SEPARATE, optional opt-in — the two must
// never be merged into a single checkbox.
//
// Each layout keeps `consentAccepted`/`marketingConsent` as two extra fields
// on its own local `resForm` state (spread wholesale into the POST body), so
// this component only needs the two values + their setters — no new form
// plumbing required per layout.
interface ConsentFieldsProps {
  slug: string;
  consentAccepted: boolean;
  onConsentAcceptedChange: (checked: boolean) => void;
  marketingConsent: boolean;
  onMarketingConsentChange: (checked: boolean) => void;
  className?: string;
}

export default function ConsentFields({
  slug,
  consentAccepted,
  onConsentAcceptedChange,
  marketingConsent,
  onMarketingConsentChange,
  className,
}: ConsentFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className={className ?? 'space-y-3 text-sm'}>
      <label className="flex items-start gap-3 cursor-pointer">
        <Checkbox
          required
          checked={consentAccepted}
          onCheckedChange={onConsentAcceptedChange}
          className="mt-0.5"
        />
        <span className="leading-snug">
          {t('public.consent.bookingPrefix')}{' '}
          <Link
            href={`/r/${slug}/privacy`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {t('public.consent.privacyNoticeLinkText')}
          </Link>
          {t('public.consent.bookingSuffix')}
        </span>
      </label>
      <label className="flex items-start gap-3 cursor-pointer opacity-80">
        <Checkbox
          checked={marketingConsent}
          onCheckedChange={onMarketingConsentChange}
          className="mt-0.5"
        />
        <span className="leading-snug">{t('public.consent.marketing')}</span>
      </label>
    </div>
  );
}
