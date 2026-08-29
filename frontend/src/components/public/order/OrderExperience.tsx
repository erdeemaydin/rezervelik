'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, History, Loader2, AlertTriangle, StoreIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/provider';
import { cn } from '@/lib/utils';
import { getOrderTheme } from '@/lib/orderTheme';
import {
  fetchOrderSettings,
  fetchOrderableMenu,
  fetchDeliveryZones,
  fetchQuote,
  fetchMyOrders,
  placeOrder,
  checkAddress,
  orderApiErrorMessage,
  orderApiErrorCode,
  type AddressCheckResult,
  type PublicOrderSettings,
  type OrderableMenuCategory,
  type PublicDeliveryZone,
  type CartEntry,
  type FulfillmentType,
  type PaymentMethod,
  type OrderQuote,
  type OrderRecord,
  type PlaceOrderInput,
} from '@/lib/orderApi';
import MenuStep from './MenuStep';
import CartFulfillmentStep, { type AddressFormState } from './CartFulfillmentStep';
import PhoneIdentify from './PhoneIdentify';
import PaymentConfirmStep from './PaymentConfirmStep';
import OrderPlacedView from './OrderPlacedView';
import OrderHistorySheet from './OrderHistorySheet';

type Step = 'menu' | 'checkout' | 'identify' | 'payment' | 'placed';

const QUOTE_DEBOUNCE_MS = 400;
// Nominatim/its own rate limiter aside, the pin settles in bursts while the
// customer drags — one check per settled position is plenty.
const ADDRESS_CHECK_DEBOUNCE_MS = 500;

