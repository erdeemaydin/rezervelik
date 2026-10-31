'use client';

// The customer ordering flow's shell: it owns every piece of state the steps
// share, and is the only place that talks to the pricing/range/placement
// endpoints. The steps below it are presentational.
//
// Screen structure (mobile-first, delivery-app shaped):
//   menu     — restaurant hero, sticky category rail, image-forward cards,
//              persistent bottom cart bar
//   cart     — a sheet over the menu, the only place quantities are editable
//   checkout — fulfillment + address/map + fee breakdown
//   identify — phone/OTP (skipped for a trusted device)
//   payment  — method + summary + place order
//   placed   — live tracking

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, History, Loader2, AlertTriangle, StoreIcon, ShoppingBag, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/provider';
import { cn } from '@/lib/utils';
import { getOrderTheme } from '@/lib/orderTheme';
import { formatMoney } from '@/lib/currency';
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
import CartSheet from './CartSheet';
import CartFulfillmentStep, { type AddressFormState } from './CartFulfillmentStep';
import PhoneIdentify from './PhoneIdentify';
import PaymentConfirmStep from './PaymentConfirmStep';
import OrderPlacedView from './OrderPlacedView';
import OrderHistorySheet from './OrderHistorySheet';
import RestaurantHero from './RestaurantHero';

type Step = 'menu' | 'checkout' | 'identify' | 'payment' | 'placed';

const QUOTE_DEBOUNCE_MS = 400;
// Nominatim/its own rate limiter aside, the pin settles in bursts while the
// customer drags — one check per settled position is plenty.
const ADDRESS_CHECK_DEBOUNCE_MS = 500;
// How far down the menu the compact header fades in. Deliberately well above
// the point where the category rail starts sticking (which assumes the header
// is already there, `sticky top-14`), so the two can't fight over the same
// few pixels of scroll.
const HEADER_REVEAL_PX = 80;

