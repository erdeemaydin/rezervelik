# Progress Log

Day-to-day record of substantial work sessions on this project. Newest entry first.

## 2026-08-11 — security/bug audit + i18n pass on recent changes

**Three parallel read-only audit forks (security, functional bugs, i18n) scoped to
everything added since the 2026-08-08 pass** (confirmation codes, admin-gated
overbooking, the 4 new public layout themes) **+ fixes for everything confirmed.**

- **Critical: cross-tenant privilege escalation via `isStaffRequest`**
  (`reservationController.ts`). It only checked that the bearer token was
  *some* valid JWT, never that it belonged to the tenant in
  `X-Restaurant-ID` — unlike `authMiddleware`'s real tenant check. Since
  `POST /api/reservations` is public, any staff member's own token let them
  act as staff against a *different* restaurant, bypassing `maxPartySize`,
  day-capacity caps, table-conflict overrides, and `FULLY_BOOKED`. The same
  unchecked pattern existed in the rate limiter's staff-bypass on the same
  route (SMS-cost amplification risk). Both now require
  `decoded.restaurantId === req.restaurantId` (or `SUPER_ADMIN`).
- **Mass assignment**: `isVIP`/`internalNote` were written straight from the
  public request body regardless of `staffInitiated`.
- **Unrated public payment-session lookup**: `GET
  /api/public/payment/session/:ref` had no rate limit, unlike every other
  public write endpoint — brute-forceable for reservation PII, and each hit
  on a valid `PENDING` payment fired a live PayTR gateway call (free
  amplification against the merchant account).
- **`acceptOffer` bypassed every capacity guarantee**: always created a
  `CONFIRMED` reservation regardless of whether a table was actually
  assigned, and never checked `DaySetting.maxCapacityOverride` — both
  enforced on the regular public booking path. Now mirrors
  `createReservation`; also now issues a `confirmationCode` like every
  other creation path.
- **Confirmation-code retry loop reused stale state**: `finalTableId`/
  `isOverbooked` weren't reset between confirmation-code collision retry
  attempts in `createReservation`.
- **Dashboard stats used server-local time**: `getDashboardStats` had the
  same server-local-vs-tenant-timezone bug already fixed in
  `analyticsController.ts`, mis-bucketing `staffOnline` and the weekly
  volume chart near a day boundary. `computePaymentDeadline`'s same-day
  check had the same issue at lower stakes.
- **i18n**: confirmed no "İ" (Turkish dotted capital I) misuse anywhere in
  English text — already clean. `tr.json`'s naturalness turned out to
  already be in good shape (contrary to the stale note in `WORK_LOG.md`);
  found and fixed two real mistranslations (`avgLeadTime`, `crimson`). Also
  found `/pay` and `/pay/[ref]` (the guest-facing deposit-payment pages,
  reached directly from an SMS/email link) were 100% hardcoded Turkish with
  no i18n at all — wired both through the existing
  `useTranslation`/`LanguageSwitcher` infrastructure, including
  locale-aware date/time/currency formatting.

New regression tests: `reservation-cross-tenant-staff-token.test.ts`,
`waitlist-offer-accept-capacity.test.ts`, `dashboard-stats-timezone.test.ts`.
Full suite (238 tests) green; both `tsc` clean.

## 2026-08-09 (cont'd) — full audit pass on previously-uncovered domains

**Parallel domain audits (events/wedding/vendors, public-facing pages, system-admin) + fixes for everything confirmed**

Extended the 2026-08-08 audit to the three domains it hadn't reached yet
(events/wedding/vendors module, public/unauthenticated pages, system-admin) —
three parallel read-only audit forks, then verified and fixed every confirmed
finding myself. Also self-reviewed the payment/messaging code added earlier
this session and found one more race there.

- **Concurrent-accept payment race** (self-review): two staff "Accept" clicks
  on the same reservation both read `isPaid=false` before either write
  landed, each generating its own Payment row + deposit link + SMS. Moved the
  eligibility re-check + Payment creation inside one transaction.
- **Guest RSVP duplicate race**: `submitInvitationRsvp`'s dedupe-by-name check
  wasn't transactional — a double-tap could create two Guest rows for one
  person. Fixed with a Postgres advisory lock scoped to (event, name),
  deliberately not a DB unique constraint (staff can legitimately add
  distinct guests who share a name).
- **`addEventVendor` unhandled P2002**: concurrent "Add vendor" clicks raced
  the DB's own unique constraint; the loser got a raw 500 instead of the
  friendly "already added" error the sequential path already had.
