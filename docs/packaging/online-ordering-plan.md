# Online Ordering ("Sipariş") — Phased Implementation Plan

Status: **APPROVED — open questions resolved 2026-08-28, ready to start Phase 0.** Companion to
`online-ordering-spec.md` (the decided-details brief). This grounds the spec in the actual
codebase and sequences the work. See the resolved Open Questions (§ bottom) for the decisions
locked before implementation starts.

---

## Phase 0 — Foundations (½ day, shared by all phases)

**Feature gate.** Add `hasOnlineOrdering` to **`Restaurant`** (not `RestaurantSettings`) —
confirmed 2026-08-28 by checking the existing packaging add-ons: `hasHostedFrontend` and
`hasReservationWidget` (docs/packaging/README.md) both live on `Restaurant` since they're
SysAdmin-toggled *commercial* add-ons, distinct from the `RestaurantSettings.has*Feature`/
`has*` flags that drive *vertical* defaults (`businessProfiles.ts`). Online ordering is a
commercial add-on like those two, not a vertical default. SysAdmin-only toggle in
`/system-admin/tenants/:id`. Everything below is hidden/404 when off.

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
  orders per `restaurantId`. SSE over WebSocket for simplicity on Express. **Decided 2026-08-28:
  build on Postgres `LISTEN/NOTIFY` from day one**, not an in-process `EventEmitter` — the backend
  is expected to run multi-instance eventually (docs/planning/PRODUCTION_ROADMAP.md §8 Phase 3 already plans to
  split/scale it), and an in-process emitter would silently miss orders placed against a different
  instance than the one a given order-station SSE connection landed on. Each backend instance
  `LISTEN`s on a per-restaurant (or single shared, filtered app-side) channel and the order-creation
  transaction does `NOTIFY` with the order id; the SSE handler re-fetches and forwards to its
  connected clients. Redis pub/sub is the fallback if Postgres LISTEN/NOTIFY throughput becomes a
  bottleneck later — not needed to start.

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

**Kitchen role (added 2026-08-28).** A tenant needs to be able to hand a kitchen tablet an
account that can *only* reach the order station — never the rest of the dashboard. The codebase
already has exactly this pattern for front-desk tablets: `role: 'HOST'` is a plain string value
(no enum) that `staffController.OPEN_ROLES` allows any staff-manager to grant, whose permission
set is fixed to `['manage_reservations', 'manage_tables']`
(`frontend/src/app/dashboard/staff/page.tsx`), and which `AdminLayout`/`auth/login/page.tsx`
special-case to redirect straight to `/dashboard/host` instead of the normal nav. Mirror this
exactly for kitchen accounts:
- New role value `KITCHEN`, added to `staffController.ts`'s `OPEN_ROLES` and the staff dialog's
  role dropdown, fixed permission set `['manage_orders']` (new tenant permission key, gates the
  new `/api/orders*` routes the same way `manage_reservations` etc. already gate theirs via
  `requirePermission`).
- Login redirect (`auth/login/page.tsx`): `role === 'KITCHEN'` → `/order-station` (not
  `/dashboard/*` at all, since the station is explicitly outside dashboard chrome — unlike HOST,
  which stays inside `AdminLayout` on a specific page).
- A `KITCHEN` user hitting any `/dashboard/*` URL directly (bookmark, typed URL) should bounce to
  `/order-station`, same defensive intent as the existing HOST→`/dashboard/host` bounce in
  `AdminLayout`'s route-guard `useEffect`.
- Backend: no special-case needed beyond the new `manage_orders` permission key — `requirePermission`
  already treats any role uniformly via the `permissions` string once ADMIN/SUPER_ADMIN bypasses
  are out of the way, exactly like it does for HOST today.

### 1f. Printing

Order-station triggers silent thermal printing, **three separate templates per order** (expanded
2026-08-28 from the original two-template sketch, based on who actually receives each slip):

1. **Kitchen ticket** — items + modifiers + note, **no prices**, fulfillment type + order number,
   timestamp. Printed for every accepted order.
2. **Courier/delivery slip** — printed only when `fulfillmentType === DELIVERY`. Customer name +
   phone, delivery address, order number, COD amount due prominently (so the courier knows what
   to collect) — **not** itemized (the kitchen ticket already carries that). Includes a **QR code
   linking to Google Maps for the delivery address** (`https://www.google.com/maps/search/?api=1&query=<lat,lng
   or URL-encoded address>` — a universal Maps link, no API key needed), generated with
   `qrcode.react`, already a frontend dependency (used today by `QRCodePDFGenerator.tsx` for menu
   QR codes) — reuse it, don't add a new QR library. Store `CustomerAddress.lat`/`lng` when a
   geocode is available so the QR can point at coordinates rather than a text search.
3. **Customer receipt** — itemized items + modifiers + prices, subtotal, delivery fee, total,
   payment method, order number — the delivery-confirmation/receipt copy the customer keeps.

