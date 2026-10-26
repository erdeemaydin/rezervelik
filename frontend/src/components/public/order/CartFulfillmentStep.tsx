'use client';

import { Minus, Plus, Trash2, Bike, ShoppingBag as PickupIcon, Loader2, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/provider';
import type { CartEntry, FulfillmentType, OrderQuote, PublicDeliveryZone, PublicOrderSettings } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { formatMoney } from '@/lib/currency';

export interface AddressFormState {
  fullAddress: string;
  neighborhood: string;
  note: string;
}

export default function CartFulfillmentStep({
  theme,
  currency,
  cart,
  onUpdateQty,
  onRemove,
  settings,
  zones,
  fulfillmentType,
  setFulfillmentType,
  zoneId,
  setZoneId,
  address,
  setAddress,
  quote,
  quoteLoading,
  quoteError,
}: {
  theme: OrderTheme;
  currency: string;
  cart: CartEntry[];
  onUpdateQty: (key: string, quantity: number) => void;
  onRemove: (key: string) => void;
  settings: PublicOrderSettings;
  zones: PublicDeliveryZone[];
  fulfillmentType: FulfillmentType;
  setFulfillmentType: (v: FulfillmentType) => void;
  zoneId: string | null;
  setZoneId: (v: string | null) => void;
  address: AddressFormState;
  setAddress: (v: AddressFormState) => void;
  quote: OrderQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const selectedZone = zones.find((z) => z.id === zoneId) || null;
  const bothFulfillmentTypesAvailable = settings.deliveryEnabled && settings.pickupEnabled;

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h2 className="mb-3 text-sm font-bold" style={{ color: theme.muted }}>{t('publicOrder.cart.title')}</h2>
        <div className="space-y-2">
          {cart.map((line) => (
            <div key={line.key} className="flex items-start gap-3 rounded-xl border p-3" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: theme.text }}>{line.name}</p>
                {line.modifierSummary && <p className="text-xs" style={{ color: theme.muted }}>{line.modifierSummary}</p>}
                <p className="mt-1 text-sm font-bold" style={{ color: theme.primary }}>{formatPrice(line.unitPriceEstimate * line.quantity)}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full border px-1.5 py-1" style={{ borderColor: theme.border }}>
                  <button
                    type="button"
                    onClick={() => (line.quantity <= 1 ? onRemove(line.key) : onUpdateQty(line.key, line.quantity - 1))}
                    className="flex h-6 w-6 items-center justify-center rounded-full hover:opacity-70"
                    style={{ color: theme.text }}
                    aria-label={t('publicOrder.item.decrease')}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-4 text-center text-xs font-bold" style={{ color: theme.text }}>{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => onUpdateQty(line.key, Math.min(20, line.quantity + 1))}
                    className="flex h-6 w-6 items-center justify-center rounded-full hover:opacity-70"
                    style={{ color: theme.text }}
                    aria-label={t('publicOrder.item.increase')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button type="button" onClick={() => onRemove(line.key)} className="text-red-500 hover:text-red-600" aria-label={t('publicOrder.cart.remove')}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold" style={{ color: theme.muted }}>{t('publicOrder.fulfillment.title')}</h2>
        <div className="grid grid-cols-2 gap-2">
          {settings.deliveryEnabled && (
            <button
              type="button"
              onClick={() => setFulfillmentType('DELIVERY')}
              className="flex flex-col items-center gap-1.5 rounded-xl border py-4 text-sm font-semibold transition-colors"
              style={{
                borderColor: fulfillmentType === 'DELIVERY' ? theme.primary : theme.border,
                backgroundColor: fulfillmentType === 'DELIVERY' ? `${theme.primary}0d` : theme.surface,
                color: theme.text,
              }}
            >
              <Bike className="h-5 w-5" style={{ color: fulfillmentType === 'DELIVERY' ? theme.primary : theme.muted }} />
              {t('publicOrder.fulfillment.delivery')}
            </button>
          )}
          {settings.pickupEnabled && (
            <button
              type="button"
              onClick={() => setFulfillmentType('PICKUP')}
              className="flex flex-col items-center gap-1.5 rounded-xl border py-4 text-sm font-semibold transition-colors"
              style={{
                borderColor: fulfillmentType === 'PICKUP' ? theme.primary : theme.border,
                backgroundColor: fulfillmentType === 'PICKUP' ? `${theme.primary}0d` : theme.surface,
                color: theme.text,
              }}
            >
              <PickupIcon className="h-5 w-5" style={{ color: fulfillmentType === 'PICKUP' ? theme.primary : theme.muted }} />
              {t('publicOrder.fulfillment.pickup')}
            </button>
          )}
        </div>
        {!bothFulfillmentTypesAvailable && (
          <p className="mt-2 text-xs" style={{ color: theme.muted }}>{t('publicOrder.fulfillment.onlyOneAvailable')}</p>
        )}
      </div>

      {fulfillmentType === 'DELIVERY' && (
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-bold" style={{ color: theme.muted }}>{t('publicOrder.address.zoneLabel')}</Label>
            {zones.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: theme.muted }}>{t('publicOrder.address.noZones')}</p>
            ) : (
              <div className="mt-2 space-y-2">
                {zones.map((zone) => (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => setZoneId(zone.id)}
                    className="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors"
                    style={{
                      borderColor: zoneId === zone.id ? theme.primary : theme.border,
                      backgroundColor: zoneId === zone.id ? `${theme.primary}0d` : theme.surface,
                      color: theme.text,
                    }}
                  >
                    <span className="font-semibold">{zone.name}</span>
                    <span className="text-xs" style={{ color: theme.muted }}>
                      {t('publicOrder.address.deliveryFeeLabel')} {formatPrice(zone.deliveryFee)}
                      {zone.minOrderAmount > 0 && <> · {t('publicOrder.address.minOrderLabel')} {formatPrice(zone.minOrderAmount)}</>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold" style={{ color: theme.muted }}>{t('publicOrder.address.fullAddressLabel')}</Label>
            <Textarea
              value={address.fullAddress}
              onChange={(e) => setAddress({ ...address, fullAddress: e.target.value })}
              placeholder={t('publicOrder.address.fullAddressPlaceholder')}
              className="min-h-[72px] text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold" style={{ color: theme.muted }}>{t('publicOrder.address.neighborhoodLabel')}</Label>
            <Input
              value={address.neighborhood}
              onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })}
              placeholder={t('publicOrder.address.neighborhoodPlaceholder')}
              className="h-10 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold" style={{ color: theme.muted }}>{t('publicOrder.address.noteLabel')}</Label>
            <Input
              value={address.note}
              onChange={(e) => setAddress({ ...address, note: e.target.value })}
              placeholder={t('publicOrder.address.notePlaceholder')}
              className="h-10 text-sm"
            />
          </div>
        </div>
      )}

      <div className="rounded-xl border p-4" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
        {quoteLoading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: theme.muted }}>
            <Loader2 className="h-4 w-4 animate-spin" /> {t('publicOrder.quote.calculating')}
          </div>
        ) : quoteError ? (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" /> {quoteError}
          </div>
        ) : quote ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between" style={{ color: theme.muted }}>
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
            {fulfillmentType === 'DELIVERY' && !quote.meetsMinimum && quote.minOrderAmount != null && (
              <p className="pt-1 text-xs font-semibold text-amber-600">
                {t('publicOrder.quote.belowMinimum')} {formatPrice(quote.minOrderAmount)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: theme.muted }}>{t('publicOrder.quote.waiting')}</p>
        )}
      </div>
    </div>
  );
}
