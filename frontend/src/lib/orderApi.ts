// Dedicated HTTP client for the customer-facing online-ordering flow
// (r/[slug]/order). Deliberately NOT the shared `api` instance from
// lib/api.ts: that instance reads X-Restaurant-ID from the staff auth
// storage (readAuth('restaurantId')) and — more importantly — its response
// interceptor wipes staff auth and hard-redirects to /auth/login on any 401.
// A customer hitting a 401 here (not yet OTP-verified, expired session) must
// NOT trigger that; it just means "ask for the code again". So this flow
// talks to the API directly with plain axios, the same precedent
// ClassicLayout.tsx/menu/page.tsx already use for public/guest calls,
// explicitly passing X-Restaurant-ID per request (the tenant resolved from
// GET /public/restaurant/:slug, never from staff storage).
//
// withCredentials is required here (unlike the fully-anonymous menu/reservation
// calls) because OTP verify sets httpOnly customerToken/customerDevice
// cookies (see src/middlewares/customerAuth.ts) that must ride along on
// subsequent place-order/mine calls.

import axios from 'axios';

export const ORDER_API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : 'http://localhost:3000/api');

const client = axios.create({
  baseURL: ORDER_API_URL,
  timeout: 20000,
  withCredentials: true,
});

const tenantHeaders = (restaurantId: string) => ({ 'X-Restaurant-ID': restaurantId });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModifierOption {
  id: string;
  name: string;
  priceAdjust: number;
  isAvailable: boolean;
}

export interface MenuModifier {
  id: string;
  name: string;
  isRequired: boolean;
  minChoices: number;
  maxChoices: number | null;
  options: ModifierOption[];
}

/** One sellable dish in the curated online catalog. Note `menuItemId` rather
 *  than `id`: since the v2 order menu, a row is an `OrderMenuItem` override of
 *  a `MenuItem`, and the id every downstream call (cart line, quote, place
 *  order) needs is the *source* MenuItem's — so the API hands that back
 *  directly. Unavailable items are returned, not hidden (plan requirement #2),
 *  so the menu can show "temporarily unavailable" instead of silently
 *  shrinking. */
export interface OrderableMenuItem {
  menuItemId: string;
  name: string;
  description?: string | null;
  price: number;
  imageUrl?: string | null;
  prepTimeMinutes?: number | null;
  available: boolean;
  unavailableReason: 'PAUSED' | 'OUT_OF_STOCK' | null;
  /** Only set for a *timed* pause — an indefinite pause has no known end. */
  resumesAt: string | null;
  /** Merchandising attributes, straight off the source MenuItem (no
   *  OrderMenuItem override exists for them). `isHighlight` drives the
   *  "Popular" ribbon; the rest feed the item sheet's chips. */
  isHighlight: boolean;
  dietaryTags: string | null;
  allergens: string | null;
  spiceLevel: number;
  calories: number | null;
  modifiers: MenuModifier[];
}

export interface OrderableMenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  /** True for tenant-authored online-only sections (which sort ahead of the
   *  printed menu's own categories), false for a mirrored `MenuCategory`. */
  isOrderOnlyCategory: boolean;
  items: OrderableMenuItem[];
}

export interface PublicDeliveryZone {
  id: string;
  name: string;
  deliveryFee: number;
  minOrderAmount: number;
}

export interface PublicOrderSettings {
  onlineOrderingOpen: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  cashOnDeliveryEnabled: boolean;
  onlineCardEnabled: boolean;
  prepTimeMinutes: number;
  /** Weekly opening schedule (tenant-authored JSON), or null when the tenant
   *  takes orders whenever ordering is switched on. Shape is owned by the
   *  backend (src/utils/orderHours.ts) — treat it as opaque here and trust
   *  `withinOrderHours` for the verdict. */
  orderHours?: unknown;
  /** Server-computed "are we open right now?", evaluated in the tenant's own
   *  timezone — never recompute this client-side. */
  withinOrderHours?: boolean;
}

/** Verdict for a customer's map pin, from POST /public/order/check-address.
 *  Never an error for out-of-range: `inRange: false` is a normal answer.
 *  `needsManualZone` means the tenant has no coordinates of its own, so there
 *  is nothing to measure a distance from and the customer must pick a zone by
 *  hand (the pre-v2 flow). */
export interface AddressCheckResult {
  inRange: boolean;
  distanceMeters: number | null;
  needsManualZone: boolean;
  zone: { id: string; name: string; deliveryFee: number; minOrderAmount: number } | null;
  maxDeliveryMeters?: number | null;
}

export type FulfillmentType = 'DELIVERY' | 'PICKUP';
export type PaymentMethod = 'CASH_ON_DELIVERY' | 'ONLINE_CARD';

export interface CartLineInput {
  menuItemId: string;
  quantity: number;
  modifierOptionIds?: string[];
}

/** Client-side cart line for the UI (adds display fields + a stable grouping
 *  key on top of the wire shape above). unitPriceEstimate is a client-side
 *  estimate for instant UI feedback only — every screen that shows a
 *  trustworthy total re-fetches /quote rather than trusting this. */
export interface CartEntry {
  key: string; // menuItemId + sorted modifierOptionIds + note, so identical picks merge quantity
  menuItemId: string;
  name: string;
  imageUrl?: string | null;
  unitPriceEstimate: number;
  quantity: number;
  modifierOptionIds: string[];
  modifierSummary: string;
  /** Free-text instruction for this line ("no onions"). There is no
   *  `OrderItem.note` column, so this is not a wire field: the flow folds each
   *  line's note into the order-level `customerNote` at placement, prefixed
   *  with the dish name, so the kitchen still receives it. */
  note?: string;
}

