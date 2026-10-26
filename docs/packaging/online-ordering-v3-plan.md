# Online Ordering v3 — Tracking, Test Account, Polish

Follows v2 (`online-ordering-v2-plan.md`, shipped 2026-08-29, branch `agent/ordering-v2`,
not yet merged to `main`). This round targets what v2 deliberately deferred: live
tracking that feels like a delivery app, a safe way to test the order flow without a
real SMS provider, and UI/feature polish. Scoped with the user 2026-09-04.

## Product decisions (locked with the user, 2026-09-04)

1. **Test account = per-number TOTP, not a shared static code.** A small allowlist of
   "test phone numbers" (SUPER_ADMIN-managed) bypass real SMS entirely. Each test number
   is bound to its own TOTP secret (reusing `src/utils/totp.ts`, the same primitive
   already used for staff 2FA) enrolled once via a QR code into the user's own
   authenticator app. `requestOtp` for a test number skips `sendSms`; `checkOtp` verifies
   the submitted code against that number's TOTP secret instead of a stored hash. No
   shared secret ever sits in code/env/logs, works in every environment including prod,
   and every use is audit-logged as a test-bypass event. Explicitly *not* a fixed magic
   code — the whole point is nothing guessable or leakable authorizes the bypass, only
   possession of the enrolled authenticator.
2. **Live tracking = status/SSE/push for v1, no live courier GPS yet.** The user picked
   "status + ETA only" for tracking depth but also flagged the delivery-map tier as
   in-scope to build now. Reconciled as: ship a **static** map (restaurant pin + customer
   pin + straight-line ETA badge) once an order is `OUT_FOR_DELIVERY`, driven by the same
   SSE stream — not a moving live courier position. Full live-GPS courier tracking (new
   Courier/staff-delivery model, phone geolocation sharing, moving map marker) is
   deferred to a v4 and only gets built if the static version isn't enough — it's the one
   item here with real net-new data-model scope. **Flagging this interpretation
   explicitly for the user to confirm or override before B3 starts.**
3. **Mobile app = installable PWA, not native.** Manifest + service worker on the
   existing `frontend/src/app/r/[slug]/order` surface; push notifications via the Web
   Push API. No React Native / app-store track.
4. **Security bar for all of this**: no new attack surface on production. Every new
   endpoint tenant/permission-scoped per `CLAUDE.md`; the test-bypass allowlist is
   SUPER_ADMIN-only to manage, capped in size, never exposed to tenant staff, and must
   not weaken `MAX_ATTEMPTS`/rate-limit/ban checks for non-test numbers. Web Push
   subscriptions scoped per customer+restaurant, unsubscribed on order completion/logout.

## Scope

### B1 — Test-phone TOTP bypass
- Schema: small new table (or a JSON column on a platform-level settings row —
  TBD at build time) holding `{ phone, totpSecret, label, createdAt }`, global
  (not per-tenant) since the user tests across any restaurant's storefront.
- `POST /api/system/test-phones` (SUPER_ADMIN only): enroll a number, returns the
  `otpauth://` QR provisioning URI (via `buildOtpAuthUrl`) — shown once, never
  re-displayed. `DELETE` to revoke.
- `otpService.requestOtp`: if `phone` is an enrolled test number, skip `sendSms`
  entirely (no OTP row with a random code — or write one but ignore it), return
  success as normal so the frontend flow is identical.
- `otpService.checkOtp`: if `phone` is an enrolled test number, verify via
  `verifyTotp(secret, code)` (±1 step window) instead of the hash comparison; still
  goes through `isPhoneBanned` and the existing per-phone rate limits so it's a
  faithful test of the real flow.
- Audit log entry on every test-bypass use (distinct from normal OTP audit trail, if
  any exists) so test traffic is never mistaken for real customer traffic in metrics.
- i18n strings for the enrollment UI (new, small `/system-admin` panel).

### B2 — Real-time tracking + notifications
- Customer tracking moves off the 20s poll onto the existing SSE order stream
  (`lib/orders/stream.ts` infra, currently staff-only) — new customer-scoped stream
  filtered to their own order id, auth'd by the existing trusted-device/OTP session.
- Web Push: service-worker registration + subscription stored per customer, a new
  send-on-status-change hook in the order status transition path (reuse
  `notificationService`/`messaging` patterns). Falls back gracefully (no permission
  granted → tracking still works via SSE while the tab is open).
- SMS status pings at key transitions (confirmed / ready / out for delivery) reusing
  `sendSms` — currently only wired for reservations, not orders.
- Live countdown/progress bar off `readyBy` instead of a static timestamp line.

### B3 — Static delivery map
- `CartFulfillmentStep`'s existing `LeafletMap` component reused read-only on
  `OrderPlacedView` once `fulfillmentType === 'DELIVERY' && status === 'OUT_FOR_DELIVERY'`:
  restaurant pin + customer pin (from `addressSnapshot`/lat-lng), a fitted bounds view,
  ETA badge from `readyBy`. No new backend beyond exposing the two pins already on the
  order.

### B4 — Feature completeness
- Order rating (1–5 stars + optional comment) prompted after `COMPLETED`, stored
  against the order, surfaced to staff (not blended into the separate Google-reviews
  feature).
- Customer self-service cancel while status is still `NEW`/`ACCEPTED` (staff can already
  reject; customers currently cannot cancel their own order).
- Order receipt: print/PDF-friendly itemized view (reuse `components/orders/print`
  templates already built for staff).
- Promo codes / discounts — flagged as the largest item in this tier; scope to be
  sized separately if prioritized (new model, redemption limits, staff management UI).

### B5 — UI polish
- Skeleton loaders replacing spinners on menu/cart/checkout.
- Cart micro-interactions (add-to-cart fly/confirm animation).
- Empty states (empty cart, no past orders).
- Dark-mode variant for the public order theme system.
- PWA manifest + install prompt + icon set.

## Non-negotiables (carry over from v2, still apply)

- Every tenant-scoped query filtered by `restaurantId`; new routes mounted behind
  `tenantMiddleware` in `src/app.ts`. The test-phone table is the one deliberate
  exception (platform-level, SUPER_ADMIN-scoped, not tenant data).
- Recompute all prices/fees/eligibility server-side; never trust client values.
- New user-facing strings added to `en.json` **and** `tr.json` together.
- Never expose raw UUIDs in dashboard selects — map id → human name.
- Postgres everywhere; schema changes go through `prisma migrate` + `prisma generate`.
- `frontend/` is Next.js 16 / React 19 — check `node_modules/next/dist/docs/` before
  relying on remembered APIs; Leaflet components need `ssr:false`.
- Security bar: no bypass logic may weaken checks for real customer numbers; test
  allowlist is SUPER_ADMIN-only and audited.

## Status

2026-09-04: Plan drafted and scoped with the user (all of B1–B5 approved to build,
B3 depth explicitly narrowed to static map pending user confirmation). Not started.
