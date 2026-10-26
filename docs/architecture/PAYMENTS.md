# Reservation Deposit Payments

How the reservation deposit / prepayment system works, how it stays trustworthy,
and how to swap the payment provider. Companion to `docs/architecture/PROJECT_LOGIC.md` and
`docs/architecture/API_DOCS.md`.

Default gateway: **PayTR** (hosted iframe). Provider is pluggable — see
§7 "Swapping providers". A **Mock** provider ships for local testing.

---

## 1. What it does

When a restaurant enables paid reservations and sets a deposit amount, guests pay
a deposit to secure the booking. The booking is only **confirmed once the deposit
is paid**. There are two moments a deposit can be collected:

- **Trigger A — Instant (auto-confirm days):** the guest pays right after booking.
- **Trigger B — Manual accept:** on non-auto-confirm days, staff accept the
  request first, then the guest gets a payment link/code.

Card data is entered **only in the gateway's hosted iframe** (PayTR, BDDK-licensed),
never on our pages or servers → PCI **SAQ A**.

---

## 2. Trust & anti-phishing design (why guests can trust it)

The concern: *"people won't trust an SMS link to enter card details."* The design
addresses this on several layers:

1. **Card entry happens in the gateway's hosted iframe**, not a form we built.
   The customer sees the recognizable, BDDK-licensed PayTR secure screen with 3-D
   Secure — the same checkout they see on other Turkish e-commerce sites. We never
   see or store the PAN.
2. **The link lands on a branded page on our domain** (`/pay/<token>`) showing the
   **restaurant's logo/colours, the reservation summary (date, time, party) and the
   exact amount** — so it's obviously contextual to the booking they just made, not
   a random request.
3. **A short human code as an alternative to the link.** Every payment also has an
   8-character code (e.g. `K7P2M9QR`). Instead of trusting the SMS link, the guest
   can go to the restaurant's known site and type the code at `/pay` → same session.
   This is the classic anti-phishing pattern: *navigate to the site you trust, then
   enter a reference.*
4. **Explicit safety copy**: "staff will never ask for your card over phone/SMS;
   card details are only entered on the secure gateway screen."
5. **Unguessable, single-use, expiring links.** The link uses a 256-bit random
   token; only its SHA-256 hash is stored (never the raw token). Links expire
   (default 60 min) and a paid/failed session can't be re-driven.
6. **Server-to-server callback is the source of truth**, cryptographically verified
   (HMAC) — the "paid" state never depends on the browser redirect, which could be
   faked.

---

## 3. The two flows

### Trigger A — Instant deposit (auto-confirm day)
```
Guest books on public site (day has autoConfirm = ON, paid reservations enabled)
        │
        ▼
POST /api/reservations  →  reservation created as AWAITING_PAYMENT
                           + Payment row (PENDING) + link token + code
        │  response { payment: { token, code, url, amount } }
        ▼
Browser redirects to  /pay/<token>   (branded page)
        │
        ▼
Page loads PayTR hosted iframe  →  guest enters card in PayTR (3-D Secure)
        │
        ├─(server-to-server)→ PayTR POSTs /api/public/payment/callback  ← source of truth
        │                         verify HMAC → Payment PAID → Reservation CONFIRMED + isPaid
        ▼
Page polls session → sees PAID → shows "Payment received, reservation confirmed"
```

### Trigger B — Manual accept (non-auto-confirm day)
```
Guest books  →  reservation PENDING (no payment yet)
        │
        ▼
Staff click "Accept" (PUT /api/reservations/:id/status {status:CONFIRMED})
        │   paid reservations enabled & not already paid?
        ▼
Payment row (PENDING) created  →  reservation AWAITING_PAYMENT
        │   SMS/e-mail sent to guest with link + code  (notificationService)
        │   staff also see the link+code in a dialog to relay
        ▼
Guest opens /pay/<token>  (or /pay → types code)  →  same iframe flow as above
        ▼
callback → Payment PAID → Reservation CONFIRMED + isPaid
```

Staff can bypass payment for a booking (trusted regular, deposit taken in person)
by sending `skipPayment: true` with the status update.

---

## 4. Gating rules (exact)

A deposit is only taken when **all** hold:

| Condition | Where |
|---|---|
| `RestaurantSettings.isPaidReservationEnabled = true` | tenant setting |
| `RestaurantSettings.depositAmount > 0` | tenant setting |
| For **Trigger A**: the day's `DaySetting.autoConfirm = true` **and** the booking would otherwise auto-confirm (table assigned, no conflict) **and** the request is a public/guest booking (not staff-created) | `createReservation` |
| For **Trigger B**: staff accept (→CONFIRMED) a not-yet-paid reservation, `skipPayment` not set | `updateReservationStatus` |

If paid reservations are disabled or the deposit is 0, everything behaves exactly
as before (no payment step).

---

## 5. Architecture & files

```
Provider abstraction (swap point)
  src/services/payments/types.ts          PaymentProvider interface
  src/services/payments/PayTRProvider.ts   PayTR hosted-iframe adapter (get-token + callback verify)
  src/services/payments/MockProvider.ts    dev/test adapter (no live gateway)
  src/services/payments/index.ts           getPaymentProvider() factory (env-driven)

Domain logic (provider-agnostic)
  src/services/paymentService.ts           create session, resolve by token/code, applyCallback (idempotent)
  src/services/notificationService.ts      SMS/e-mail stub (payment link + code)
  src/controllers/paymentController.ts      public session/callback/mock + admin list
  src/controllers/reservationController.ts  Trigger A (createReservation) + Trigger B (updateReservationStatus)

Routes
  POST /api/public/payment/callback         gateway server-to-server notification
  GET  /api/public/payment/session/:ref     branded page data + fresh iframe URL (ref = token OR code)
  POST /api/public/payment/mock/complete    dev-only simulate (guarded to PAYMENT_PROVIDER=mock)
  GET  /api/payments                         admin (tenant-scoped) list

Frontend
  frontend/src/app/pay/[ref]/page.tsx        branded payment page (iframe + trust signals + polling)
  frontend/src/app/pay/page.tsx              code-entry (anti-phishing) page
  frontend/src/app/pay/mock/page.tsx         dev mock gateway
  dashboard/reservations                     "Accept" surfaces link+code dialog; AWAITING_PAYMENT status
  dashboard/payments                          real transactions list + totals
```

---

## 6. Data model (`Payment`)

Amounts are stored in **minor units (kuruş)** as integers — never floats.

| Field | Meaning |
|---|---|
| `provider` | which gateway handled it (`PAYTR`/`MOCK`/…) |
| `merchantOid` | our unique order id, echoed back on callback (unique) |
| `providerRef` | gateway-side transaction id |
| `amount` / `currency` | minor units + `TL` |
| `status` | `PENDING → PAID / FAILED / EXPIRED / REFUNDED` |
| `linkTokenHash` | SHA-256 of the raw link token (raw token never stored) |
| `code` | short human code (anti-phishing fallback) |
| `expiresAt` | link/session expiry |
| `rawCallback` | last verified callback JSON (audit) |

`Reservation` gains the `AWAITING_PAYMENT` status; on success it becomes
`CONFIRMED` with `isPaid = true` and `paymentId` set.

---

## 7. Swapping providers — how hard is it?

**Low effort — by design.** Everything the app touches goes through the
`PaymentProvider` interface (`createCheckout`, `verifyCallback`, `callbackAck`).
Controllers, routes, DB, the reservation gating and the whole frontend are
**provider-agnostic**. To move to iyzico / Stripe / Craftgate / PayTR-Direct:

1. Write one adapter `src/services/payments/<X>Provider.ts` implementing the
   interface (3 methods).
2. Register it in `getPaymentProvider()` and set `PAYMENT_PROVIDER=<x>`.
3. Point the gateway's webhook at the existing `/api/public/payment/callback`.

Nothing else changes. The only assumptions the abstraction bakes in:
- a **hosted/redirect checkout** returning a URL to embed (all major TR/global
  providers offer this: iyzico Checkout Form, Stripe Checkout, Craftgate, etc.);
- a **signed server-to-server callback** we can verify and map back via an order id.

Both are industry-standard, so a provider change is ~1 file + env, typically a day
including testing. The `MockProvider` is living proof the seam works: the entire
flow runs against it with zero PayTR code.

