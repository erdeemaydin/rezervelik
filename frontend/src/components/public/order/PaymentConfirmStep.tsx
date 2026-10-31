'use client';

import { Banknote, CreditCard, Loader2, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';
import type { OrderQuote, PaymentMethod, PublicOrderSettings, FulfillmentType } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { formatMoney } from '@/lib/currency';

export default function PaymentConfirmStep({
  theme,
  currency,
  settings,
  fulfillmentType,
  paymentMethod,
  setPaymentMethod,
  customerNote,
  setCustomerNote,
  quote,
  placing,
  placeError,
  onPlaceOrder,
}: {
  theme: OrderTheme;
  currency: string;
  settings: PublicOrderSettings;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod | null;
  setPaymentMethod: (v: PaymentMethod) => void;
  customerNote: string;
  setCustomerNote: (v: string) => void;
  quote: OrderQuote | null;
  placing: boolean;
  placeError: string | null;
  onPlaceOrder: () => void;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const noMethodsAvailable = !settings.cashOnDeliveryEnabled && !settings.onlineCardEnabled;

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: theme.muted }}>{t('publicOrder.payment.title')}</h2>
        {noMethodsAvailable ? (
          <p className="text-sm text-amber-600">{t('publicOrder.payment.noneAvailable')}</p>
        ) : (
          <div className="space-y-2">
            {settings.cashOnDeliveryEnabled && (
              <button
                type="button"
                onClick={() => setPaymentMethod('CASH_ON_DELIVERY')}
                className="flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors"
                style={{
                  borderColor: paymentMethod === 'CASH_ON_DELIVERY' ? theme.primary : theme.border,
                  backgroundColor: paymentMethod === 'CASH_ON_DELIVERY' ? `${theme.primary}0d` : theme.surface,
                  color: theme.text,
                }}
              >
                <Banknote className="h-5 w-5" style={{ color: paymentMethod === 'CASH_ON_DELIVERY' ? theme.primary : theme.muted }} />
                {t('publicOrder.payment.cashOnDelivery')}
              </button>
            )}
            {settings.onlineCardEnabled && (
              <button
                type="button"
                onClick={() => setPaymentMethod('ONLINE_CARD')}
                className="flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors"
                style={{
                  borderColor: paymentMethod === 'ONLINE_CARD' ? theme.primary : theme.border,
                  backgroundColor: paymentMethod === 'ONLINE_CARD' ? `${theme.primary}0d` : theme.surface,
                  color: theme.text,
                }}
              >
                <CreditCard className="h-5 w-5" style={{ color: paymentMethod === 'ONLINE_CARD' ? theme.primary : theme.muted }} />
                {t('publicOrder.payment.onlineCard')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>{t('publicOrder.payment.noteLabel')}</Label>
        <Textarea
          value={customerNote}
          onChange={(e) => setCustomerNote(e.target.value.slice(0, 500))}
          placeholder={t('publicOrder.payment.notePlaceholder')}
          className="min-h-[64px] text-sm"
        />
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
        <h3 className="mb-2 text-sm font-bold" style={{ color: theme.text }}>{t('publicOrder.confirm.summaryTitle')}</h3>
        {quote ? (
          <div className="space-y-1.5 text-sm">
            {quote.lines.map((line) => (
              <div key={line.menuItemId + line.modifiers.map((m) => m.id).join(',')} className="flex justify-between gap-2" style={{ color: theme.muted }}>
                <span className="min-w-0 truncate">{line.quantity}× {line.name}</span>
                <span className="shrink-0">{formatPrice(line.lineTotal)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between pt-2 border-t" style={{ borderColor: theme.border, color: theme.muted }}>
              <span>{t('publicOrder.quote.subtotal')}</span>
              <span>{formatPrice(quote.subtotal)}</span>
            </div>
            {fulfillmentType === 'DELIVERY' && (
              <div className="flex justify-between" style={{ color: theme.muted }}>
                <span>{t('publicOrder.quote.deliveryFee')}</span>
                <span>{formatPrice(quote.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-1" style={{ color: theme.text }}>
              <span>{t('publicOrder.quote.total')}</span>
              <span>{formatPrice(quote.total)}</span>
            </div>
            <p className="pt-1 text-xs" style={{ color: theme.muted }}>
              {t('publicOrder.confirm.prepTimePrefix')} ~{quote.prepTimeMinutes} {t('publicOrder.confirm.minutesSuffix')}
            </p>
          </div>
        ) : (
          <p className="text-sm" style={{ color: theme.muted }}>{t('publicOrder.quote.waiting')}</p>
        )}
      </div>

      {placeError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {placeError}
        </div>
      )}

      <Button
        type="button"
        disabled={placing || !quote || !paymentMethod || noMethodsAvailable}
        onClick={onPlaceOrder}
        className="h-12 w-full text-sm font-bold text-white"
        style={{ backgroundColor: theme.primary }}
      >
        {placing ? <Loader2 className="h-4 w-4 animate-spin" /> : quote ? `${t('publicOrder.confirm.placeOrderButton')} · ${formatPrice(quote.total)}` : t('publicOrder.confirm.placeOrderButton')}
      </Button>
    </div>
  );
}
