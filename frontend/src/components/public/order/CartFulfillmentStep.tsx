'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Minus, Plus, Trash2, Bike, ShoppingBag as PickupIcon, Loader2, AlertTriangle, CheckCircle2, MapPinOff } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/provider';
import AddressPicker from '@/components/maps/AddressPicker';
import type { AddressCheckResult, CartEntry, FulfillmentType, OrderQuote, PublicDeliveryZone, PublicOrderSettings } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { formatMoney } from '@/lib/currency';

export interface AddressFormState {
  fullAddress: string;
  neighborhood: string;
  note: string;
  /** Customer's map pin. The backend resolves the delivery zone + fee from
   *  this, so it's the authoritative delivery location — the free-text
   *  `fullAddress` is courier instructions, not geometry. */
  lat?: number;
  lng?: number;
  /** True while `fullAddress` still holds a reverse-geocoded label the
   *  customer hasn't edited, so a later pin move may safely overwrite it.
   *  Lives in the form state (not a ref) so it survives this step
   *  unmounting when the customer steps back to the menu. */
  autoFilled?: boolean;
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
  restaurantLocation,
  addressCheck,
  addressChecking,
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
  // A state *setter*, not a plain callback: the reverse-geocode label lands
  // ~600ms after the pin moves, by which time the customer may already be
  // typing in the address field — a functional update merges into the current
  // state instead of writing back a stale snapshot.
  setAddress: Dispatch<SetStateAction<AddressFormState>>;
  restaurantLocation: { lat: number; lng: number } | null;
  addressCheck: AddressCheckResult | null;
  addressChecking: boolean;
  quote: OrderQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const bothFulfillmentTypesAvailable = settings.deliveryEnabled && settings.pickupEnabled;

  // The map flow needs a restaurant location to measure distance from. Without
  // one there is nothing to resolve a zone against, so we fall back to the
  // pre-v2 manual picker — and we honour the server's own `needsManualZone`
  // verdict too, in case the tenant's coordinates were cleared mid-session.
  const manualZoneMode = !restaurantLocation || addressCheck?.needsManualZone === true;

  const pin = address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null;

  const handlePinChange = (v: { lat: number; lng: number; label?: string }) => {
    setAddress((prev) => {
      const canPrefill = !prev.fullAddress.trim() || prev.autoFilled === true;
      return {
        ...prev,
        lat: v.lat,
        lng: v.lng,
        ...(v.label && canPrefill ? { fullAddress: v.label, autoFilled: true } : {}),
      };
    });
  };

  const formatKm = (meters: number) => (meters / 1000).toFixed(1);

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: theme.muted }}>{t('publicOrder.cart.title')}</h2>
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
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide" style={{ color: theme.muted }}>{t('publicOrder.fulfillment.title')}</h2>
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
          {manualZoneMode ? (
            <div>
              <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>{t('publicOrder.address.zoneLabel')}</Label>
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
          ) : (
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>{t('publicOrder.address.mapLabel')}</Label>
              <AddressPicker value={pin} onChange={handlePinChange} restaurantLocation={restaurantLocation} theme={theme} />

              {/* Range verdict. The pin — not the free-text address — is what
                  the backend measures, so this block is the customer's only
                  signal that the order can actually be delivered. */}
              {!pin ? (
                <p className="text-xs" style={{ color: theme.muted }}>{t('publicOrder.address.pinRequired')}</p>
              ) : addressChecking ? (
                <div className="flex items-center gap-2 text-xs" style={{ color: theme.muted }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('publicOrder.address.checking')}
                </div>
              ) : addressCheck?.inRange ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">{t('publicOrder.address.deliversHere')}</p>
                    <p className="mt-0.5">
                      {addressCheck.zone && (
                        <>
                          {addressCheck.zone.name} · {t('publicOrder.address.deliveryFeeLabel')} {formatPrice(addressCheck.zone.deliveryFee)}
                          {addressCheck.zone.minOrderAmount > 0 && <> · {t('publicOrder.address.minOrderLabel')} {formatPrice(addressCheck.zone.minOrderAmount)}</>}
                        </>
                      )}
                      {addressCheck.distanceMeters != null && (
                        <> · {t('publicOrder.address.distanceAway').replace('{{km}}', formatKm(addressCheck.distanceMeters))}</>
                      )}
                    </p>
                  </div>
                </div>
              ) : addressCheck ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">{t('publicOrder.address.outOfRangeTitle')}</p>
                    <p className="mt-0.5">{t('publicOrder.address.outOfRangeDescription')}</p>
                    {addressCheck.distanceMeters != null && (
                      <p className="mt-0.5">{t('publicOrder.address.distanceAway').replace('{{km}}', formatKm(addressCheck.distanceMeters))}</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>{t('publicOrder.address.fullAddressLabel')}</Label>
            <Textarea
              value={address.fullAddress}
              onChange={(e) => setAddress((prev) => ({ ...prev, fullAddress: e.target.value, autoFilled: false }))}
              placeholder={t('publicOrder.address.fullAddressPlaceholder')}
              className="min-h-[72px] text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>
              {manualZoneMode ? t('publicOrder.address.neighborhoodLabel') : t('publicOrder.address.buildingLabel')}
            </Label>
            <Input
              value={address.neighborhood}
              onChange={(e) => setAddress((prev) => ({ ...prev, neighborhood: e.target.value }))}
              placeholder={manualZoneMode ? t('publicOrder.address.neighborhoodPlaceholder') : t('publicOrder.address.buildingPlaceholder')}
              className="h-10 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>{t('publicOrder.address.noteLabel')}</Label>
            <Input
              value={address.note}
              onChange={(e) => setAddress((prev) => ({ ...prev, note: e.target.value }))}
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