- **`acceptOffer` double-accept race**: same shape as the payment race above —
  a double-tap on a waitlist offer link could create two reservations and
  double-decrement waitlist capacity. Now claims the offer atomically
  (`OFFERED -> ACCEPTED`) inside the transaction.
- **No server-side `maxPartySize` cap**: only ever enforced by a bounded
  dropdown client-side; a direct API call could send any integer,
  inflating `peopleWaiting` for every real guest behind it in the walk-in
  queue. Also added a basic sanity check (positive integer) that didn't
  exist at all before.
- **Public layout button-disable drift**: Premium/Olden/Garden disabled the
  submit button whenever a day was closed, with no exception for
  `isFullyBooked` — unlike Classic. The button then showed "Join Waitlist"
  as its label while staying disabled, promising an action the guest
  couldn't take. Brought the three in line with Classic's (correct) logic.
- **Feature-flag entitlements never enforced server-side** — the biggest
  finding. `hasEventPipeline`/`hasVendors`/`hasPaymentFeature`/
  `hasMenuFeature`/`hasShiftFeature` were only ever consumed by the frontend
  to hide nav links; nothing rejected a direct API call to a module a
  tenant's plan/vertical doesn't include (a CLINIC tenant could still
  trigger deposit collection; any non-WEDDING tenant could hit the full
  events/vendors CRUD directly). Added a `requireFeature` middleware
  (mirrors `requirePermission`) and applied it across the five modules.
- **`/api/wait-time/*` had no auth check at all** — found while fixing the
  item above, more serious than what I was originally looking for. Only
  `tenantMiddleware` (an `X-Restaurant-ID` header the caller supplies) gated
  the live waitlist (customer names/phones), wait-time config, and
  `sendOffer` — and the restaurant UUID it keys on isn't secret, since
  `GET /api/public/restaurant/:slug` returns it to any visitor of the public
  booking page. Now gated by `authMiddleware` + `requirePermission` +
  `requireFeature`, matching what the dashboard nav already implied.
- **Impersonation was a one-way trip**: overwrote the SUPER_ADMIN's own
  stored session with no way back except a fresh login, and nothing on
  screen indicated a dashboard view was really an impersonated tenant.
  Added `startImpersonation`/`stopImpersonation` (stash + restore) and a
  persistent "Viewing as X — Return to Admin" banner.
- **No rate limiting on public write endpoints**: `joinPublicWaitlist`,
  `createReservation` (guest path), `submitInvitationRsvp` could be looped
  to flood rows and spam the paid SMS/WhatsApp account. Added an in-process
  per-IP limiter (matches the app's existing single-instance pattern rather
  than a new dependency); staff traffic on the shared `createReservation`
  route is never throttled.
- **`createSuperAdmin` bootstrap wasn't audit-logged**, unlike its sibling
  `createSystemAdmin`. Minting a platform-level SUPER_ADMIN is about as
  sensitive as actions get.

**Deliberately not fixed, flagged instead:**
- Impersonation JWT carries no `impersonatedBy` claim — actions taken while
  impersonating are indistinguishable from the tenant admin's own in every
  audit-log entry after the initial `IMPERSONATION_STARTED` row. Needs a
  token-shape change; bigger than this pass.
- No admin-deactivation endpoint exists — a compromised/offboarded SysAdmin
  credential can't be revoked through the product, only directly in the DB.
- `getOffer`/`getRestaurantBySlug` return their full row with no field
  allowlist (unlike `getInvitation`, written deliberately display-safe) —
  nothing secret leaks today, but it's the same missing-allowlist shape.

`tests/helpers/seedTenant` now takes a `businessType` option seeding
`RestaurantSettings` from the real per-vertical profile (same one
`systemController.createTenant` applies in production), needed once
`requireFeature` gates started rejecting the events/vendor tests' default
RESTAURANT-profile tenants. Nine fixes, each its own commit + test; full
suite 103/103, backend+frontend `tsc` clean, `next build --experimental-build-mode compile` clean.

## 2026-08-09

**"Finish what's built": booking-confirmation messages, refunds, no-show deposit reporting**

Planning pass first: cross-checked `FEATURE_OPPORTUNITIES.md`'s status table
against the actual code and found it stale (written before the same-day
commit that shipped payments/messaging) — payments (PayTR + Mock, both
trigger flows) and messaging (Netgsm SMS + WhatsApp Cloud API) were already
fully built, just needing real credentials, not stubs. Picked the
highest-ROI gap instead of re-building what existed:
- **Booking-confirmation message**: guests got a payment-request SMS when a
  deposit was needed, but nothing at all once a reservation was actually
  confirmed. Added `sendBookingConfirmation` (reuses the existing SMS/WhatsApp
  layer) and fired it at all three moments a reservation becomes CONFIRMED —
  auto-confirm at creation, staff direct accept, and deposit paid.
