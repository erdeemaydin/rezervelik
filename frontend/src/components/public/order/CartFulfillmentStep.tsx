'use client';

// Checkout: how the order gets to the customer, and what that costs. Purely
// presentational — every piece of state it edits lives in OrderExperience,
// which is also the only thing allowed to talk to the pricing/range endpoints.
//
// Two delivery shapes survive from A5 and must both keep working:
//   * map mode — the tenant has coordinates, so the customer's pin is what the
//     backend measures and the zone/fee is resolved server-side;
//   * manual zone mode — the tenant has no coordinates, so there is nothing to
//     measure and the customer picks a zone by hand (the pre-v2 flow).

import type { Dispatch, SetStateAction } from 'react';
import dynamic from 'next/dynamic';
import {
  Bike,
  ShoppingBag as PickupIcon,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  MapPinOff,
  MapPin,
  Clock,
  Pencil,
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/provider';
import AddressPicker from '@/components/maps/AddressPicker';
import type { AddressCheckResult, CartEntry, FulfillmentType, OrderQuote, PublicDeliveryZone, PublicOrderSettings } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { formatMoney } from '@/lib/currency';

// Same reason AddressPicker loads it this way: Leaflet touches `document` at
// import time, so it can never be part of a server render.
const LeafletMap = dynamic(() => import('@/components/maps/LeafletMap'), {
  ssr: false,
  loading: () => <div className="h-36 w-full animate-pulse rounded-xl bg-slate-200/70" />,
});

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
  onEditCart,
  settings,
  zones,
  fulfillmentType,
  setFulfillmentType,
  zoneId,
  setZoneId,
  address,
  setAddress,
  restaurantLocation,
  restaurantAddressText,
  addressCheck,
  addressChecking,
  quote,
  quoteLoading,
  quoteError,
}: {
  theme: OrderTheme;
  currency: string;
  cart: CartEntry[];
  /** Opens the cart sheet — quantities are edited there, not here, so this
   *  screen stays about fulfillment (and there is exactly one mutable view of
   *  the cart). */
  onEditCart: () => void;
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
  restaurantAddressText?: string | null;
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
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartEstimate = cart.reduce((s, l) => s + l.unitPriceEstimate * l.quantity, 0);
  const readyInMinutes = quote?.prepTimeMinutes ?? settings.prepTimeMinutes;

  const sectionTitle = 'mb-2.5 text-xs font-black uppercase tracking-wide';
  const cardStyle = { backgroundColor: theme.surface, boxShadow: theme.shadow };

  const fulfillmentCard = (type: FulfillmentType, icon: React.ReactNode, label: string, caption: string) => {
    const isActive = fulfillmentType === type;
    return (
      <button
        type="button"
        onClick={() => setFulfillmentType(type)}
        aria-pressed={isActive}
        className="flex flex-1 flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition-colors"
        style={{
          borderColor: isActive ? theme.primary : 'transparent',
          backgroundColor: isActive ? theme.primaryTint : theme.surface,
          boxShadow: isActive ? 'none' : theme.shadow,
        }}
      >
        <span style={{ color: isActive ? theme.primary : theme.muted }}>{icon}</span>
        <span className="text-sm font-black" style={{ color: theme.text }}>
          {label}
        </span>
        <span className="text-[11px] leading-tight" style={{ color: theme.muted }}>
          {caption}
        </span>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 pb-6">
      {/* Order summary — read-only here on purpose; the cart sheet owns edits. */}
      <div className="rounded-2xl p-4" style={cardStyle}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black" style={{ color: theme.text }}>
            {t('publicOrder.cart.title')}
          </h2>
          <button
            type="button"
            onClick={onEditCart}
            className="flex items-center gap-1 text-xs font-bold hover:opacity-70"
            style={{ color: theme.primary }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('publicOrder.checkout.editCart')}
          </button>
        </div>
        <ul className="mt-3 space-y-1.5">
          {cart.map((line) => (
            <li key={line.key} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0" style={{ color: theme.muted }}>
                <span className="font-bold" style={{ color: theme.text }}>
                  {line.quantity}×
                </span>{' '}
                {line.name}
                {line.modifierSummary && <span className="block text-xs">{line.modifierSummary}</span>}
                {line.note && <span className="block text-xs italic">“{line.note}”</span>}
              </span>
              <span className="shrink-0 text-sm font-semibold" style={{ color: theme.text }}>
                {formatPrice(line.unitPriceEstimate * line.quantity)}
              </span>
            </li>
          ))}
        </ul>
        {cart.length === 0 && (
          <p className="mt-2 text-sm" style={{ color: theme.muted }}>
            {t('publicOrder.cart.empty')}
          </p>
        )}
        <p className="mt-3 text-[11px]" style={{ color: theme.muted }}>
          {t('publicOrder.cart.itemCount').replace('{{n}}', String(cartCount))} · {formatPrice(cartEstimate)}
        </p>
      </div>

      <div>
        <h2 className={sectionTitle} style={{ color: theme.muted }}>
          {t('publicOrder.fulfillment.title')}
        </h2>
        <div className="flex gap-3">
          {settings.deliveryEnabled &&
            fulfillmentCard(
              'DELIVERY',
              <Bike className="h-6 w-6" />,
              t('publicOrder.fulfillment.delivery'),
              t('publicOrder.fulfillment.deliveryCaption')
            )}
          {settings.pickupEnabled &&
            fulfillmentCard(
              'PICKUP',
              <PickupIcon className="h-6 w-6" />,
              t('publicOrder.fulfillment.pickup'),
              t('publicOrder.fulfillment.pickupCaption')
            )}
        </div>
        {!bothFulfillmentTypesAvailable && (
          <p className="mt-2 text-xs" style={{ color: theme.muted }}>
            {t('publicOrder.fulfillment.onlyOneAvailable')}
          </p>
        )}
      </div>

      {fulfillmentType === 'DELIVERY' && (
        <div className="space-y-4">
          {manualZoneMode ? (
            <div>
              <Label className={sectionTitle} style={{ color: theme.muted }}>
                {t('publicOrder.address.zoneLabel')}
              </Label>
              {zones.length === 0 ? (
                <p className="mt-2 text-sm" style={{ color: theme.muted }}>
                  {t('publicOrder.address.noZones')}
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {zones.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => setZoneId(zone.id)}
                      className="flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left text-sm transition-colors"
                      style={{
                        borderColor: zoneId === zone.id ? theme.primary : 'transparent',
                        backgroundColor: zoneId === zone.id ? theme.primaryTint : theme.surface,
                        boxShadow: zoneId === zone.id ? 'none' : theme.shadow,
                        color: theme.text,
                      }}
                    >
                      <span className="font-bold">{zone.name}</span>
                      <span className="text-xs" style={{ color: theme.muted }}>
                        {t('publicOrder.address.deliveryFeeLabel')} {formatPrice(zone.deliveryFee)}
                        {zone.minOrderAmount > 0 && (
                          <>
                            {' '}
                            · {t('publicOrder.address.minOrderLabel')} {formatPrice(zone.minOrderAmount)}
                          </>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl p-4" style={cardStyle}>
              <Label className={sectionTitle} style={{ color: theme.muted }}>
                {t('publicOrder.address.mapLabel')}
              </Label>
              <AddressPicker value={pin} onChange={handlePinChange} restaurantLocation={restaurantLocation} theme={theme} />

              {/* Range verdict. The pin — not the free-text address — is what
                  the backend measures, so this block is the customer's only
                  signal that the order can actually be delivered. */}
              <div className="mt-3">
                {!pin ? (
                  <p className="text-xs" style={{ color: theme.muted }}>
                    {t('publicOrder.address.pinRequired')}
                  </p>
                ) : addressChecking ? (
                  <div className="flex items-center gap-2 text-xs" style={{ color: theme.muted }}>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('publicOrder.address.checking')}
                  </div>
                ) : addressCheck?.inRange ? (
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-bold">{t('publicOrder.address.deliversHere')}</p>
                      <p className="mt-0.5">
                        {addressCheck.zone && (
                          <>
                            {addressCheck.zone.name} · {t('publicOrder.address.deliveryFeeLabel')}{' '}
                            {formatPrice(addressCheck.zone.deliveryFee)}
                            {addressCheck.zone.minOrderAmount > 0 && (
                              <>
                                {' '}
                                · {t('publicOrder.address.minOrderLabel')} {formatPrice(addressCheck.zone.minOrderAmount)}
                              </>
                            )}
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
                      <p className="font-bold">{t('publicOrder.address.outOfRangeTitle')}</p>
                      <p className="mt-0.5">{t('publicOrder.address.outOfRangeDescription')}</p>
                      {addressCheck.distanceMeters != null && (
                        <p className="mt-0.5">
                          {t('publicOrder.address.distanceAway').replace('{{km}}', formatKm(addressCheck.distanceMeters))}
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-2xl p-4" style={cardStyle}>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>
                {t('publicOrder.address.fullAddressLabel')}
              </Label>
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
                className="h-11 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase" style={{ color: theme.muted }}>
                {t('publicOrder.address.noteLabel')}
              </Label>
              <Input
                value={address.note}
                onChange={(e) => setAddress((prev) => ({ ...prev, note: e.target.value }))}
                placeholder={t('publicOrder.address.notePlaceholder')}
                className="h-11 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {fulfillmentType === 'PICKUP' && (
        <div className="overflow-hidden rounded-2xl" style={cardStyle}>
          {restaurantLocation && (
            <LeafletMap value={restaurantLocation} onChange={() => {}} center={restaurantLocation} heightClass="h-36" interactive={false} />
          )}
          <div className="space-y-2 p-4">
            <p className="flex items-start gap-2 text-sm font-bold" style={{ color: theme.text }}>
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.primary }} />
              {t('publicOrder.pickup.title')}
            </p>
            <p className="text-sm leading-snug" style={{ color: theme.muted }}>
              {restaurantAddressText || t('publicOrder.pickup.addressUnknown')}
            </p>
            <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: theme.primary }}>
              <Clock className="h-3.5 w-3.5" />
              {t('publicOrder.pickup.readyIn').replace('{{minutes}}', String(readyInMinutes))}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl p-4" style={cardStyle}>
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
            <div className="flex justify-between pt-1 text-base font-black" style={{ color: theme.text }}>
              <span>{t('publicOrder.quote.total')}</span>
              <span>{formatPrice(quote.total)}</span>
            </div>
            {fulfillmentType === 'DELIVERY' && !quote.meetsMinimum && quote.minOrderAmount != null && (
              <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 p-2.5 text-xs font-bold text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('publicOrder.quote.belowMinimum')} {formatPrice(quote.minOrderAmount)}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: theme.muted }}>
            {t('publicOrder.quote.waiting')}
          </p>
        )}
      </div>
    </div>
  );
}