export interface QuotedModifier {
  id: string;
  name: string;
  priceAdjust: number;
}

export interface QuotedLine {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  modifiers: QuotedModifier[];
}

export interface OrderQuote {
  subtotal: number;
  deliveryFee: number;
  total: number;
  zoneId?: string;
  meetsMinimum: boolean;
  // Only set for DELIVERY — the resolved zone's minimum, straight from the
  // backend's authoritative quote. Prefer this over a separately-fetched
  // zone's minOrderAmount (which can be stale, or absent if the zone was
  // deactivated/isn't in the current active-zones list) when reporting why
  // a quote is below minimum.
  minOrderAmount?: number;
  prepTimeMinutes: number;
  /** Straight-line distance from the restaurant to the customer's pin. Only
   *  present for DELIVERY quotes that carried a pin and where the tenant has
   *  its own coordinates set. */
  distanceMeters?: number;
  lines: QuotedLine[];
}

export interface InlineAddressInput {
  fullAddress: string;
  neighborhood?: string;
  lat?: number;
  lng?: number;
  zoneId?: string;
  label?: string;
  note?: string;
  save?: boolean;
}

export interface PlaceOrderInput {
  items: CartLineInput[];
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  customerNote?: string;
  address?: InlineAddressInput;
}

export interface OrderItemRecord {
  id: string;
  menuItemId: string | null;
  nameSnapshot: string;
  unitPrice: number;
  quantity: number;
  modifiersSnapshot: QuotedModifier[] | null;
}

export interface OrderRecord {
  id: string;
  orderNumber: number;
  fulfillmentType: FulfillmentType;
  status: string;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  prepTimeMinutes: number | null;
  readyBy: string | null;
  customerNote: string | null;
  createdAt: string;
  items: OrderItemRecord[];
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function fetchOrderSettings(restaurantId: string): Promise<PublicOrderSettings> {
  const res = await client.get('/public/order/settings', { headers: tenantHeaders(restaurantId) });
  return res.data.data;
}

export async function fetchOrderableMenu(restaurantId: string): Promise<OrderableMenuCategory[]> {
  const res = await client.get('/public/order/menu', { headers: tenantHeaders(restaurantId) });
  return res.data.data.categories;
}

export async function fetchDeliveryZones(restaurantId: string): Promise<PublicDeliveryZone[]> {
  const res = await client.get('/public/order/zones', { headers: tenantHeaders(restaurantId) });
  return res.data.data;
}

/** `lat`/`lng` are the customer's map pin. When they're sent and the tenant
 *  has its own coordinates, the backend resolves the delivery zone and fee
 *  from the pin and *ignores* any `zoneId` in this payload — `zoneId` is only
 *  the fallback for tenants with no location set. */
export async function fetchQuote(
  restaurantId: string,
  payload: {
    items: CartLineInput[];
    fulfillmentType: FulfillmentType;
    zoneId?: string;
    lat?: number;
    lng?: number;
  }
): Promise<OrderQuote> {
  const res = await client.post('/public/order/quote', payload, { headers: tenantHeaders(restaurantId) });
  return res.data.data;
}

export async function checkAddress(
  restaurantId: string,
  body: { lat: number; lng: number }
): Promise<AddressCheckResult> {
  const res = await client.post('/public/order/check-address', body, { headers: tenantHeaders(restaurantId) });
  return res.data.data;
}

export async function requestOtp(restaurantId: string, phone: string): Promise<{ expiresAt: string }> {
  const res = await client.post('/public/order/otp/request', { phone }, { headers: tenantHeaders(restaurantId) });
  return res.data.data;
}

export async function verifyOtp(
  restaurantId: string,
  payload: { phone: string; code: string; name?: string; trustDevice?: boolean }
): Promise<{ token: string; customer: { id: string; name: string; phone: string } }> {
  const res = await client.post('/public/order/otp/verify', payload, { headers: tenantHeaders(restaurantId) });
  return res.data.data;
}

export async function placeOrder(restaurantId: string, payload: PlaceOrderInput): Promise<OrderRecord> {
  const res = await client.post('/public/order', payload, { headers: tenantHeaders(restaurantId) });
  return res.data.data;
}

export async function fetchMyOrders(restaurantId: string): Promise<OrderRecord[]> {
  const res = await client.get('/public/order/mine', { headers: tenantHeaders(restaurantId) });
  return res.data.data;
}

interface ApiErrorEnvelope {
  code?: string;
  error?: string;
  message?: string;
}

function extractErrorData(error: unknown): ApiErrorEnvelope | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return undefined;
  const response = (error as { response?: { data?: unknown } }).response;
  const data = response?.data;
  return typeof data === 'object' && data !== null ? (data as ApiErrorEnvelope) : undefined;
}

/** Best-effort extraction of the backend's already-localized error message
 *  (see src/utils/response.ts's errorResponse — `message` is translated
 *  server-side from Accept-Language), same pattern waitlist/page.tsx uses. */
export function orderApiErrorMessage(error: unknown, fallback: string): string {
  const data = extractErrorData(error);
  return data?.message || data?.error || fallback;
}

export function orderApiErrorCode(error: unknown): string | undefined {
  return extractErrorData(error)?.code;
}