export default function OrderExperience({ restaurant }: { restaurant: any }) {
  const { t, locale } = useTranslation();
  const theme = getOrderTheme(restaurant.customization);
  // Tenant's configured currency (RestaurantSettings.currency, already
  // returned by GET /public/restaurant/:slug) — not a hardcoded 'TRY', same
  // reasoning as dashboard/menus' formatPrice.
  const currency = restaurant.settings?.currency || 'TRY';
  const formatPrice = (n: number) => formatMoney(n, currency, locale);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<PublicOrderSettings | null>(null);
  const [categories, setCategories] = useState<OrderableMenuCategory[]>([]);
  const [zones, setZones] = useState<PublicDeliveryZone[]>([]);

  const [step, setStep] = useState<Step>('menu');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

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
  const [scrolled, setScrolled] = useState(false);

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

  // The hero scrolls away; a compact header takes its place.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > HEADER_REVEAL_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  // The tenant is switched on but outside its weekly order hours: the menu
  // stays browsable, but nothing may be added to a cart the backend would
  // refuse (errors.online_ordering_closed) at placement.
  const withinOrderHours = settings?.withinOrderHours !== false;
  const canOrderNow = !!settings?.onlineOrderingOpen && withinOrderHours;

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
      // Per-line instructions have nowhere of their own to live on the wire
      // (OrderItem has no note column), so they ride along on the order note,
      // prefixed with the dish they belong to — the kitchen still gets them.
      const lineNotes = cart.filter((l) => l.note).map((l) => `${l.name}: ${l.note}`);
      const composedNote = [...lineNotes, customerNote.trim()].filter(Boolean).join(' · ');
      const payload: PlaceOrderInput = {
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, modifierOptionIds: l.modifierOptionIds })),
        fulfillmentType,
        paymentMethod,
        customerNote: composedNote || undefined,
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
      window.scrollTo({ top: 0 });
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

  const goToStep = (next: Step) => {
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const showBack = step !== 'menu' && step !== 'placed';
  const headerVisible = step !== 'menu' || scrolled;
  const ready = !loading && !loadError && !!settings && settings.onlineOrderingOpen;

  // Facts for the hero's stat row, best-known-first: a priced quote beats the
  // range check, which beats the tenant's published zone list.
  const heroDistance = quote?.distanceMeters ?? addressCheck?.distanceMeters ?? null;
  const heroMinOrder = useMemo(() => {
    const fromQuote = quote?.minOrderAmount ?? addressCheck?.zone?.minOrderAmount;
    if (fromQuote != null) return fromQuote;
    const zoneMinimums = zones.map((z) => z.minOrderAmount).filter((n) => n > 0);
    return zoneMinimums.length > 0 ? Math.min(...zoneMinimums) : null;
  }, [quote?.minOrderAmount, addressCheck?.zone?.minOrderAmount, zones]);

  const roundIconButton = 'flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md backdrop-blur';

  return (
    <div className={cn('min-h-screen', theme.fontClass)} style={{ backgroundColor: theme.bg, color: theme.text, ...theme.cssVars }}>
      {/* Compact header — fixed, so the hero can own the top of the menu screen
          and the category rail has a constant 56px to stick beneath. */}
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-40 h-14 border-b transition-opacity duration-200',
          headerVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <div className="mx-auto flex h-full max-w-lg items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2">
            {showBack && (
              <button
                type="button"
                onClick={handleBack}
                aria-label={t('publicOrder.nav.back')}
                className="shrink-0 rounded-full p-1 hover:opacity-70"
              >
                <ChevronLeft className="h-5 w-5" style={{ color: theme.text }} />
              </button>
            )}
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt="" aria-hidden className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                style={{ backgroundColor: theme.primary }}
              >
                {restaurant.name?.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-black" style={{ color: theme.text }}>
                {restaurant.name}
              </p>
              <p className="truncate text-[11px]" style={{ color: theme.muted }}>
                {authed && customer?.name ? customer.name : t(`publicOrder.nav.step.${step}`)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {step === 'menu' && cartCount > 0 && (
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="relative flex h-8 w-8 items-center justify-center rounded-full hover:opacity-70"
                style={{ color: theme.text }}
                aria-label={t('publicOrder.cart.title')}
              >
                <ShoppingBag className="h-4 w-4" />
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-black text-white"
                  style={{ backgroundColor: theme.primary }}
                >
                  {cartCount}
                </span>
              </button>
            )}
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

      <main className={cn(step !== 'menu' && 'pt-14', cartCount > 0 && step === 'menu' && 'pb-24', step === 'checkout' && 'pb-24')}>
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: theme.muted }} />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center" style={{ color: theme.muted }}>
            <AlertTriangle className="h-6 w-6" />
            <p className="text-sm">{loadError}</p>
          </div>
        ) : settings && !settings.onlineOrderingOpen ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <StoreIcon className="h-8 w-8" style={{ color: theme.muted }} />
            <h2 className="text-lg font-black" style={{ color: theme.text }}>
              {t('publicOrder.closed.title')}
            </h2>
            <p className="max-w-xs text-sm" style={{ color: theme.muted }}>
              {t('publicOrder.closed.description')}
            </p>
          </div>
        ) : (
          <>
            {step === 'menu' && (
              <>
                <RestaurantHero
                  restaurant={restaurant}
                  theme={theme}
                  currency={currency}
                  prepTimeMinutes={settings?.prepTimeMinutes ?? null}
                  distanceMeters={heroDistance}
                  minOrderAmount={heroMinOrder}
                  actions={
                    <>
                      <span />
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setHistoryOpen(true)}
                          className={roundIconButton}
                          aria-label={t('publicOrder.nav.myOrders')}
                        >
                          <History className="h-4 w-4" />
                        </button>
                        <span className={roundIconButton}>
                          <LanguageSwitcher />
                        </span>
                      </span>
                    </>
                  }
                />

                {!withinOrderHours && (
                  <div className="mx-auto mt-4 max-w-lg px-4">
                    <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-sm font-black text-amber-800">{t('publicOrder.closedHours.title')}</p>
                        <p className="mt-0.5 text-xs leading-snug text-amber-700">{t('publicOrder.quote.closedNow')}</p>
                      </div>
                    </div>
                  </div>
                )}

                <MenuStep
                  categories={categories}
                  theme={theme}
                  currency={currency}
                  canOrder={canOrderNow}
                  onAddToCart={addToCart}
                />
              </>
            )}

            {step === 'checkout' && settings && (
              <CartFulfillmentStep
                theme={theme}
                currency={currency}
                cart={cart}
                onEditCart={() => setCartOpen(true)}
                settings={settings}
                zones={zones}
                fulfillmentType={fulfillmentType}
                setFulfillmentType={setFulfillmentType}
                zoneId={zoneId}
                setZoneId={setZoneId}
                address={address}
                setAddress={setAddress}
                restaurantLocation={restaurantLocation}
                restaurantAddressText={restaurant.addressText}
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
                  goToStep('payment');
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
                restaurantName={restaurant.name}
                order={placedOrder}
                onOrderAgain={() => {
                  setPlacedOrder(null);
                  setCustomerNote('');
                  goToStep('menu');
                }}
                onViewHistory={() => setHistoryOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {/* Persistent bottom cart bar — the menu screen's only call to action. */}
      {ready && step === 'menu' && cartCount > 0 && canOrderNow && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t p-3"
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        >
          <div className="mx-auto max-w-lg">
            <Button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex h-12 w-full items-center justify-between px-4 text-sm font-bold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              <span className="flex items-center gap-2">
                <span
                  className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-black"
                >
                  {cartCount}
                </span>
                {t('publicOrder.menu.viewCart')}
              </span>
              <span>{formatPrice(cartEstimatedTotal)}</span>
            </Button>
          </div>
        </div>
      )}

      {ready && step === 'checkout' && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t p-3"
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        >
          <div className="mx-auto max-w-lg">
            <Button
              type="button"
              disabled={!canContinueCheckout}
              onClick={() => goToStep(authed ? 'payment' : 'identify')}
              className="h-12 w-full text-sm font-bold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              {quote ? `${t('publicOrder.nav.continue')} · ${formatPrice(quote.total)}` : t('publicOrder.nav.continue')}
            </Button>
          </div>
        </div>
      )}

      <CartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        theme={theme}
        currency={currency}
        cart={cart}
        onUpdateQty={updateQty}
        onRemove={removeFromCart}
        onCheckout={() => {
          setCartOpen(false);
          goToStep('checkout');
        }}
      />

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
