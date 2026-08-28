'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';
import { useAuthStore } from '@/store/useAuthStore';

// Full-screen standalone route for KITCHEN staff — deliberately outside
// AdminLayout/dashboard chrome (docs/packaging/online-ordering-plan.md §1e,
// "Kitchen role"). This is only a placeholder: the real order-station board
// (SSE ticket feed, accept/ready/complete actions, printing) is a separate,
// later piece of work. This page exists so the KITCHEN login redirect and
// AdminLayout's route-guard bounce have somewhere to land instead of 404ing,
// gated on the normal staff auth cookie the same way every other
// authenticated route is.
export default function OrderStationPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, logout, isAuthenticated } = useAuthStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isMounted, isAuthenticated, router]);

  if (!isMounted || !isAuthenticated) return null;

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow-lg">
          <UtensilsCrossed className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-white">{t('orderStation.comingSoonTitle')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{t('orderStation.comingSoonMessage')}</p>
        {user && (
          <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-500">
            {user.firstName} {user.lastName}
          </p>
        )}
        <Button
          onClick={handleLogout}
          className="mt-6 h-11 bg-white px-8 font-bold text-slate-900 hover:bg-slate-200"
        >
          {t('orderStation.logout')}
        </Button>
      </div>
    </div>
  );
}