**Recommended: QZ Tray** (local agent, ESC-POS, silent, cross-platform) — station talks to
`localhost`, no server changes. Fallback: browser `window.print()` (one call per template, or a
combined print job) if QZ absent. Needs on-site hardware — confirm printer model early; per the
resolved open question below this isn't a prerequisite to start building.

### 1g. i18n & polish

All strings into `en.json` + `tr.json` together (TR-first copy: "Sipariş Ver", "Paket Servis",
"Gel-Al", "Kapıda Ödeme"…). Warm palette, no raw UUIDs in selects.

### 1h. Standalone hosted pages for all three customer-facing features (added 2026-08-28)

Decision: a tenant should be able to hand out a **single-purpose link/QR code** for reservation,
waitlist, or ordering individually (Instagram bio link, a QR code at the door) without sending
guests through the full multi-section `r/[slug]` page. Two precedents already exist and diverge in
style:
- `r/[slug]/menu` — reuses the tenant's actual chosen layout component (one of 8, `layoutStyle`)
  with a `menuOnly` prop that hides hero/booking sections but keeps full branding.
- `r/[slug]/waitlist` — a separate, generic, non-branded Card form that ignores `layoutStyle`
  entirely.

**Decided 2026-08-28: the new `r/[slug]/book` (reservation-only) page follows the `menu` pattern,
not the `waitlist` one** — reuse each of the 8 layout components' existing booking section via a
new `bookingOnly` prop (hides hero/menu the same way `menuOnly` hides booking/menu), so a
reservation link stays on-brand. This touches all 8 layout components in
`frontend/src/components/public/`, dispatched from `r/[slug]/book/page.tsx` the same way
`r/[slug]/menu/page.tsx` dispatches on `layoutStyle` today.

**Correction (2026-08-28, same day):** `r/[slug]/order` (§1d above) should NOT follow the
8-layout-component pattern — on reflection that's the wrong fit for a multi-step, stateful
cart/checkout flow. `menu`/`book` are each a single self-contained section reused inside 8
existing layout files; a checkout flow (menu → cart → address → OTP → payment → confirm) is
meaningfully more complex, and duplicating that state machine 8 times is a maintenance trap, not
a branding win. Precedent from real commercial sites: checkout is normally **one consistent,
trustworthy UI with the tenant's brand tokens applied** (colors, logo, typography pulled from
`restaurant.customization`), not a structurally different checkout per visual theme — same
principle Shopify/most e-commerce checkouts follow. Build `r/[slug]/order` as a single themed
flow, not a ninth layout component.

**Explicitly out of scope for this round:** embedding these features into a tenant's *own*
existing website (`docs/packaging/`'s Track B — JS/iframe widget, hardened public API,
`publicApiKey`-scoped SDKs). Only the schema foundation for that (`Restaurant.publicApiKey`,
`hasReservationWidget`) exists today; the widget bundle, iframe routes, and `ARCHITECTURE.md`
itself are still unwritten. Standalone `r/[slug]/*` pages (this section) fully cover the
QR-code/Instagram-link use case without that larger, security-sensitive effort (third-party CORS
origins, `frame-ancestors` CSP changes). Revisit the widget as its own initiative once ordering is
stable, not folded into this plan.

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

## Open questions — resolved 2026-08-28

1. **Gateway (Phase 2): deferred.** Build Phase 1 (cash-on-delivery) first — it needs zero payment
   gateway work. Decide iyzico Pazaryeri vs. PayTR marketplace (and confirm whether the existing
   PayTR account is marketplace-capable) when Phase 2 actually starts, not before.
2. **Realtime scaling: plan for multi-instance now.** Postgres `LISTEN/NOTIFY` from day one — see
   Phase 1 §1b above. Not blocked on knowing the exact current pm2 instance count.
3. **Printer: left open, not a build blocker.** Ship against **QZ Tray** (local agent, ESC-POS,
   cross-platform — works with most thermal printers) with a browser `window.print()` fallback.
   Confirming the actual on-site printer model/connection (USB vs. network IP) is a pre-launch
   checklist item for this feature (see roadmap conversation, 2026-08-28), not a prerequisite to
   start Phase 1 development.
4. **Feature-flag location: `Restaurant.hasOnlineOrdering`.** See Phase 0 above — matches the
   `hasHostedFrontend`/`hasReservationWidget` packaging-add-on pattern.
5. **Customer identity uniqueness:** confirmed — phone unique **per tenant**
   (`@@unique([restaurantId, phone])` as originally drafted).
6. **Order numbering:** per-tenant, continuous human sequence (not daily-reset) unless a tenant
   specifically asks otherwise later — simpler to implement and audit correctly under concurrent
   inserts (a `Restaurant`-scoped sequence/counter row, not `COUNT(*)`, to stay race-safe).
7. **v1 fulfillment scope: confirmed delivery + pickup only, no dine-in/table ordering** — kept as
   originally decided in `online-ordering-spec.md` §1. Table-side (QR-scan-at-your-seat) ordering
   is a materially different flow (no address/zone/OTP-identity step; ties into the existing
   `Table`/reservation model instead of `DeliveryZone`) and belongs in a later phase, not folded
   into v1.
