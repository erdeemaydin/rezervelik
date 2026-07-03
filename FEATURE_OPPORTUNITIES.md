# Feature Opportunities & Competitive Roadmap

> A product-level analysis of what this platform already does, where it stands
> against global and local (Turkey/MENA) rivals, and a prioritized backlog of
> features worth building next. Grounded in the actual codebase — every idea
> references the models/controllers it would touch.
>
> Companion docs: `ROADMAP.md` (build status), `PROJECT_LOGIC.md` (domain rules),
> `API_DOCS.md` (endpoints), `CLAUDE.md` (architecture).

---

## 1. Where we are today (verified inventory)

| Area | Status | Notes / code |
|---|---|---|
| Multi-tenancy + RBAC | ✅ Solid | `tenantMiddleware`, roles `SUPER_ADMIN/ADMIN/MANAGER/STAFF/HOST`, `requirePermission` |
| Reservation engine (3 modes) | ✅ Solid | `FIXED_TIME_SLOT / DYNAMIC_DURATION / MANUAL_AVAILABILITY`, conflict window, auto-confirm |
| Interactive timeline | ✅ New | drag-move, vertical table change, resize, click-to-create, configurable hours |
| Floor plan builder | ✅ Solid | drag-drop, per-table color/size/shape, zones (`TableType`), `FloorElement` |
| Digital menu + QR page | ✅ Solid | categories, items, `MenuItemModifier`/`ModifierOption`, pairings, dietary tags, `/r/[slug]/menu` |
| Scheduled price updates | ✅ Solid | `ScheduledPriceUpdate` + `priceUpdater` worker |
| Waitlist + wait-time display | ✅ Solid (notify = stub) | `WaitlistEntry`, offer-link flow; **SMS is `console.log` only** |
| Staff scheduling | ✅ Solid | `Shift`, `ShiftDayRequirement`, `EmployeeAvailability`, double-shift/rest-gap warnings |
| Day settings / calendar | ✅ Solid | blackouts, auto-confirm, fully-booked, event titles, bulk future apply |
| Frontend customization | ✅ Solid | 4 public layouts, colors, typography, announcement, about/legal, timezone |
| Analytics | 🟡 Basic | `analyticsController` — reservation aggregations + today stats; no revenue/turnover charts |
| Auth & account security | ✅ New | hashed reset links, self-service password change, root-controlled TOTP 2FA |
| System admin | ✅ Solid | tenant provisioning, subscriptions, feature flags, `layoutStyle`, impersonate, audit page |
| i18n (TR/EN) | ✅ Solid | backend `i18next` + frontend `react-i18next` |
| **Payments** | 🔴 Stub | `hasPaymentFeature` flag + settings UI only — **no Stripe/iyzico; deposit never charged** |
| **Notifications (SMS/email/WhatsApp)** | 🔴 Stub | placeholders in `waitTimeController` |
| **AI menu importer** | 🔴 Stub | `aiMenuService.processMenuImage` returns simulated JSON |
| **Reviews** | 🔴 Mock | `dashboard/reviews` is static mock data; no DB model |
| CRM / loyalty | 🟡 Seed only | per-phone visit/no-show tally exists; no guest profile entity |

**Takeaway:** the operational core (booking, floor, menu, staffing, multi-tenant admin)
is genuinely strong. The biggest gaps vs. competitors are **guest data/CRM**,
**real payments**, **real messaging**, and **integrations** — plus several
already-scaffolded stubs that just need to be finished.

---

## 2. Competitive landscape

### Global players and their signature strengths
| Product | Known for (what we can learn/borrow) |
|---|---|
| **OpenTable** | Massive diner network/discovery, reviews, points, no-show protection, waitlist |
| **Resy** | Notify lists, ticketed/prepaid events, tight FOH app, "Resy for Restaurants" analytics |
| **SevenRooms** | Best-in-class **CRM & guest 360** (preferences, spend, tags), automated marketing, direct upsells |
| **Tock** | **Prepaid reservations & experiences/events**, deposits, dynamic pricing, wine dinners |
| **TheFork (TripAdvisor)** | Europe discovery marketplace, yield-management promos, loyalty (Yums) |
| **Eat App / TableCheck** | Strong in MENA/Asia, marketing automation, deposit + no-show fees, POS integrations |
| **Zenchef / Formitable** | Direct-booking widget, review aggregation, gift vouchers, EU-first |
| **Toast / Square** | POS-anchored: orders ↔ tables, KDS, online ordering, payroll, capital |