> Note: we deliberately chose PayTR's **hosted iFrame** over the **Direct API**
> (evaluated against PayTR's official Direct API sample). Direct API means collecting
> the raw card number on our page (PCI SAQ D + the exact "untrusted form" trust
> problem). Hosted iframe keeps us at SAQ A and is the trust-optimal choice; it can
> still be swapped for Direct or any provider through the same interface.

---

## 8. Environment variables

```bash
# Which gateway is live
PAYMENT_PROVIDER=mock            # 'mock' (default, dev) | 'paytr'

# PayTR platform account (single/marketplace account — see below)
PAYTR_MERCHANT_ID=xxxxxx
PAYTR_MERCHANT_KEY=xxxxxxxxxxxxxxxx
PAYTR_MERCHANT_SALT=xxxxxxxxxxxxxxxx
PAYTR_TEST_MODE=1                # '1' test, '0' live

# URLs used to build links & the callback
APP_PUBLIC_URL=https://app.example.com     # frontend base (payment links)
API_PUBLIC_URL=https://api.example.com     # backend base (PayTR must reach /api/public/payment/callback)

# Mock provider only
MOCK_PAYMENT_SECRET=change-me
```

**Credentials are platform-level** (one PayTR account collects all deposits; you
reconcile/pay out tenants). If you later move to per-tenant merchant accounts,
add a `PaymentConfig` model keyed by `restaurantId` and have `PayTRProvider` read
its creds per request — the rest of the system is unaffected.

---

## 9. PayTR specifics (isolated in `PayTRProvider.ts`)

- **get-token** `POST https://www.paytr.com/odeme/api/get-token` — returns
  `{status:'success', token}`; we embed `https://www.paytr.com/odeme/guvenli/<token>`.
- **Token hash:** `HMAC-SHA256(merchant_id + user_ip + merchant_oid + email +
  payment_amount + user_basket + no_installment + max_installment + currency +
  test_mode + merchant_salt, merchant_key)` → base64.
- **Amount:** integer **kuruş** (`amount * 100`).
- **Callback verify:** `HMAC-SHA256(merchant_oid + merchant_salt + status +
  total_amount, merchant_key)` compared (timing-safe) to posted `hash`; respond
  with the literal `OK` so PayTR stops retrying.

Because we can't live-test without merchant credentials, these formulas are kept in
one file and documented here for easy correction against the merchant panel.

---

## 10. Security properties

- **PCI SAQ A** — card data only in the gateway iframe; never on our servers.
- **Callback is the source of truth** and HMAC-verified; browser redirects are not
  trusted to mark payment.
- **Amount tampering guard** — a success callback whose `total_amount` ≠ our stored
  amount is marked `FAILED`, not paid.
- **Idempotent callbacks** — repeat notifications for a final payment are safely
  acked; unknown order ids are acked to stop retries without side effects.
- **Link tokens** are 256-bit, stored only as SHA-256, single-use, and expire.
- **Codes** are short (convenience) so they rely on expiry + the hosted iframe;
  they never expose card data and can't confirm a payment on their own.

---

## 11. Testing with the mock provider

Set `PAYMENT_PROVIDER=mock`. Booking on an auto-confirm day (with paid reservations
enabled + a deposit) redirects to `/pay/<token>`, whose "iframe" is the local mock
gateway with **Simulate success / fail** buttons. Those call
`/api/public/payment/mock/complete`, which builds a correctly-signed callback
server-side and runs the real `applyCallback` path — so the end-to-end logic
(reservation → AWAITING_PAYMENT → PAID → CONFIRMED) is exercised without PayTR.

Verified flows: instant (A) and manual-accept (B) both reach CONFIRMED/isPaid;
guards confirmed — staff bookings skip payment, and amount-mismatch callbacks fail.

---

## 12. Not yet implemented / next steps

- **Real SMS/e-mail** — `notificationService` is a logging stub; wire Netgsm /
  İleti Merkezi / Twilio / WhatsApp + SendGrid/Resend.
- **Refunds** — add `provider.refund()` + a `REFUNDED` transition (e.g. auto-refund
  on cancellation within policy).
- **No-show fee** — the deposit can be forfeited on `NO_SHOW`; reporting hook.
- **Per-tenant merchant accounts** (see §8) if you move off the marketplace model.
- **Webhook hardening** — restrict callback source IPs and add retry/dead-letter.
