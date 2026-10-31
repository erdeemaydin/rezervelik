'use client';

// The cart as its own screen, reachable any time from the bottom bar — the one
// place quantities are edited. Everything downstream (checkout, payment) shows
// a read-only summary priced by the backend, so this is deliberately the only
// mutable view of the order.

import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';
import type { CartEntry } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/currency';

const MAX_QUANTITY = 20;

export default function CartSheet({
  open,
  onOpenChange,
  theme,
  currency,
  cart,
  onUpdateQty,
  onRemove,
  onCheckout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: OrderTheme;
  currency: string;
  cart: CartEntry[];
  onUpdateQty: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  onCheckout: () => void;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);
  const subtotal = cart.reduce((s, l) => s + l.unitPriceEstimate * l.quantity, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn('max-h-[88vh] gap-0 overflow-hidden rounded-t-3xl p-0 sm:mx-auto sm:max-w-lg', theme.fontClass)}
        style={{ backgroundColor: theme.surface }}
      >
        <div className="flex max-h-[88vh] flex-col">
          <div className="shrink-0 px-5 pb-3 pt-5">
            <SheetTitle className="text-lg font-black" style={{ color: theme.text }}>
              {t('publicOrder.cart.title')}
            </SheetTitle>
            <p className="mt-0.5 text-xs" style={{ color: theme.muted }}>
              {t('publicOrder.cart.itemCount').replace('{{n}}', String(itemCount))}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: theme.muted }}>
                <ShoppingBag className="h-8 w-8" />
                <p className="text-sm">{t('publicOrder.cart.empty')}</p>
              </div>
            ) : (
              <ul className="space-y-3 pb-4">
                {cart.map((line) => (
                  <li key={line.key} className="flex items-start gap-3">
                    {line.imageUrl ? (
                      <img src={line.imageUrl} alt="" aria-hidden className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="h-14 w-14 shrink-0 rounded-xl" style={{ backgroundColor: theme.primaryTint }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-snug" style={{ color: theme.text }}>
                        {line.name}
                      </p>
                      {line.modifierSummary && (
                        <p className="mt-0.5 text-xs leading-snug" style={{ color: theme.muted }}>
                          {line.modifierSummary}
                        </p>
                      )}
                      {line.note && (
                        <p className="mt-0.5 text-xs italic leading-snug" style={{ color: theme.muted }}>
                          “{line.note}”
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div
                          className="flex items-center gap-1 rounded-full border px-1 py-0.5"
                          style={{ borderColor: theme.border }}
                        >
                          <button
                            type="button"
                            onClick={() => (line.quantity <= 1 ? onRemove(line.key) : onUpdateQty(line.key, line.quantity - 1))}
                            className="flex h-7 w-7 items-center justify-center rounded-full hover:opacity-70"
                            style={{ color: theme.text }}
                            aria-label={line.quantity <= 1 ? t('publicOrder.cart.remove') : t('publicOrder.item.decrease')}
                          >
                            {line.quantity <= 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                          </button>
                          <span className="w-5 text-center text-xs font-black" style={{ color: theme.text }}>
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQty(line.key, Math.min(MAX_QUANTITY, line.quantity + 1))}
                            disabled={line.quantity >= MAX_QUANTITY}
                            className="flex h-7 w-7 items-center justify-center rounded-full hover:opacity-70 disabled:opacity-30"
                            style={{ color: theme.text }}
                            aria-label={t('publicOrder.item.increase')}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-sm font-black" style={{ color: theme.text }}>
                          {formatPrice(line.unitPriceEstimate * line.quantity)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {cart.length > 0 && (
            <div className="shrink-0 border-t p-4" style={{ borderColor: theme.border }}>
              <div className="mb-1 flex items-center justify-between text-sm font-black" style={{ color: theme.text }}>
                <span>{t('publicOrder.quote.subtotal')}</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <p className="mb-3 text-[11px]" style={{ color: theme.muted }}>
                {t('publicOrder.cart.feesAtCheckout')}
              </p>
              <Button
                type="button"
                onClick={onCheckout}
                className="h-12 w-full text-sm font-bold text-white"
                style={{ backgroundColor: theme.primary }}
              >
                {t('publicOrder.cart.checkoutButton')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
