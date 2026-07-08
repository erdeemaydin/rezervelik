# Online Ordering ("Sipariş") — Phased Implementation Plan

Status: **PLAN ONLY — not started.** Companion to `online-ordering-spec.md` (the decided-details
brief). This grounds the spec in the actual codebase and sequences the work. Confirm the Open
Questions (§ bottom) before writing any code.

---

## Phase 0 — Foundations (½ day, shared by all phases)

**Feature gate.** Add `hasOnlineOrdering` to the tenant feature flags (same place the other
`docs/packaging/` add-ons live — Restaurant/RestaurantSettings or the flags block toggled in
`systemController`). SysAdmin-only toggle in `/system-admin/tenants/:id`. Everything below is
hidden/404 when off.

**Tenant order settings.** New `OrderSettings` (1:1 with `Restaurant`): `onlineOrderingOpen`
(manual kill-switch), `deliveryEnabled`, `pickupEnabled`, `cashOnDeliveryEnabled`,
`onlineCardEnabled`, `maxConcurrentOrders` (capacity throttle), default `prepTimeMinutes`,
order-hours JSON.

---

## Phase 1 — Cash-on-delivery, end to end (the bulk of the work)

### 1a. Schema (`prisma/schema.prisma`)

New models — all tenant-scoped, `@@index([restaurantId])`:

```
Customer            id, restaurantId, phone, phoneVerifiedAt, name, email?, passwordHash?
                    @@unique([restaurantId, phone])   // distinct from Guest/User
CustomerAddress     id, customerId, restaurantId, label, neighborhood/mahalle,
                    fullAddress, lat?, lng?, zoneId?, note?
TrustedDevice       id, customerId, tokenHash, userAgent?, lastUsedAt, revokedAt?
                    // long-lived httpOnly token → skip OTP on known device
OtpChallenge        id, restaurantId, phone, codeHash, purpose, attempts, expiresAt,
                    consumedAt?, ip   // hashed, rate-limited, never logged raw
DeliveryZone        id, restaurantId, name, matchType(RADIUS|AREA), radiusMeters?/polygon?,
                    deliveryFee, minOrderAmount, isActive, openHours JSON
Order               id, restaurantId, customerId, orderNumber (human, per-tenant seq),
                    fulfillmentType(DELIVERY|PICKUP), status(enum below),
                    paymentMethod(CASH_ON_DELIVERY|ONLINE_CARD),
                    paymentStatus(UNPAID|PAID|REFUNDED),
                    addressSnapshot?, zoneId?, deliveryFee, subtotal, total,
                    prepTimeMinutes, readyBy?, customerNote?, paymentId? (Phase 2)
OrderItem           id, orderId, menuItemId, nameSnapshot, unitPrice, quantity,
                    modifiersSnapshot JSON   // snapshot: menu edits must not mutate history
MenuItem (extend)   + isOrderableOnline Boolean @default(false)
                    + prepTimeMinutes Int?    // distinct from existing durationMinutes
```

Enums: `OrderStatus { NEW, ACCEPTED, PREPARING, READY, OUT_FOR_DELIVERY, COMPLETED, CANCELLED,
REJECTED }` + the fulfillment/payment enums above.

**Why snapshots:** order history and printed slips must stay correct after a tenant edits/deletes
a menu item or price — never join live `MenuItem` for historical totals.

Then `npm run prisma:migrate` + `npm run prisma:generate`.

### 1b. Backend — services & middleware

- **`customerAuth` middleware** (`src/middlewares/customerAuth.ts`): validates the customer
  session / trusted-device token; separate from staff `auth.ts`. Attaches `req.customer`.
- **OTP service** (`src/services/otpService.ts`): generate → hash → store `OtpChallenge` →
  `sendSms()` (reuse `src/services/messaging`, Netgsm). Verify with attempt caps + expiry.
  Rate-limit per-phone + per-IP.
- **Pricing service** (`src/services/orderPricingService.ts`): single server-side authority —
  resolves zone from address, computes subtotal from live menu + modifiers, applies zone fee +
  min-order, returns authoritative total. Client values display-only.
- **Realtime**: SSE endpoint (`GET /api/orders/stream`, staff-auth) broadcasting new/updated
  orders per `restaurantId`. SSE over WebSocket for simplicity on Express; in-process
  `EventEmitter` per tenant for v1 (single node — see Open Q on multi-node).

### 1c. Backend — routes (mounted in `src/app.ts`)

Public (customer), `/api/public/order/*` (restaurant via slug/header like existing public routes):
`POST /otp/request`, `POST /otp/verify` (issues session + trusted-device token), `GET /menu`
(orderable only), `POST /quote` (server-side price/zone preview), `POST /` (place order),
`GET /mine` (history, customer-auth).

