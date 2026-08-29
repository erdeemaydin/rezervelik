'use client';

import { useState } from 'react';
import { Flame, Leaf, AlertTriangle, Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';
import type { OrderableMenuCategory, OrderableMenuItem, CartEntry } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import ItemCustomizeDialog from './ItemCustomizeDialog';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/currency';

export default function MenuStep({
  categories,
  theme,
  currency,
  cartCount,
  cartEstimatedTotal,
  onAddToCart,
  onOpenCart,
}: {
  categories: OrderableMenuCategory[];
  theme: OrderTheme;
  currency: string;
  cartCount: number;
  cartEstimatedTotal: number;
  onAddToCart: (entry: CartEntry) => void;
  onOpenCart: () => void;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const [activeItem, setActiveItem] = useState<OrderableMenuItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openItem = (item: OrderableMenuItem) => {
    setActiveItem(item);
    setDialogOpen(true);
  };

  if (categories.length === 0) {
    return (
      <div className="py-16 text-center text-sm" style={{ color: theme.muted }}>
        {t('publicOrder.menu.empty')}
      </div>
    );
  }

  return (
    <div className={cn('pb-24', cartCount > 0 && 'pb-28')}>
      {categories.map((cat) => (
        <div key={cat.id} className="mb-8">
          <h2 className="mb-3 text-base font-bold tracking-tight" style={{ color: theme.text }}>{cat.name}</h2>
          <div className="space-y-2.5">
            {cat.items.map((item) => (
              <button
                key={item.menuItemId}
                type="button"
                disabled={!item.available}
                onClick={() => openItem(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:opacity-90',
                  !item.available && 'cursor-not-allowed opacity-50 hover:opacity-50'
                )}
                style={{ borderColor: theme.border, backgroundColor: theme.surface }}
              >
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold" style={{ color: theme.text }}>
                      {item.isHighlight && '★ '}{item.name}
                    </p>
                  </div>
                  {item.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: theme.muted }}>{item.description}</p>
                  )}
                  {!item.available && (
                    <p className="mt-0.5 text-xs font-semibold text-amber-600">
                      {item.unavailableReason === 'PAUSED'
                        ? t('publicOrder.item.temporarilyUnavailable')
                        : t('publicOrder.item.outOfStock')}
                    </p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: theme.primary }}>{formatPrice(item.price)}</span>
                    {!!item.spiceLevel && item.spiceLevel > 0 && <Flame className="h-3.5 w-3.5 text-red-500" />}
                    {item.dietaryTags && <Leaf className="h-3.5 w-3.5 text-emerald-600" />}
                    {item.allergens && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                </div>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${theme.primary}14`, color: theme.primary }}
                >
                  <Plus className="h-4 w-4" />
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <ItemCustomizeDialog item={activeItem} theme={theme} currency={currency} open={dialogOpen} onOpenChange={setDialogOpen} onAdd={onAddToCart} />

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t p-3" style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
          <div className="mx-auto max-w-lg">
            <Button
              type="button"
              onClick={onOpenCart}
              className="flex h-12 w-full items-center justify-between px-4 text-sm font-bold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                {cartCount} {t('publicOrder.menu.itemsSuffix')}
              </span>
              <span>{t('publicOrder.menu.viewCart')} · {formatPrice(cartEstimatedTotal)}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
