# Online Ordering ("Sipariş") — Add-on Feature Spec

Status: **DECIDED — pending implementation plan approval**
Market: local Turkish restaurants (TR default, EN second). Optional per-tenant add-on,
SysAdmin-toggled like the other `docs/packaging/` add-ons.

> Do NOT start coding from this file alone. It is the decided-details brief. Read
> `docs/architecture/PROJECT_LOGIC.md`, `docs/architecture/API_DOCS.md`, and `docs/packaging/` first, then follow the phased
> plan (below) and confirm open questions before each phase.

---

## 1. Locked product decisions

| Area | Decision |
|---|---|
| Fulfillment | **Delivery (paket servisi) + Pickup (gel-al)**. No dine-in/table ordering in v1. |
| Payment | **Cash/card on delivery (kapıda ödeme)** + **online card**, tenant-configurable per order type. |
| Online-card money flow | **Platform marketplace / sub-merchant** (iyzico Pazaryeri or PayTR marketplace); platform splits to tenant sub-merchant, may take commission. Ships in Phase 2 — cash-first in Phase 1. |
| OTP | **SMS via Netgsm**, behind a channel interface (WhatsApp later). |
| Customer identity | **Phone = primary identity, SMS-OTP verified; optional password/email** for cross-device login. |
| Staff order intake | **Real-time push (SSE/WebSocket) + audible chime** on a **separate order-station portal**. |
| Printing | Thermal **kitchen ticket + delivery/customer invoice**, silent auto-print from the portal. |
| Delivery logistics | **Zones & rules**: zones (mahalle/radius) each with fee + min order; open/closed hours; capacity throttling; per-item prep time. |
| Feature gating | Per-tenant SysAdmin toggle; hidden entirely when off. |

## 2. Reuse existing infrastructure (do NOT rebuild)

- **Menu**: reuse `MenuItem` + `MenuItemModifier`/`ModifierOption` (has `price`, `isAvailable`,
  `priceAdjust`). Add an online-orderable flag + prep-time layer; do not fork the menu.
- **SMS/OTP**: reuse `src/services/messaging/` (`sendSms`, Netgsm-backed, placeholder until creds).
- **Online payments**: reuse `src/services/payments/` (provider abstraction, `PayTRProvider`,
  `types.ts`) + `src/services/paymentService.ts` + the `Payment` model pattern (merchantOid,
  hosted-iframe checkout, callback via `applyCallback`). Marketplace = a sub-merchant extension
  of the provider, not a new integration.
- **Notifications**: reuse `src/services/notificationService.ts`.
- **Identity**: `Guest` is event-RSVP only — create a NEW `Customer` model; never mix with staff `User`.

## 3. Non-negotiable integration constraints

- Backend Express + Prisma + Postgres. New route groups mounted in `src/app.ts` behind
  `tenantMiddleware` (X-Restaurant-ID); public customer endpoints under `/api/public/*`.
- Every tenant-scoped query filtered by `restaurantId`.
- Staff auth uses existing JWT/role middleware. Customer sessions are a **separate** auth path.
- Standard error envelope `{code,error,message,details}` + `AppError` + `req.t` i18n.
- Frontend Next.js 16 App Router / React 19. Customer UI under `r/[slug]`; admin under
  `dashboard/*` using persistent `layout.tsx` (no self-wrapping `AdminLayout`); per-tenant admin
  theme + warm hospitality palette (no generic indigo/violet).
- New user-facing strings added to `en.json` **and** `tr.json` together.
- Never expose raw UUIDs in dropdowns (map id → human name).

## 4. Security requirements (core)

- Phone must be **SMS-OTP verified before first order**. Returning customers skip OTP via a
  long-lived, **revocable trusted-device token** (httpOnly, per-device, bound to customer);
  new device/phone re-triggers OTP.
- OTP: hashed at rest, short expiry, attempt caps, per-phone + per-IP rate limits, resend
  cooldown, lockout/backoff. Never log raw OTPs.
- Recompute **all** totals, fees, minimums, and zone eligibility **server-side** from DB; never
  trust client-sent prices/fees.
- Rate-limit order creation per customer/phone/IP. Encrypt gateway/sub-merchant secrets at rest;
  never expose to frontend. Customer PII tenant-scoped.

## 5. Flows (summary)

**Customer** (`r/[slug]`, mobile-first, tenant-branded, bilingual): browse orderable menu →
cart (min-order/zone-fee aware) → choose Delivery (address→zone→fee/min/availability) or Pickup
(ready-by) → identify by phone (trusted device passes; else OTP; optional password login) →
choose enabled payment method → place order → live status tracking + "my orders" history.

**Staff order portal** (separate station app): live board (New → Accepted → Preparing → Ready →
Out for delivery / Ready for pickup → Completed/Cancelled), realtime push + chime, accept/reject,
advance status, auto-print kitchen + delivery slips.

**Dashboard**: customer order-history view, menu online-availability toggles, delivery-zone/rules
editor, payment-method config, online open/closed + capacity, gateway/sub-merchant onboarding.

## 6. Phasing

- **Phase 1 — Cash-on-delivery, end-to-end.** Schema, customer flow, OTP + trusted device,
  zones/rules, order-station portal w/ realtime + printing, admin customer-history & config. No
  online card yet.
- **Phase 2 — Online card via marketplace sub-merchant.** Sub-merchant onboarding, payment split,
  refunds, reconciliation (extends existing payments provider).
- **Phase 3 — Fast-follows.** WhatsApp OTP channel, ordering analytics, promos/coupons.

See the approved implementation plan for schema, route map, and open questions per phase.
