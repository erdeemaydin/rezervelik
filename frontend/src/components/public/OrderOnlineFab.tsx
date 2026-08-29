'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';

// Floating "Order Online" call-to-action shown on every public tenant page
// (main / menu-only / booking-only) when the SysAdmin-toggled commercial add-on
// `Restaurant.hasOnlineOrdering` is on. Deliberately layout-agnostic: a single
// fixed pill with its own neutral styling so it reads consistently across all
// eight `layoutStyle` designs, linking to the dedicated `/r/[slug]/order` flow.
export default function OrderOnlineFab({ slug, restaurant }: { slug: string; restaurant: any }) {
  const { t } = useTranslation();

  if (!restaurant?.hasOnlineOrdering) return null;

  return (
    <Link
      href={`/r/${slug}/order`}
      className="fixed bottom-5 right-5 z-[60] inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white shadow-xl ring-1 ring-black/10 transition-transform hover:scale-105 hover:bg-neutral-800 sm:bottom-6 sm:right-6"
    >
      <ShoppingBag className="h-4 w-4" />
      {t('public.orderOnline')}
    </Link>
  );
}
