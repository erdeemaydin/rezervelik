'use client';

import { useState } from 'react';
import { Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';
import { clearAuth } from '@/lib/authStorage';
import api from '@/lib/api';

// Shown when the platform is in maintenance mode. The API returns 503 with code
// `errors.maintenance`; the axios interceptor (lib/api.ts) redirects tenant/public
// users here. The retry button makes no API call, so it can't 503-loop — it
// just reloads the app, which returns to normal once maintenance is turned
// off. The admin-sign-in escape hatch below does call /auth/logout, but that
// route (like the rest of /api/auth) is deliberately exempted from the
// maintenance gate in app.ts so an admin can still sign in to turn it back off.
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

        {/* Escape hatch: a tenant admin who lands here can get stuck because the
            dashboard (with its logout button) is 503'd. Clearing the session and
            going to /auth/login — which stays reachable during maintenance — lets
            the platform (root) admin sign in and toggle maintenance back off. */}
        <div className="mt-8 border-t border-stone-200 pt-6">
          <button
            type="button"
            onClick={async () => {
              // The session cookie is httpOnly — clearAuth() alone (which only
              // ever touched localStorage/JS-readable state) can't clear it;
              // it'd otherwise still be a valid, unrevoked session server-side.
              try { await api.post('/auth/logout'); } catch { /* still proceed to clear local state */ }
              clearAuth();
              window.location.href = '/auth/login';
            }}
            className="text-sm font-bold text-stone-700 underline underline-offset-4 hover:text-stone-900"
          >
            {t('maintenance.adminSignIn')}
          </button>
          <p className="mt-2 text-xs text-stone-400">{t('maintenance.adminSignInHint')}</p>
        </div>
      </div>
    </div>
  );
}