### Local / regional (Turkey & MENA) context
- **POS incumbents (Adisyo, Simpra, Sipariş/Repos, Logo, Paraşüt-adjacent):** cloud POS,
  adisyon (check) management, **e-Fatura / e-Arşiv / e-Adisyon** compliance, integrations
  with Yemeksepeti/Getir/Trendyol Yemek. Our reservation-first angle is complementary.
- **Payments:** **iyzico, PayTR, Param, Sipay, Craftgate** dominate; 3-D Secure and BIN
  installments ("taksit") are table-stakes in TR.
- **Messaging:** local SMS gateways — **Netgsm, İleti Merkezi, Mutlucell, Turkcell/Vodafone** —
  and **WhatsApp Business API** (very high open rates in TR).
- **Compliance:** **KVKK** (Turkey's GDPR) consent/retention, e-invoicing, Turkish public
  **holidays/religious days** for calendar automation.
- **Discovery:** no dominant local reservation network — an opening if we ever build a
  consumer-facing directory.

### Gap summary (what rivals have that we don't)
1. Guest CRM / 360 profile & preferences (SevenRooms, Resy)
2. Real prepaid/deposit + no-show fee capture (Tock, Resy, Eat App)
3. Automated guest messaging: confirmations, reminders, review requests (all)
4. Events / ticketed experiences with capacity & prepay (Tock)
5. Review collection + aggregation (Zenchef, OpenTable)
6. POS / online-ordering integration (Toast, local POS)
7. Marketing automation & loyalty (SevenRooms, TheFork Yums)
8. Booking widget/embeddable + custom domains (Zenchef, Formitable)
9. Multi-location / group management & consolidated reporting (enterprise tier)
10. Public API + webhooks + integration marketplace

---

## 3. Prioritized feature backlog

Effort: **S** ≈ days, **M** ≈ 1–2 weeks, **L** ≈ 3+ weeks. Impact is business value.

### 3.1 Finish the stubs (highest ROI — scaffolding already exists)

- **Real payments / deposits (iyzico + Stripe adapters)** — Impact ★★★★★, Effort **M**
  Charge `RestaurantSettings.depositAmount` during public booking; store transactions;
  refund on cancel per policy. Wire into `reservationController` create flow and the
  existing `hasPaymentFeature` flag / `dashboard/payments` page. Add TR-first: 3-D Secure,
  installments. *New: `Payment` model, `paymentController`, provider adapter interface.*

- **No-show / cancellation fee capture** — Impact ★★★★★, Effort **M** (after payments)
  Tokenize card at booking (SetupIntent / iyzico saved card); charge a fee on no-show or
  late cancel. We already track `NO_SHOW` + per-phone history — this monetizes it. Huge
  pain-killer for restaurants and a clear upsell tier.

- **Transactional messaging (SMS + email + WhatsApp)** — Impact ★★★★★, Effort **M**
  Replace the `console.log` placeholders in `waitTimeController`. A `NotificationService`
  with pluggable providers (Netgsm/İleti Merkezi/Twilio for SMS, WhatsApp Business API,
  SendGrid/Resend for email). Triggers: booking confirmation, reminder (T-3h), waitlist
  "table ready", offer link, cancellation. *New: `NotificationTemplate`, `NotificationLog`,
  provider config in settings; KVKK consent flag on guests.*

- **AI menu importer (real OCR/LLM)** — Impact ★★★☆☆, Effort **M**
  Implement `aiMenuService.processMenuImage` against Claude (vision) / Google Vision:
  photo → structured categories/items → bulk insert. The wizard UI (`menus/wizard`) and
  service seam already exist. Great onboarding accelerator and demo-friendly.

- **Reviews — make them real** — Impact ★★★★☆, Effort **M**
  Replace mock `dashboard/reviews` with a `Review` model + post-visit review request
  (via messaging) + optional Google/TripAdvisor aggregation. Feeds CRM and public site.

### 3.2 Guest experience & CRM (biggest competitive gap)

- **Guest 360 / CRM** — Impact ★★★★★, Effort **L**
  Promote the ad-hoc per-phone tally into a real `Guest` entity: contact, tags,
  preferences (allergies, seating, wine), lifetime visits/spend/no-shows, notes, consent.
  Auto-link reservations by phone/email. This is the foundation SevenRooms/Resy monetize.
  *Touches `Reservation` (add `guestId`), new `Guest`, `GuestTag`, `GuestNote`.*

- **Loyalty & rewards** — Impact ★★★★☆, Effort **L**
  Points/visits/tiers, birthday perks, "regular" auto-tagging. Pairs with CRM + marketing.

- **Automated lifecycle marketing** — Impact ★★★★☆, Effort **L**
  Segmented campaigns (lapsed guests, birthdays, VIPs) over the messaging layer; simple
  rules engine. Mirrors SevenRooms/TheFork Yums.

- **Waitlist & "notify me" upgrades** — Impact ★★★☆☆, Effort **M**
  Public "notify me if a slot opens" lists (Resy-style), SMS position updates, self-service
  cancel/confirm links. Extends existing `WaitlistEntry` + offer flow.

### 3.3 Booking depth & revenue

- **Events / ticketed experiences with prepay** — Impact ★★★★☆, Effort **L**
  Tock's core: fixed-price experiences (tasting menus, NYE, brunch), capacity, prepaid
  tickets, add-ons. Reuses payments + calendar. Strong differentiator and margin.

- **Dynamic / demand pricing & yield** — Impact ★★★☆☆, Effort **M**
  Peak/off-peak deposit or price by day-part; discount off-peak to fill (TheFork model).
  Extends `DaySetting.maxCapacityOverride` and pricing.

- **Deposit-per-cover & large-party rules** — Impact ★★★☆☆, Effort **S–M**
  Require deposit only for parties ≥ N or specific days. Policy config in settings.

- **Gift cards / vouchers** — Impact ★★★☆☆, Effort **M**
  Sellable vouchers redeemable against bookings/deposits (Zenchef feature). Needs payments.

- **Embeddable booking widget + custom domains** — Impact ★★★★☆, Effort **M**
  `<script>` widget for the tenant's own website, plus `bookings.myrestaurant.com`
  (already on the roadmap). Direct bookings = the whole pitch vs. commission marketplaces.

### 3.4 Front-of-house / operations

- **Table turn & pacing / cover flow control** — Impact ★★★★☆, Effort **M**
  Limit covers per 15-min slot (pacing), estimated turn times, "book-out" a shift.
  Builds on the new timeline + `defaultDurationMinutes`.

- **Host/FOH live floor status** — Impact ★★★☆☆, Effort **M**
  Real-time table states (seated/dessert/check/dirty), server sections, quote times.
  Extends `dashboard/host` and floor plan; ripe for websockets.

- **Real-time sync (WebSocket/SSE)** — Impact ★★★★☆, Effort **M**
  Live updates for host stand, timeline, and waitlist across devices/tablets. Today the
  UI polls/refetches; a socket layer sharpens the iPad host experience.

- **Server/section assignment & tip/cover reporting** — Impact ★★★☆☆, Effort **M**
  Assign tables to servers per shift; report covers/turns per server. Extends scheduling.

- **Reservation source & channel tracking** — Impact ★★★☆☆, Effort **S**
  `ReservationCategory` exists; formalize source attribution (widget, phone, walk-in,
  Google, Instagram) for analytics and marketing ROI.

### 3.5 Analytics & intelligence

- **Revenue & operations dashboards** — Impact ★★★★☆, Effort **M**
  Covers, turn time, no-show rate, deposit revenue, occupancy by day-part, source mix,
  guest retention. `analyticsController` already aggregates reservations — extend it and
  add charts (see the `dataviz` skill for consistent visuals).

- **Forecasting & smart suggestions** — Impact ★★★☆☆, Effort **L**
  Predict busy periods → staffing suggestions (ties to scheduling requirements), overbook
  buffers from no-show probability (we have per-guest no-show history).

- **Exports & scheduled reports** — Impact ★★☆☆☆, Effort **S**
  CSV/PDF exports and emailed weekly summaries.

### 3.6 Platform, integrations & enterprise

- **POS & online-ordering integrations** — Impact ★★★★☆, Effort **L**
  Sync check/spend back to the guest profile (Toast/Square globally; Adisyo/Simpra locally).
  Enables real "lifetime spend" and closes the loop CRM needs.

- **Public API + webhooks + API keys** — Impact ★★★☆☆, Effort **M**
  Let tenants/partners integrate (booking created, guest arrived, etc.). Foundation for an
  integration marketplace and the widget.

- **Multi-location / restaurant groups** — Impact ★★★★☆, Effort **L**
  Group accounts with shared guest DB and consolidated reporting across venues. Our
  tenant model is single-venue; add an org layer above `Restaurant`.

- **Channel connectivity (Google "Reserve with Google", Instagram/Facebook, TheFork)** —
  Impact ★★★★☆, Effort **L** — inbound bookings from where guests already are.

- **Compliance & trust (KVKK/GDPR, e-invoice)** — Impact ★★★★☆, Effort **M**
  Consent capture + retention/right-to-erasure for guest data (mandatory in TR), and
  e-Fatura/e-Arşiv hooks for deposits/vouchers. A blocker for serious TR customers.

### 3.7 Access, security & admin (partly done)

- ✅ Done recently: password reset links, self-service password change, TOTP 2FA (root-toggled).
- **Audit log (make real)** — Impact ★★★☆☆, Effort **M** — `system-admin/audit` page exists;
  back it with an `AuditLog` model recording admin/security actions (logins, resets, OTP
  changes, entitlement edges).
- **Staff-level 2FA policy & session management** — Impact ★★☆☆☆, Effort **S–M**.
- **Granular staff permissions UI polish** — Impact ★★☆☆☆, Effort **S**.

### 3.8 Technical foundation (from ROADMAP "tech debt")

- **Automated tests (Playwright/Vitest)** — no test framework today; add E2E for the booking
  and OTP flows. Impact ★★★★☆ for velocity/safety.
- **Redis caching** for hot public endpoints; **DB indices** for date-range reservation
  queries and waitlist status.
- **Background job queue** (BullMQ) for messaging/price updates instead of the in-process
  `setInterval` worker.
- **Observability**: structured logging, error tracking (Sentry), uptime.

---

## 4. Suggested sequencing

**Now (finish what's scaffolded — fast, high impact):**
1. Real payments (iyzico + Stripe) → 2. No-show/cancellation fees → 3. Transactional
   messaging (SMS/email/WhatsApp) → 4. Real reviews → 5. AI menu importer.

**Next (the CRM flywheel — biggest competitive gap):**
6. Guest 360 / CRM → 7. Lifecycle marketing & loyalty → 8. Revenue/ops analytics.

**Then (revenue & reach):**
9. Events/prepaid experiences → 10. Embeddable widget + custom domains →
11. Table pacing/turn control → 12. Real-time (WebSocket) host/timeline.

**Later (scale & enterprise):**
13. POS/online-ordering integrations → 14. Public API + webhooks → 15. Multi-location
   groups → 16. Channel connectivity (Google/Instagram) → 17. Compliance (KVKK/e-invoice).

**Continuous:** automated tests, caching/indexing, job queue, observability.

---

## 5. "Quick wins" shortlist (≤ ~1 week each)

- Reservation **source attribution** on `ReservationCategory` + a source column in analytics.
- **CSV export** of reservations/guests.
- **Self-service cancel/confirm** links in booking confirmation (needs messaging).
- **Deposit-required threshold** (parties ≥ N) as a settings toggle.
- **Audit log** model behind the existing `system-admin/audit` page.
- **Turkish public-holiday presets** for the calendar bulk-apply flow.
- **Booking confirmation email/SMS** template (first use of the messaging layer).

---

## 6. Positioning note

The platform's edge is a **genuinely deep operational core** (booking modes, interactive
floor + timeline, menu with modifiers/pricing automation, staffing rules, per-tenant
theming) with **strong Turkey localization** (TR/EN, timezone, and room for iyzico/Netgsm/
KVKK). The fastest path to competitiveness is to (a) **finish the payment + messaging
stubs** so deposits and reminders are real, then (b) **build the Guest CRM flywheel** that
SevenRooms/Resy monetize — turning the reservation data we already capture into retention,
marketing, and no-show protection revenue.
