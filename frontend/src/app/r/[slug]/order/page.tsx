'use client';

import { useState, useEffect, use } from 'react';
import axios from 'axios';
import { useTranslation } from '@/i18n/provider';
import OrderExperience from '@/components/public/order/OrderExperience';

// Same restaurant-resolution precedent as r/[slug]/waitlist and r/[slug]/menu:
// a plain, unauthenticated GET (no X-Restaurant-ID needed for this one call —
// the backend resolves the tenant from the slug itself) against the public
// controller, before anything tenant-scoped can run. Everything under
// /api/public/order/* then needs X-Restaurant-ID explicitly, which is handled
// per-call in lib/orderApi.ts once `restaurant.id` is known.
const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

export default function PublicOrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t } = useTranslation();
  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRestaurant = async () => {
      try {
        const res = await axios.get(`${API_URL}/public/restaurant/${slug}`);
        setRestaurant(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchRestaurant();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-bold text-center px-6">
        {t('publicOrder.restaurantNotFound')}
      </div>
    );
  }

  // hasOnlineOrdering is the SysAdmin-toggled commercial add-on gate
  // (Restaurant.hasOnlineOrdering) — hidden entirely when off, same intent
  // as the backend's requireOnlineOrderingAddon({ notFoundWhenOff: true }).
  if (!restaurant.hasOnlineOrdering) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-center px-6 gap-2">
        <p className="text-lg font-bold text-slate-800">{restaurant.name}</p>
        <p className="text-sm text-slate-500 max-w-sm">{t('publicOrder.notAvailable')}</p>
      </div>
    );
  }

  return <OrderExperience restaurant={restaurant} />;
}