Staff, `/api/orders` behind `tenantMiddleware` + `authMiddleware`: `GET /` (board),
`GET /stream` (SSE), `PATCH /:id/status`, `GET /customers`, `GET /customers/:id`.
Config: `GET/PUT /order-settings`, CRUD `/delivery-zones`, `PATCH /menu/:id/orderable`.

### 1d. Frontend — customer (`frontend/src/app/r/[slug]/order/`)

Mobile-first, tenant-branded (reuses `r/[slug]` layout/theme), bilingual: menu → cart →
fulfillment/address (live zone+fee resolution) → phone identify (trusted device auto-passes;
else OTP sheet; optional password) → payment method → confirm → live status + `/order/mine`
history. All money labels come from server `quote`.

### 1e. Frontend — staff order-station portal

Separate portal route (e.g. `frontend/src/app/order-station/`) with its own full-screen layout
(NOT dashboard chrome), for an always-on tablet/PC: live board, SSE-driven, audible chime on new
order, one-tap status advance, auto-print. Plus in the normal dashboard: `dashboard/orders`
(history/customers) and `dashboard/orders/settings` (zones, payment methods, capacity, menu
online toggles).

### 1f. Printing

Order-station triggers silent thermal printing. **Recommended: QZ Tray** (local agent, ESC-POS,
silent, cross-platform) — station talks to `localhost`, no server changes. Two templates: kitchen
ticket (items + modifiers + note, no prices) and delivery/customer invoice (itemized + fees +
total + address). Fallback: browser `window.print()` if QZ absent. Needs on-site hardware —
confirm printer model early.

### 1g. i18n & polish

All strings into `en.json` + `tr.json` together (TR-first copy: "Sipariş Ver", "Paket Servis",
"Gel-Al", "Kapıda Ödeme"…). Warm palette, no raw UUIDs in selects.

---

## Phase 2 — Online card via marketplace sub-merchant

Extends the existing `src/services/payments/` abstraction, not a rebuild:
- Add sub-merchant capability to the provider (iyzico Pazaryeri **or** PayTR marketplace — Open Q).
  Extend `PayTRProvider` / add `IyzicoProvider` implementing the same `types.ts` interface.
- Sub-merchant onboarding flow in dashboard (tenant KYC → status tracked); encrypt creds at rest.
- Order flow gains an `ONLINE_CARD` branch → reuse `Payment` model + hosted checkout +
  `applyCallback` → on success set `Order.paymentStatus = PAID` and release to the board. Handle
  split/commission + refund + reconciliation.
- Cash-on-delivery orders unaffected — Phase 1 keeps working with zero payment dependency.

---

## Phase 3 — Fast-follows

WhatsApp OTP channel (drop-in behind the OTP channel interface), ordering analytics into the
existing analytics surface, coupons/promos.

---

## Reused existing infrastructure (do NOT rebuild)

- **SMS/OTP**: `src/services/messaging/` (`sendSms`, Netgsm-backed, placeholder until creds).
- **Online payments**: `src/services/payments/` (provider abstraction, `PayTRProvider`,
  `types.ts`) + `src/services/paymentService.ts` + `Payment` model (merchantOid, hosted-iframe
  checkout, `applyCallback`). Marketplace = a sub-merchant extension.
- **Menu**: `MenuItem` + `MenuItemModifier`/`ModifierOption` (has `price`, `isAvailable`,
  `priceAdjust`) — add orderable flag + prep time, don't fork.
- **Notifications**: `src/services/notificationService.ts`.
- **Identity**: `Guest` is event-RSVP only → new `Customer` model; never mix with staff `User`.

---

## Open questions to resolve before building

1. **Gateway (Phase 2):** iyzico Pazaryeri vs PayTR marketplace? Is the existing PayTR account
   marketplace-capable, or use iyzico for the split model? (Affects KYC + provider work.)
2. **Realtime scaling:** single Node process, or multi-instance (pm2 cluster) in prod? In-process
   SSE emitter works single-node; multi-node needs Postgres `LISTEN/NOTIFY` or Redis pub/sub.
   (Prod is pm2 on your-server-ip — how many instances?)
3. **Printer:** confirmed thermal model + connection (USB vs network IP)? Determines QZ Tray vs
   direct ESC-POS-over-IP.
4. **Feature-flag location:** where does `hasOnlineOrdering` / the packaging add-on gating live
   today (Restaurant vs RestaurantSettings vs a flags JSON)? Match the existing add-on toggle.
5. **Customer identity uniqueness:** phone unique **per tenant** (same person at 2 restaurants =
   2 Customer rows) — confirm (assumed; simpler, correct for multi-tenant).
6. **Order numbering:** per-tenant human sequence (e.g. `#1042`) — daily reset or continuous?
