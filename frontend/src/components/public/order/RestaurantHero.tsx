'use client';

// The "restaurant page" header every delivery app opens with: cover art, the
// tenant's mark, and the three facts a customer decides on — how long, how far,
// how much before we'll take the order.
//
// There is no dedicated cover-image field on FrontendCustomization (the eight
// public layouts use `Restaurant.logoUrl` as their hero image too, see
// ClassicLayout), so that's what we use here — and when the tenant hasn't
// uploaded anything we fall back to a gradient derived from their brand colour
// rather than a stock photo of someone else's food.

import type { ReactNode } from 'react';
import { Clock, MapPin, Navigation, ShoppingBag } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';
import type { OrderTheme } from '@/lib/orderTheme';
import { formatMoney } from '@/lib/currency';

/** Delivery apps quote a window, not a point estimate — the tenant's
 *  configured prep time is the optimistic end of it. */
const PREP_WINDOW_PADDING_MIN = 15;

export default function RestaurantHero({
  restaurant,
  theme,
  currency,
  prepTimeMinutes,
  distanceMeters,
  minOrderAmount,
  actions,
}: {
  restaurant: { name: string; logoUrl?: string | null; addressText?: string | null };
  theme: OrderTheme;
  currency: string;
  prepTimeMinutes: number | null;
  distanceMeters: number | null;
  minOrderAmount: number | null;
  actions?: ReactNode;
}) {
  const { t, locale } = useTranslation();
  const cover = restaurant.logoUrl || null;

  const stats: { icon: ReactNode; label: string }[] = [];
  if (prepTimeMinutes != null) {
    stats.push({
      icon: <Clock className="h-3.5 w-3.5" />,
      label: t('publicOrder.hero.prepWindow')
        .replace('{{min}}', String(prepTimeMinutes))
        .replace('{{max}}', String(prepTimeMinutes + PREP_WINDOW_PADDING_MIN)),
    });
  }
  if (distanceMeters != null) {
    stats.push({
      icon: <Navigation className="h-3.5 w-3.5" />,
      label: t('publicOrder.hero.distance').replace('{{km}}', (distanceMeters / 1000).toFixed(1)),
    });
  }
  if (minOrderAmount != null && minOrderAmount > 0) {
    stats.push({
      icon: <ShoppingBag className="h-3.5 w-3.5" />,
      label: t('publicOrder.hero.minOrder').replace('{{amount}}', formatMoney(minOrderAmount, currency, locale)),
    });
  }

  return (
    <section>
      <div className="relative h-40 w-full overflow-hidden sm:h-52">
        {cover ? (
          <img src={cover} alt="" aria-hidden className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full" style={{ background: theme.heroGradient }} />
        )}
        {/* Scrim: keeps the overlay buttons legible whatever the cover art is. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/35" />
        {actions && <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">{actions}</div>}
      </div>

      <div className="relative -mt-9 px-4">
        <div
          className="mx-auto flex max-w-lg gap-3 rounded-2xl p-4"
          style={{ backgroundColor: theme.surface, boxShadow: theme.shadow }}
        >
          <div
            className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl"
            style={{ backgroundColor: theme.primary, boxShadow: `0 0 0 2px ${theme.surface}` }}
          >
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-black text-white">
                {restaurant.name?.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black leading-tight" style={{ color: theme.text }}>
              {restaurant.name}
            </h1>
            {restaurant.addressText && (
              <p className="mt-0.5 flex items-start gap-1 text-xs leading-snug" style={{ color: theme.muted }}>
                <MapPin className="mt-px h-3 w-3 shrink-0" />
                <span className="line-clamp-1">{restaurant.addressText}</span>
              </p>
            )}
            {stats.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {stats.map((stat) => (
                  <span
                    key={stat.label}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                    style={{ backgroundColor: theme.primaryTint, color: theme.primary }}
                  >
                    {stat.icon}
                    {stat.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