- **Refunds**: `PaymentProvider` had no `refund()` at all. Added it to the
  interface + PayTR ("İade API", un-live-tested like the file's other two
  formulas) + Mock adapters, a `REFUNDED` transition (`refundedAt`/
  `refundReason`/`rawRefund` columns), a new `PAYMENT` audit category, and a
  tenant-scoped `POST /api/payments/:id/refund` (ADMIN/MANAGER only) with a
  Refund action + confirm dialog on paid rows in `dashboard/payments`.
- **No-show deposit-forfeiture reporting**: `PAYMENTS.md` already flagged this
  as a follow-up. `GET /api/payments` now includes the linked reservation's
  status; the dashboard totals paid deposits whose reservation is `NO_SHOW`
  into a "Forfeited (No-Shows)" stat card and badges those rows.

Also fixed a real bug along the way (user-reported): `FIXED_SLOTS`/
`MANUAL_AVAILABILITY` reservation logic modes hardcoded the table-occupancy
window to a flat 120 minutes, ignoring the tenant's own `defaultDurationMinutes`
setting — removed the hardcode so all three logic modes respect it.

All new work has its own test file and commit; full suite 79/79, backend +
frontend `tsc` clean, `next build --experimental-build-mode compile` clean.

## Methodology: how bug-hunting/fix sessions on this repo are run

Kept here (not just in the moment) so the approach carries forward across
sessions instead of being rediscovered each time.

**Finding bugs faster — domain-split parallel audits.** Don't read the whole
codebase linearly. Split it into business domains that map to how the app
actually works (reservations, menu, waitlist, scheduling, payments,
staff/auth, system-admin) and audit each in parallel — each pass reads only
the controllers/pages for its domain and reports back concrete findings, not
a transcript. This finds more in less wall-clock time than one long serial
pass, and keeps each finding scoped enough to verify quickly.

**Calibration — what counts as a real finding vs. noise.** The bugs actually
worth fixing here have consistently been one of a few shapes:
- An invariant enforced in only one place (client-side only, or one API path
  only) with nothing backing it at the data layer — e.g. menu single-active
  was checked in the UI's flow but had no DB constraint; `layoutStyle` was
  meant to be SysAdmin-only but the tenant endpoint never rejected it.
- Check-then-write races: two requests can both pass a `findUnique`/read
  check before either commits its write. Grep for `findFirst`/`findUnique`
  immediately followed by `create`/`update` with no `$transaction` wrapping
  both.
- Timezone assumptions: anything using `.getHours()`/`.getDate()`/`new
  Date(y,m,d)` directly on a stored UTC instant is implicitly server-local
  time, not the tenant's configured timezone. `restaurantDateStr`/
  `restaurantHourAndDay` in `src/utils/reservationConflict.ts` /
  `analyticsController.ts` are the fix pattern — grep for raw `.getHours()`
  calls on reservation/analytics timestamps to find more.
- **Once you find one instance of a pattern, grep the whole codebase for
  siblings.** E.g. finding `Math.random()` used for a security token in one
  controller is a reason to grep `Math.random()` everywhere else a
  token/secret is minted, not just fix that one call site.
- A documented feature (check `PROJECT_LOGIC.md`) whose backend field exists
  in the schema but is never read by the code paths that should gate on it —
  or exists in the schema/backend but has no UI affordance at all. That's how
  the `MANUAL_AVAILABILITY` gaps were found both times: once as "the
  `isAvailable` column is written but never read by booking logic," and again
  as "the enum value works server-side but the Settings dropdown only offers
  the other two."

