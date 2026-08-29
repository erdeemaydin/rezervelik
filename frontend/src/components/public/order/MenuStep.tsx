'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Leaf, AlertTriangle, Plus, Star, Clock3 } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';
import type { OrderableMenuCategory, OrderableMenuItem, CartEntry } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import ItemCustomizeDialog from './ItemCustomizeDialog';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/currency';

/** Compact header (56px) + the sticky category rail (48px) + a little air.
 *  Anything above this line on screen is considered "behind the chrome", which
 *  is both what the scroll-spy measures against and what an anchor jump has to
 *  clear. */
const STICKY_OFFSET_PX = 116;

/** Two category kinds share one id space (an order-only `OrderMenuCategory`
 *  and a mirrored `MenuCategory` can genuinely collide), so every key and DOM
 *  id has to carry the kind as well as the id — A3's note. */
const categoryKey = (cat: OrderableMenuCategory) => `${cat.isOrderOnlyCategory}:${cat.id}`;
const sectionDomId = (cat: OrderableMenuCategory) => `order-cat-${cat.isOrderOnlyCategory ? 'o' : 'm'}-${cat.id}`;

export default function MenuStep({
  categories,
  theme,
  currency,
  canOrder,
  onAddToCart,
}: {
  categories: OrderableMenuCategory[];
  theme: OrderTheme;
  currency: string;
  /** False while the tenant is outside its order hours: the menu stays fully
   *  browsable (people still want to see the food), but nothing can be added
   *  to a cart that couldn't be submitted anyway. */
  canOrder: boolean;
  onAddToCart: (entry: CartEntry) => void;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const [activeItem, setActiveItem] = useState<OrderableMenuItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // "Back around 19:30" is only worth saying while that time is still ahead of
  // us. Reading the clock during render is impure (and the linter rightly
  // rejects it), so the reference time is captured once after mount instead —
  // until it is, a paused item just reads as temporarily unavailable.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const keys = useMemo(() => categories.map(categoryKey), [categories]);
  const [activeKey, setActiveKey] = useState<string | null>(keys[0] ?? null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // --- scroll spy ---------------------------------------------------------
  // Deliberately a plain scroll read rather than an IntersectionObserver: the
  // rule we want ("the section whose header has most recently passed under the
  // chrome") is a single comparison, whereas expressing it as observer root
  // margins means guessing at viewport fractions and still breaking on a short
  // last section.
  useEffect(() => {
    if (categories.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current: string | null = keys[0] ?? null;
      for (const cat of categories) {
        const el = document.getElementById(sectionDomId(cat));
        if (!el) continue;
        if (el.getBoundingClientRect().top - STICKY_OFFSET_PX <= 1) current = categoryKey(cat);
      }
      // Bottom of the page: a final short section can never reach the line, so
      // hand it the highlight once we've run out of scroll.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 24) {
        current = keys[keys.length - 1] ?? current;
      }
      setActiveKey((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [categories, keys]);

  // Keep the active chip in view without ever scrolling the page itself —
  // scrollIntoView on a chip inside a sticky rail can drag the document with
  // it, which would fight the scroll-spy that just ran.
  useEffect(() => {
    if (!activeKey) return;
    const chip = chipRefs.current[activeKey];
    const rail = railRef.current;
    if (!chip || !rail) return;
    const target = chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [activeKey]);

  const jumpTo = useCallback((cat: OrderableMenuCategory) => {
    const el = document.getElementById(sectionDomId(cat));
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET_PX + 8, behavior: 'smooth' });
    setActiveKey(categoryKey(cat));
  }, []);

  const openItem = (item: OrderableMenuItem) => {
    if (!item.available || !canOrder) return;
    setActiveItem(item);
    setDialogOpen(true);
  };

  const unavailableLabel = (item: OrderableMenuItem): string => {
    if (item.unavailableReason !== 'PAUSED') return t('publicOrder.item.outOfStock');
    if (item.resumesAt && nowMs != null) {
      const resumes = new Date(item.resumesAt);
      if (resumes.getTime() > nowMs) {
        return t('publicOrder.item.backAround').replace(
          '{{time}}',
          resumes.toLocaleTimeString(locale === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
        );
      }
    }
    return t('publicOrder.item.temporarilyUnavailable');
  };

  if (categories.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm" style={{ color: theme.muted }}>
        {t('publicOrder.menu.empty')}
      </div>
    );
  }

  return (
    <div>
      <div
        className="sticky top-14 z-20 border-b"
        style={{ backgroundColor: theme.bg, borderColor: theme.border }}
      >
        <div
          ref={railRef}
          className="mx-auto flex max-w-lg gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={t('publicOrder.menu.categoriesLabel')}
        >
          {categories.map((cat) => {
            const key = categoryKey(cat);
            const isActive = key === activeKey;
            return (
              <button
                key={key}
                ref={(el) => {
                  chipRefs.current[key] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => jumpTo(cat)}
                className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors"
                style={{
                  backgroundColor: isActive ? theme.primary : theme.surface,
                  color: isActive ? theme.primaryContrast : theme.muted,
                  boxShadow: isActive ? 'none' : `inset 0 0 0 1px ${theme.border}`,
                }}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 pb-6">
        {categories.map((cat) => (
          <section key={categoryKey(cat)} id={sectionDomId(cat)} className="scroll-mt-32 pt-6">
            <h2 className="mb-3 text-base font-black tracking-tight" style={{ color: theme.text }}>
              {cat.name}
            </h2>
            <div className="space-y-2.5">
              {cat.items.map((item) => {
                const addable = item.available && canOrder;
                return (
                  <article
                    key={item.menuItemId}
                    className={cn('relative overflow-hidden rounded-2xl transition-opacity', !item.available && 'opacity-60')}
                    style={{ backgroundColor: theme.surface, boxShadow: theme.shadow }}
                  >
                    <button
                      type="button"
                      disabled={!addable}
                      onClick={() => openItem(item)}
                      aria-label={item.name}
                      className={cn('flex w-full items-stretch gap-3 p-3 text-left', !addable && 'cursor-default')}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        {item.isHighlight && item.available && (
                          <span
                            className="mb-1 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                            style={{ backgroundColor: theme.primaryTint, color: theme.primary }}
                          >
                            <Star className="h-3 w-3 fill-current" />
                            {t('publicOrder.item.popular')}
                          </span>
                        )}
                        <p className="text-sm font-bold leading-snug" style={{ color: theme.text }}>
                          {item.name}
                        </p>
                        {item.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-snug" style={{ color: theme.muted }}>
                            {item.description}
                          </p>
                        )}
                        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                          <span className="text-sm font-black" style={{ color: theme.text }}>
                            {formatPrice(item.price)}
                          </span>
                          {item.spiceLevel > 0 && <Flame className="h-3.5 w-3.5 text-red-500" aria-hidden />}
                          {item.dietaryTags && <Leaf className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
                          {item.allergens && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
                        </div>
                        {!item.available && (
                          <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                            <Clock3 className="h-3 w-3" />
                            {unavailableLabel(item)}
                          </span>
                        )}
                      </div>

                      <div className="relative shrink-0">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            aria-hidden
                            loading="lazy"
                            className={cn('h-24 w-24 rounded-xl object-cover', !item.available && 'grayscale')}
                          />
                        ) : (
                          <div className="h-24 w-24 rounded-xl" style={{ backgroundColor: theme.primaryTint }} />
                        )}
                        {addable && (
                          <span
                            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full"
                            style={{
                              backgroundColor: theme.surface,
                              color: theme.primary,
                              boxShadow: theme.shadow,
                            }}
                          >
                            <Plus className="h-4 w-4" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <ItemCustomizeDialog
        item={activeItem}
        theme={theme}
        currency={currency}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={onAddToCart}
      />
    </div>
  );
}