export default function OrderExperience({ restaurant }: { restaurant: any }) {
  const { t, locale } = useTranslation();
  const theme = getOrderTheme(restaurant.customization);
  // Tenant's configured currency (RestaurantSettings.currency, already
  // returned by GET /public/restaurant/:slug) — not a hardcoded 'TRY', same
  // reasoning as dashboard/menus' formatPrice.
  const currency = restaurant.settings?.currency || 'TRY';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PublicOrderSettings | null>(null);
  const [categories, setCategories] = useState<OrderableMenuCategory[]>([]);
  const [zones, setZones] = useState<PublicDeliveryZone[]>([]);

  const [step, setStep] = useState<Step>('menu');
  const [cart, setCart] = useState<CartEntry[]>([]);

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('DELIVERY');
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [address, setAddress] = useState<AddressFormState>({ fullAddress: '', neighborhood: '', note: '' });

  // The tenant's own coordinates decide which delivery UX applies: with them,
  // the map pin drives zone/fee resolution server-side; without them there's
  // nothing to measure from and the flow falls back to the manual zone list.
  const restaurantLocation = useMemo(() => {
    const lat = restaurant.latitude;
    const lng = restaurant.longitude;
    return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
  }, [restaurant.latitude, restaurant.longitude]);
  const [addressCheck, setAddressCheck] = useState<AddressCheckResult | null>(null);
  const [addressChecking, setAddressChecking] = useState(false);

  // Primitives, not the address object: `address` gets a new identity on every
  // keystroke in the free-text field, and re-quoting/re-checking on those
  // would both spam the API and violate Nominatim/rate-limit etiquette.
  const pinLat = address.lat ?? null;
  const pinLng = address.lng ?? null;
  const manualZoneMode = !restaurantLocation || addressCheck?.needsManualZone === true;
  const pinDrivesQuote = !manualZoneMode && pinLat != null && pinLng != null;

  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [authed, setAuthed] = useState(false);
  const [customer, setCustomer] = useState<{ id: string; name: string; phone: string } | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [customerNote, setCustomerNote] = useState('');
  const [placing, setPlacing] = useState(false);
  // Synchronous re-entry guard, separate from the `placing` state: two rapid
  // clicks/taps can both fire before React commits the disabled attribute
  // the `placing` state drives, which would otherwise place two real,
  // separately-charged orders for one user action. A ref updates immediately,
  // not on the next render.
  const placingRef = useRef(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<OrderRecord | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);

  // Initial load: settings first (always reachable, even when the tenant has
  // manually closed ordering for the moment), then menu/zones only if open —
  // /menu and /zones 403 while onlineOrderingOpen is false (see
  // requireOnlineOrderingOpen), so there's no point racing them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const sett = await fetchOrderSettings(restaurant.id);
        if (cancelled) return;
        setSettings(sett);
        if (sett.onlineOrderingOpen) {
          const [cats, zns] = await Promise.all([fetchOrderableMenu(restaurant.id), fetchDeliveryZones(restaurant.id)]);
          if (cancelled) return;
          setCategories(cats);
          setZones(zns);
          setFulfillmentType(sett.deliveryEnabled ? 'DELIVERY' : 'PICKUP');
          setPaymentMethod(sett.cashOnDeliveryEnabled ? 'CASH_ON_DELIVERY' : sett.onlineCardEnabled ? 'ONLINE_CARD' : null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(orderApiErrorMessage(err, t('publicOrder.loadFailed')));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id]);

  // Silent probe for an already-trusted device / live session cookie — lets
  // a returning customer skip the OTP step entirely (spec §5), and lets the
  // "My Orders" header button work without asking for a phone number again.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetchMyOrders(restaurant.id);
        if (!cancelled) setAuthed(true);
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurant.id]);

  // Ask the backend whether the pin is deliverable as soon as it settles. This
  // is only a verdict (it never throws for out-of-range) and it's what gates
  // "Continue" — the /quote call and order placement stay the real authority.
  useEffect(() => {
    if (!restaurantLocation || fulfillmentType !== 'DELIVERY' || pinLat == null || pinLng == null) {
      setAddressCheck(null);
      setAddressChecking(false);
      return;
    }
    let cancelled = false;
    setAddressChecking(true);
    const timer = setTimeout(async () => {
      try {
        const result = await checkAddress(restaurant.id, { lat: pinLat, lng: pinLng });
        if (!cancelled) setAddressCheck(result);
      } catch {
        // A failed check must not silently look like "in range" — leaving it
        // null keeps Continue disabled rather than letting a doomed order through.
        if (!cancelled) setAddressCheck(null);
      } finally {
        if (!cancelled) setAddressChecking(false);
      }
    }, ADDRESS_CHECK_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [restaurantLocation, fulfillmentType, pinLat, pinLng, restaurant.id]);

  // Recompute the quote on every cart/fulfillment/zone/pin change — the whole
  // flow's "never trust a client-computed total" rule (spec §4).
  useEffect(() => {
    if (cart.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    // For delivery we need something for the backend to price against: a pin
    // (map mode) or a hand-picked zone (tenants with no coordinates). And
    // there's no point quoting a pin we already know is out of range — the
    // address block says so, and the call would only 400.
    if (fulfillmentType === 'DELIVERY') {
      // In map mode we wait for a positive range verdict before quoting: a
      // pending or negative check would only earn a 400 from the pricing
      // service, and the address block already explains why.
      const deliverable = pinDrivesQuote ? addressCheck?.inRange === true : !!zoneId;
      if (!deliverable) {
        setQuote(null);
        setQuoteError(null);
        return;
      }
    }
    let cancelled = false;
    setQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        const q = await fetchQuote(restaurant.id, {
          items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierOptionIds: l.modifierOptionIds })),
          fulfillmentType,
          // The backend ignores zoneId whenever a pin is usable, so send one
          // or the other rather than both and hope it picks right.
          zoneId: fulfillmentType === 'DELIVERY' && !pinDrivesQuote ? zoneId! : undefined,
          ...(pinDrivesQuote ? { lat: pinLat!, lng: pinLng! } : {}),
        });
        if (!cancelled) {
          setQuote(q);
          setQuoteError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(
            orderApiErrorCode(err) === 'errors.order_out_of_delivery_range'
              ? t('publicOrder.quote.outOfRange')
              : orderApiErrorMessage(err, t('publicOrder.quote.failed'))
          );
        }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, fulfillmentType, zoneId, pinDrivesQuote, pinLat, pinLng, addressCheck?.inRange, restaurant.id]);

  const addToCart = (entry: CartEntry) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.key === entry.key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + entry.quantity };
        return next;
      }
      return [...prev, entry];
    });
    toast.success(t('publicOrder.menu.addedToast'));
  };
  const updateQty = (key: string, quantity: number) => setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  const removeFromCart = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartEstimatedTotal = cart.reduce((s, l) => s + l.unitPriceEstimate * l.quantity, 0);

  // Delivery has two shapes now. Map mode: a pin the backend has confirmed is
  // in range (an unresolved or failed check is deliberately NOT permissive).
  // Manual mode (tenant has no coordinates): the old hand-picked zone.
  const deliveryTargetReady = manualZoneMode
    ? !!zoneId
    : pinDrivesQuote && !addressChecking && addressCheck?.inRange === true;

  const canContinueCheckout =
    cart.length > 0 &&
    !quoteLoading &&
    !!quote &&
    (fulfillmentType === 'PICKUP' ||
      (deliveryTargetReady && address.fullAddress.trim().length > 0 && quote.meetsMinimum));

  const handleBack = () => {
    if (step === 'checkout') setStep('menu');
    else if (step === 'identify') setStep('checkout');
    else if (step === 'payment') setStep(authed ? 'checkout' : 'identify');
  };

  const handlePlaceOrder = async () => {
    if (!paymentMethod || placingRef.current) return;
    placingRef.current = true;
    try {
      setPlacing(true);
      setPlaceError(null);
      const payload: PlaceOrderInput = {
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierOptionIds: l.modifierOptionIds })),
        fulfillmentType,
        paymentMethod,
        customerNote: customerNote.trim() || undefined,
      };
      if (fulfillmentType === 'DELIVERY') {
        payload.address = {
          fullAddress: address.fullAddress.trim(),
          neighborhood: address.neighborhood.trim() || undefined,
          note: address.note.trim() || undefined,
          // Same rule as the quote: the pin wins where there is one, and the
          // zone is only sent for tenants with no coordinates to measure from.
          ...(pinDrivesQuote ? { lat: pinLat!, lng: pinLng! } : { zoneId: zoneId || undefined }),
        };
      }
      const order = await placeOrder(restaurant.id, payload);
      setPlacedOrder(order);
      setCart([]);
      setStep('placed');
    } catch (err) {
      setPlaceError(
        orderApiErrorCode(err) === 'errors.order_out_of_delivery_range'
          ? t('publicOrder.quote.outOfRange')
          : orderApiErrorMessage(err, t('publicOrder.confirm.placeFailed'))
      );
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  };

  const showBack = step !== 'menu' && step !== 'placed';

  return (
    <div className={cn('min-h-screen', theme.fontClass)} style={{ backgroundColor: theme.bg, color: theme.text, ...theme.cssVars }}>
      <header className="sticky top-0 z-30 border-b px-4 py-2.5" style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {showBack && (
              <button type="button" onClick={handleBack} aria-label={t('publicOrder.nav.back')} className="shrink-0 rounded-full p-1 hover:opacity-70">
                <ChevronLeft className="h-5 w-5" style={{ color: theme.text }} />
              </button>
            )}
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt={restaurant.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white" style={{ backgroundColor: theme.primary }}>
                {restaurant.name?.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" style={{ color: theme.text }}>{restaurant.name}</p>
              <p className="truncate text-[11px]" style={{ color: theme.muted }}>
                {authed && customer?.name ? customer.name : t(`publicOrder.nav.step.${step}`)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:opacity-70"
              style={{ color: theme.text }}
              aria-label={t('publicOrder.nav.myOrders')}
            >
              <History className="h-4 w-4" />
            </button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.muted }} />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center" style={{ color: theme.muted }}>
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm">{loadError}</p>
          </div>
        ) : settings && !settings.onlineOrderingOpen ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <StoreIcon className="h-8 w-8" style={{ color: theme.muted }} />
            <h2 className="text-lg font-bold" style={{ color: theme.text }}>{t('publicOrder.closed.title')}</h2>
            <p className="max-w-xs text-sm" style={{ color: theme.muted }}>{t('publicOrder.closed.description')}</p>
          </div>
        ) : (
          <>
            {step === 'menu' && (
              <MenuStep
                categories={categories}
                theme={theme}
                currency={currency}
                cartCount={cartCount}
                cartEstimatedTotal={cartEstimatedTotal}
                onAddToCart={addToCart}
                onOpenCart={() => setStep('checkout')}
              />
            )}
            {step === 'checkout' && settings && (
              <CartFulfillmentStep
                theme={theme}
                currency={currency}
                cart={cart}
                onUpdateQty={updateQty}
                onRemove={removeFromCart}
                settings={settings}
                zones={zones}
                fulfillmentType={fulfillmentType}
                setFulfillmentType={setFulfillmentType}
                zoneId={zoneId}
                setZoneId={setZoneId}
                address={address}
                setAddress={setAddress}
                restaurantLocation={restaurantLocation}
                addressCheck={addressCheck}
                addressChecking={addressChecking}
                quote={quote}
                quoteLoading={quoteLoading}
                quoteError={quoteError}
              />
            )}
            {step === 'identify' && (
              <PhoneIdentify
                restaurantId={restaurant.id}
                theme={theme}
                onIdentified={(c) => {
                  setAuthed(true);
                  setCustomer(c);
                  setStep('payment');
                }}
              />
            )}
            {step === 'payment' && settings && (
              <PaymentConfirmStep
                theme={theme}
                currency={currency}
                settings={settings}
                fulfillmentType={fulfillmentType}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                customerNote={customerNote}
                setCustomerNote={setCustomerNote}
                quote={quote}
                placing={placing}
                placeError={placeError}
                onPlaceOrder={handlePlaceOrder}
              />
            )}
            {step === 'placed' && placedOrder && (
              <OrderPlacedView
                theme={theme}
                currency={currency}
                restaurantId={restaurant.id}
                order={placedOrder}
                onOrderAgain={() => {
                  setPlacedOrder(null);
                  setStep('menu');
                }}
                onViewHistory={() => setHistoryOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {step === 'checkout' && !loading && settings?.onlineOrderingOpen && (
        <div className="sticky bottom-0 z-30 border-t p-3" style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
          <div className="mx-auto max-w-lg">
            <Button
              type="button"
              disabled={!canContinueCheckout}
              onClick={() => setStep(authed ? 'payment' : 'identify')}
              className="h-12 w-full text-sm font-bold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              {t('publicOrder.nav.continue')}
            </Button>
          </div>
        </div>
      )}

      <OrderHistorySheet
        theme={theme}
        currency={currency}
        restaurantId={restaurant.id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        authed={authed}
        onIdentified={(c) => {
          setAuthed(true);
          setCustomer(c);
        }}
      />
    </div>
  );
}