**Verifying a fix.** Backend: `tsc --noEmit`, then a vitest integration test
that reproduces the bug against an **isolated** test database (never the
shared dev DB — `createdb` a throwaway, `prisma migrate deploy` into it, set
`TEST_DATABASE_URL`, run, then drop it), then the full suite (not just the
new test) before committing. Schema changes get a real migration file (hand
write the SQL if `prisma migrate dev` can't reach a shadow DB in the sandbox;
apply with `prisma migrate deploy`, which doesn't need one). Frontend:
`tsc --noEmit` + `eslint` on touched files (compare warning count/content
against what was already there — pre-existing warnings aren't yours to fix
unless asked), and for structurally novel changes (new interactive
components, not just moving existing JSX around) a throwaway Next dev server
on an isolated `distDir`/port to confirm it actually compiles and serves.
Full pixel-level browser verification needs Chromium, which needs system
shared libs this sandbox can't install without root — when that's the case,
say so explicitly rather than silently skipping visual verification.

**Committing.** One logically-scoped commit per fix (not one giant commit for
the whole session) — makes each change independently revertable and the
`git log` itself a readable changelog. Commit message explains *why* the bug
mattered (the failure scenario), not just what changed.

**Standing practice going forward:** when work in a feature area surfaces a
logic-level question — not a crash/security bug, but "is this actually the
right behavior?" — fix it directly if the answer is unambiguous, otherwise
flag it and ask rather than silently redesigning product behavior.

---

## 2026-08-08 (cont'd)

**Reservation duration: FIXED_SLOTS/MANUAL_AVAILABILITY ignored defaultDurationMinutes**

User-reported: table sitting time was fixed at 120 minutes automatically,
with no way to configure it. Root cause: `createReservation`/
`updateReservation` special-cased any logic mode other than
`DYNAMIC_DURATION` to a hardcoded `start + 120min` window, ignoring the
tenant's `defaultDurationMinutes` setting entirely — even though the Settings
UI exposed that field as applying to all modes, and `publicController`'s
availability check + waitlist-offer acceptance already used it universally.
Removed the hardcode so all modes (service-duration override still wins when
one applies) use the tenant's configured value; updated the FIXED_SLOTS
explain text in Settings to match. New regression test:
`tests/api/reservation-fixed-slot-duration.test.ts`.

## 2026-08-08

**Two-pass bug audit + fixes (12 bugs) + 6 UI/IA changes, all on `agent/telegram-bot`**

First pass (user-reported: menu editor allowed two "live" menus at once) grew
into a full audit. Parallel domain-audit forks across reservations, menu,
scheduling, waitlist, staff/payments/customization/analytics, and
system-admin/auth turned up 12 concrete bugs, each fixed with its own test
and commit:
- Menu: no DB constraint backing "only one active menu" (root cause of the
  reported bug) + AI-import bypassed the check entirely. Added a partial
  unique index + repaired the app-level guard.
- Reservations: `updateReservation`/`updateReservationSchedule`/
  `updateReservationStatus` had the same check-then-write table-conflict race
  `createReservation` was already fixed for, just never carried over;
  `DaySetting.isFullyBooked` was set automatically but never cleared, hard-
  blocking a day indefinitely after a cancellation; `MANUAL_AVAILABILITY`
  mode's `isAvailable` flag was written by staff but never read by any
  booking path, making the whole mode inert.
- Scheduling: DOUBLE_SHIFT/CONSECUTIVE_REST/UNAVAILABLE were computed only in
  the frontend for display, never enforced server-side.
- Waitlist: `peopleWaiting` only ever incremented, never decremented, so
  quoted wait times ratcheted upward all service; the offer-acceptance flow
  crashed on walk-in (non-date) entries; `sendOffer`'s link used the wrong
  env var and the wrong route param (backend port + restaurantId instead of
  frontend port + slug).
- Security: tenant setup-invite tokens were `Math.random()` in plaintext
  (should never have been recoverable from a DB leak or predictable) — now
  `crypto.randomBytes` + only a SHA-256 hash stored, matching the existing
  password-reset pattern.
- Customization: a tenant admin could set `layoutStyle` (meant to be
  SysAdmin-exclusive) via a direct API call; the dashboard just never showed
  a control for it, which isn't enforcement.
- Analytics: "today" boundaries and peak-hours bucketing used server-local
  time instead of the tenant's configured timezone.
- Staff: role/permission changes (promote/demote/delete) had zero audit
  trail; a genuine concurrent-create race on duplicate emails surfaced a raw
  500 instead of a friendly error.

UI/IA pass (from a dedicated "what would you optimize" audit): renamed two
Settings cards that collided in name with unrelated top-level pages
("Appearance"/"Payments & Deposits"); split Settings into
Reservations/Scheduling/Payments/Appearance tabs; split the flat
"Administration" sidebar section into People/Business Settings/Compliance;
moved waitlist config into a dialog so the live queue gets full width; added
a "Booking Mode: X · Edit in Settings" hint on Host and Tables (the active
reservation logic mode silently controls both pages' behavior); added a
Cmd/Ctrl+K command palette to jump to any route. Then, once
`MANUAL_AVAILABILITY` was made functional, noticed the Settings picker never
actually offered it as an option — added it as the third choice with its own
explain text.

**Known limitation this session:** no root in this sandbox to install
Chromium's shared libs, so UI changes are verified via `tsc`/`eslint`/a
throwaway dev-server compile-and-serve check, not actual browser screenshots.

## 2026-07-02

**Public website redesign (all 3 existing layouts + new 4th layout)**
- Redesigned `ClassicLayout`, `PremiumLayout`, `OldenLayout` (the public restaurant pages) with a modern, minimalist visual pass in each one's own spirit, replaced a mismatched stock photo, and fixed real bugs found along the way: a broken day-availability check in two of the three layouts (`isBookingOpen` was never set, so "fully booked" messaging silently never showed), theme colors being ignored in CTA buttons/menu headers, fabricated business info (fake address/hours) shown to every tenant, and a missing language switcher on one layout.
- Added a dedicated `/r/[slug]/menu` route (for QR codes) that renders each tenant's own branded layout in a lightweight "menu only" mode instead of a generic page, and pointed `QRCodePDFGenerator` at it.
- Added day/time quick-pick chips (previously only in `ClassicLayout`) to `PremiumLayout` and `OldenLayout`'s reservation forms, and moved the day-availability status panel to right after date/time selection with a clear "Thursday, July 2"-style label in all layouts.
- Added the `MenuItem.allergens` field (existed in the schema, was never rendered) to all menu item cards, with a new `public.allergens` i18n key.
- Built a new 4th public layout, `GardenLayout` (`layoutStyle: GARDEN_FRESH`) — light, warm, photography-forward, less minimalist than the others — and assigned it to Moss & Stone. Registered the new style in the SysAdmin tenant-settings dropdown so it can be assigned to other tenants too.
- Verified all four public layouts (hero, menu page, booking flow) at a 390px mobile viewport: zero console errors, zero horizontal overflow anywhere.

**Reservation window, conflicts & auto-confirm**
- `defaultDurationMinutes` (admin-adjustable, defaults to 90 min) already existed as a setting, but the actual table-conflict check was hardcoded to 90 minutes regardless of that setting — fixed to use the real configured duration.
- Added a distinct `409 TABLE_CONFLICT` response so staff can be shown a warning dialog and knowingly double-book a table on purpose (public/customer bookings are always hard-blocked, never allowed to override).
- Auto-confirm now only fires when a table is actually free at that moment; when nothing's free (but the party size could physically fit somewhere in the restaurant) the reservation is still accepted as `PENDING` with a `possiblyFullyBooked` flag, and the public booking flow shows a soft "we may be fully booked" hint instead of a hard rejection.

**Reservation Timeline tab**
- Added a third tab to the admin Reservations page: tables as rows, time-of-day as columns, reservation bars positioned by start time/duration, defaults to the current time on open with day navigation and a "jump to now" button.

**Reservation date-waitlist**
- Found this was already ~90% built (public join flow, `WaitlistEntry.targetDate`, admin "Future Dates" tab, offer/accept/decline flow) from prior work — just decoupled it from the unrelated walk-in wait-time `isWaitlistOpen` toggle, since a guest queueing for a future fully-booked date shouldn't be blocked by today's walk-in queue being closed. SMS notification stays a logged placeholder (no provider configured); staff manage/notify guests from the dashboard directly.

**No-show / repeat-guest tracking**
- `getReservations` now returns a per-phone-number `phoneHistory: { totalVisits, noShowCount }` (computed via a single grouped query, no schema change), and the admin reservation list shows a warning badge when a phone number has prior no-shows.

**Floor plan**
- Added a `color` field to `Table` (previously only floor elements had one) with a color picker in the table dialog.
- Tables can now be resized by dragging their corner directly on the canvas, matching floor elements (previously resize was element-only, tables were drag-move only).
- Fixed the floor plan canvas to render on a fixed logical coordinate system (1400×800) scaled via CSS transform to fit any container width, instead of raw pixel positions that didn't adapt to different screen sizes.

**Docs**
- Updated `PROJECT_LOGIC.md`, `API_DOCS.md`, `ROADMAP.md`, and `CLAUDE.md` to reflect all of the above.

**Note on local test data:** two seeded dev accounts (`hello@rusticoven.com`, `admin@myrestaurant.com`) had their passwords reset to a known test value while verifying the admin dashboard changes in a browser. This only touches the local SQLite dev database, not any real credentials.
