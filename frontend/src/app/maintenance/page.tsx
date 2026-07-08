'use client';

import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';

// Shown when the platform is in maintenance mode. The API returns 503 with code
// `errors.maintenance`; the axios interceptor (lib/api.ts) redirects tenant/public
// users here. This page makes no API calls, so it can't 503-loop — "Try again"
// just reloads the app, which returns to normal once maintenance is turned off.
export default function MaintenancePage() {
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-rose-800 text-white shadow-lg">
          <Wrench className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-stone-900">{t('maintenance.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">{t('maintenance.message')}</p>
        <Button
          onClick={() => { setRetrying(true); window.location.href = '/'; }}
          disabled={retrying}
          className="mt-6 h-11 bg-stone-900 px-8 font-bold hover:bg-stone-800"
        >
          {t('maintenance.retry')}
        </Button>
      </div>
    </div>
  );
}
