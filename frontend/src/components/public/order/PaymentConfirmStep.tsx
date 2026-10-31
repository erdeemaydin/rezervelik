'use client';

import { Banknote, CreditCard, Loader2, AlertTriangle, Check, Clock } from 'lucide-react';
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
  const cardStyle = { backgroundColor: theme.surface, boxShadow: theme.shadow };

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pb-6">
      <div>
        <h2 className="mb-2.5 text-xs font-black uppercase tracking-wide" style={{ color: theme.muted }}>
          {t('publicOrder.payment.title')}
        </h2>
        {noMethodsAvailable ? (
          <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">{t('publicOrder.payment.noneAvailable')}</p>
        ) : (
          <div className="space-y-2.5">
            {settings.cashOnDeliveryEnabled && (
              <button
                type="button"
                onClick={() => setPaymentMethod('CASH_ON_DELIVERY')}
                aria-pressed={paymentMethod === 'CASH_ON_DELIVERY'}
                className="flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left transition-colors"
                style={{
                  borderColor: paymentMethod === 'CASH_ON_DELIVERY' ? theme.primary : 'transparent',
                  backgroundColor: paymentMethod === 'CASH_ON_DELIVERY' ? theme.primaryTint : theme.surface,
                  boxShadow: paymentMethod === 'CASH_ON_DELIVERY' ? 'none' : theme.shadow,
                }}
              >
                <Banknote
                  className="h-5 w-5 shrink-0"
                  style={{ color: paymentMethod === 'CASH_ON_DELIVERY' ? theme.primary : theme.muted }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold" style={{ color: theme.text }}>
                    {t('publicOrder.payment.cashOnDelivery')}
                  </span>
                  <span className="block text-[11px] leading-snug" style={{ color: theme.muted }}>
                    {fulfillmentType === 'DELIVERY'
                      ? t('publicOrder.payment.cashOnDeliveryHint')
                      : t('publicOrder.payment.cashOnPickupHint')}
                  </span>
                </span>
                {paymentMethod === 'CASH_ON_DELIVERY' && (
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: theme.primary }}
                  >
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>
            )}

            {/* Card payments: the tenant dashboard locks this capability off
                until a gateway is wired up, so rather than hiding it we show
                it the same way the dashboard does — visible, disabled, and
                labelled "coming soon". */}
            {settings.onlineCardEnabled ? (
              <button
                type="button"
                onClick={() => setPaymentMethod('ONLINE_CARD')}
                aria-pressed={paymentMethod === 'ONLINE_CARD'}
                className="flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left transition-colors"
                style={{
                  borderColor: paymentMethod === 'ONLINE_CARD' ? theme.primary : 'transparent',
                  backgroundColor: paymentMethod === 'ONLINE_CARD' ? theme.primaryTint : theme.surface,
                  boxShadow: paymentMethod === 'ONLINE_CARD' ? 'none' : theme.shadow,
                }}
              >
                <CreditCard className="h-5 w-5 shrink-0" style={{ color: paymentMethod === 'ONLINE_CARD' ? theme.primary : theme.muted }} />
                <span className="text-sm font-bold" style={{ color: theme.text }}>
                  {t('publicOrder.payment.onlineCard')}
                </span>
              </button>
            ) : (
              <div
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-4 opacity-60"
                style={{ backgroundColor: theme.surface, boxShadow: theme.shadow }}
              >
                <CreditCard className="h-5 w-5 shrink-0" style={{ color: theme.muted }} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: theme.muted }}>
                      {t('publicOrder.payment.onlineCard')}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                      {t('publicOrder.payment.comingSoon')}
                    </span>
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>
          {t('publicOrder.payment.noteLabel')}
        </Label>
        <Textarea
          value={customerNote}
          onChange={(e) => setCustomerNote(e.target.value.slice(0, 500))}
          placeholder={t('publicOrder.payment.notePlaceholder')}
          className="min-h-[64px] text-sm"
        />
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        <h3 className="mb-2.5 text-sm font-black" style={{ color: theme.text }}>
          {t('publicOrder.confirm.summaryTitle')}
        </h3>
        {quote ? (
          <div className="space-y-1.5 text-sm">
            {quote.lines.map((line) => (
              <div
                key={line.menuItemId + line.modifiers.map((m) => m.id).join(',')}
                className="flex justify-between gap-2"
                style={{ color: theme.muted }}
              >
                <span className="min-w-0 truncate">
                  {line.quantity}× {line.name}
                </span>
                <span className="shrink-0">{formatPrice(line.lineTotal)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-2" style={{ borderColor: theme.border, color: theme.muted }}>
              <span>{t('publicOrder.quote.subtotal')}</span>
              <span>{formatPrice(quote.subtotal)}</span>
            </div>
            {fulfillmentType === 'DELIVERY' && (
              <div className="flex justify-between" style={{ color: theme.muted }}>
                <span>{t('publicOrder.quote.deliveryFee')}</span>
                <span>{formatPrice(quote.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-black" style={{ color: theme.text }}>
              <span>{t('publicOrder.quote.total')}</span>
              <span>{formatPrice(quote.total)}</span>
            </div>
            <p className="flex items-center gap-1.5 pt-1 text-xs" style={{ color: theme.muted }}>
              <Clock className="h-3.5 w-3.5" />
              {t('publicOrder.confirm.prepTimePrefix')} ~{quote.prepTimeMinutes} {t('publicOrder.confirm.minutesSuffix')}
            </p>
          </div>
        ) : (
          <p className="text-sm" style={{ color: theme.muted }}>
            {t('publicOrder.quote.waiting')}
          </p>
        )}
      </div>

      {placeError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {placeError}
        </div>
      )}

      <Button
        type="button"
        disabled={placing || !quote || !paymentMethod || noMethodsAvailable}
        onClick={onPlaceOrder}
        className="h-12 w-full text-sm font-bold text-white"
        style={{ backgroundColor: theme.primary }}
      >
        {placing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : quote ? (
          `${t('publicOrder.confirm.placeOrderButton')} · ${formatPrice(quote.total)}`
        ) : (
          t('publicOrder.confirm.placeOrderButton')
        )}
      </Button>
    </div>
  );
}
