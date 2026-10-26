# Multi-Business Platform Roadmap

> **Goal:** Turn this restaurant SaaS into a **multi-business booking platform**. One
> backend, one DB, one frontend, one deployment. Each tenant has a `businessType`;
> the same booking/resource/catalog/staff/payment engine is re-skinned and
> re-featured per vertical. No fork — verticals are **modules**, not separate apps
> (see decision in §1).
>
> **This document is the source of truth for the initiative and is designed to be
> resumable across sessions.** If you're picking this up cold: read §2 (branch map)
> and §4 (phases), find the first unchecked `[ ]` item under the active phase, and
> continue there. Update the checkboxes as you go and commit this file with each
> meaningful step.

---

## 1. Core decision (settled)

- **Do NOT fork.** ~70% of the value (multi-tenancy, auth/RBAC/2FA, i18n, payments,
  staff scheduling, floor-plan canvas, customization CMS, SysAdmin provisioning,
  feature flags, test suite) is shared platform. Forking duplicates that and forces
  every fix twice. Instead: one platform, vertical-specific domain isolated in
  modules, gated by `businessType`.
- The existing **feature-flag system** in `RestaurantSettings` + **per-tenant
  SysAdmin config** (`layoutStyle`, etc.) is already the mechanism for per-vertical
  variation. `businessType` is the next member of that pattern.
- Fork later only if: it becomes a separate business to sell/spin out, a different
  team owns it, or regulation forces separation. Good modularization keeps that
  option open at ~1 day's cost.

## 2. Branch map (trackable history)

```
develop
└── feat/multi-business-platform          ← integration branch (this initiative)
    ├── feat/mbp-01-vertical-foundation    Phase 1
    ├── feat/mbp-02-standardization-rename  Phase 2
    ├── feat/mbp-03-tier1-verticals         Phase 3
    ├── feat/mbp-04-wedding-module          Phase 4
    └── feat/mbp-05-organizer-vendor        Phase 5
```

**Workflow:** each phase is built on its own `feat/mbp-0X-*` subbranch off the
integration branch, then merged back into `feat/multi-business-platform` when the
phase is green (typecheck + tests + smoke). The integration branch merges into
`develop` only when the whole initiative is stable. Never leave a subbranch in a
broken state at a commit boundary — each commit should typecheck.

**Create a subbranch when you start its phase** (not all upfront), e.g.:
`git checkout feat/multi-business-platform && git checkout -b feat/mbp-02-standardization-rename`

## 3. Canonical (universal) domain terminology

We standardize the **code/domain vocabulary** to be vertical-neutral, and render
per-vertical **display labels** on top of it (via the terminology system, Phase 1).

| Canonical concept | Current model/field | Display label is per-vertical |
|---|---|---|
| Business (tenant)  | `Restaurant` / `restaurantId` | rarely shown; "Restaurant"→"Business/Venue/Studio" |
| BookableResource   | `Table`             | Table / Chair / Court / Room / Hall / Practitioner |
| Zone               | `TableType`         | Section / Station / Area / Floor / Department |
| Booking            | `Reservation`       | Reservation / Appointment / Booking / Event |
| Catalog            | `Menu`              | Menu / Services / Packages |
| CatalogItem        | `MenuItem`          | Dish / Service / Package |
| Party size         | `guestCount`        | Guests / Players / Guest count |

**Rename policy (decided):** Phase 2 renames `Table→BookableResource` and
`TableType→Zone` **in Prisma model/code names**, but keeps the underlying SQLite
table names via `@@map("Table")` / `@@map("TableType")` so **no data migration** is
required (low DB risk). `Restaurant→Business` and `Reservation→Booking` renames are
**optional and deferred** (§4 Phase 2b) because `restaurantId`/`X-Restaurant-ID` is
pervasive — validate the @@map approach on Table/TableType first.

## 4. Phases

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

### Phase 0 — Initiative bootstrap  `[x]`
- [x] Create integration branch `feat/multi-business-platform` off `develop`
- [x] Write this roadmap and commit it on the integration branch
- [x] Save a memory pointer so future sessions find this file

### Phase 1 — Vertical foundation  (branch `feat/mbp-01-vertical-foundation`)
Purely **additive**, zero impact on existing restaurant tenants. Establishes the
mechanism that all Tier-1 verticals ride on.
- [x] Add `businessType String @default("RESTAURANT")` to `Restaurant` in `schema.prisma`
- [x] Apply via `prisma db push` + hand-authored migration
      (`prisma/migrations/20260705000000_add_business_type`)
- [x] `npm run prisma:generate`
- [x] Backend: expose `businessType` in tenant read APIs (`/settings` GET carries it;
      `getRestaurant` already returns all scalars) and accept it on `createTenant` /
      `updateTenantSettings` in `systemController.ts`
- [x] Backend: **feature-profile map** (`src/config/businessProfiles.ts`) —
      `businessType → default feature flags`; applied on create and on type switch
      (explicit flags in the request win over the profile)
- [x] Frontend: **terminology system** — implemented as a typed TS module
      (`frontend/src/lib/terminology.ts`, keyed by businessType×locale) rather than
      JSON, to keep locale files clean. `useTerms()` hook (`src/hooks/useTerms.ts`)
      resolves labels from `useTenantStore.businessType` (hydrated in AdminLayout
      from `/settings`).
- [x] Frontend: converted dashboard **sidebar nav** labels (Reservations/Tables/Menu)
      to `useTerms()` for non-restaurant tenants (restaurant wording unchanged)
- [ ] Frontend: deep terminology conversion of page titles/headings/buttons across
      dashboard pages — **incremental, ongoing** (do opportunistically per page)
- [x] SysAdmin UI: `businessType` selector on tenant provision + entitlements dialogs
- [x] Typecheck (backend + frontend `tsc`) + full test suite (23 passing); commit;
      merge into integration branch
- **Resume marker:** _Phase 1 core DONE. Only remaining item is the incremental
  page-by-page terminology conversion (safe to interleave with later phases). Next
  major work: Phase 2 (standardization rename) on branch
  `feat/mbp-02-standardization-rename`._

### Phase 2 — Standardization rename  (branch `feat/mbp-02-standardization-rename`)
- [x] Rename Prisma models `Table→BookableResource`, `TableType→Zone` **with
      `@@map("Table")` / `@@map("TableType")`** — `db push` confirmed "already in
      sync", i.e. **zero data migration**.
- [x] Decision: **kept relation/field names** (`tableId`, `tableType`, `tables`,
      `tableTypes`) unchanged → API response shapes identical → **frontend untouched**.
      Only model accessors + relation TYPES changed.
- [x] `prisma:generate`; rewrote all accessors (`prisma.table`→`prisma.bookableResource`,
      `prisma.tableType`→`prisma.zone`, plus `tx.*`/`client.*` aliases) across
      `tableController`, `tableTypeController`, `floorElementController`,
      `publicController`, `restaurantController`, `reservationController`,
      `restaurantService`, `utils/reservationConflict`, `prisma/seed.ts`,
      `scripts/demo-data.ts`
- [x] Backend typecheck clean; full test suite (23) green; commit; merge to integration
- **Phase 2b (OPTIONAL, deferred):** deeper field renames — `Restaurant→Business`,
      `Reservation→Booking`, `restaurantId→businessId`, `tableId→resourceId`,
      `X-Restaurant-ID` header alias. High blast radius (changes API shapes +
      frontend). Do as its own subbranch, all-or-nothing, only if wanted.
- **Resume marker:** _Phase 2 DONE. Next: Phase 3 (Tier-1 verticals) on branch
  `feat/mbp-03-tier1-verticals`._

### Phase 3 — Tier-1 verticals  (branch `feat/mbp-03-tier1-verticals`)
Config + terminology packs + two small schema additions. Verticals: **Salon/Barber,
Sports courts, Coworking, Clinic** (see §5 specs).
- [x] Add `durationMinutes Int?` to `MenuItem` (per-service duration) + optional
      `Reservation.serviceId` link to the service (migration
      `20260705100000_add_service_duration`, additive)
- [x] Booking flow: `createReservation` resolves the service (tenant-scoped via its
      menu), and when it has `durationMinutes` uses it for the window/`endTime`
      (both the conflict window and stored end). Foreign/unknown service → ignored.
- [x] Backend: `menuController` create/update accept `durationMinutes`
- [x] Frontend: Duration (min) field on the menu-item form
      (`dashboard/menus`), bilingual key `menus.form.serviceDuration`
- [x] Terminology + feature profiles for each Tier-1 vertical — already delivered in
      Phase 1 (`terminology.ts` + `businessProfiles.ts` cover SALON/SPORTS/COWORKING/CLINIC)
- [x] SysAdmin: verticals exposed in the `businessType` selector — done in Phase 1
- [x] Typecheck (backend+frontend) + tests (26 passing, incl. new
      `reservation-service-duration.test.ts`); commit; merge to integration
- **DEFERRED to a later phase (documented):** staff-as-resource (booking a specific
      `User`/practitioner rather than a physical resource). Bigger design change to
      the booking/auto-assign logic; not needed for the court/room/chair verticals.
      Tracked as a future item.
- **Resume marker:** _Phase 3 DONE. Next: Phase 4 (wedding module) on branch
  `feat/mbp-04-wedding-module`._

### Phase 4 — Wedding / organization module  (branch `feat/mbp-04-wedding-module`)
The one vertical with genuinely new domain logic. New models isolated under a
wedding module. See §6 for schema. Split into **4a (backend, DONE)** and
**4b (frontend, PENDING)**.

**Phase 4a — backend + data model (DONE):**
- [x] `Event` model: client, eventType (WEDDING/ENGAGEMENT/HENNA/CORPORATE),
      eventDate, slot, hall (`resourceId`→BookableResource), guestCount, package
      (`packageId`→MenuItem), **pipeline stage**
      (LEAD→VISIT→QUOTE→CONTRACT→CONFIRMED→COMPLETED→CANCELED, validated), coordinator
- [x] `PaymentPlan` (one per event) + `PaymentInstallment` (kapora + taksit; status
      PENDING/PAID/OVERDUE; `paymentId` slot to link an existing `Payment` when charged;
      paidAt auto-stamped on PAID)
- [x] `Guest` list + RSVP (PENDING/YES/NO/MAYBE) + seating (`resourceId`→BookableResource)
- [x] New feature flags `hasEventPipeline`/`hasInstallmentPlans`/`hasGuestList`
      (default off; WEDDING profile enables them) wired through `businessProfiles.ts`
- [x] Per-person pricing: `quotedTotal` derived = round(package.price×100) × guestCount
      when no explicit total given
- [x] `eventController.ts` (+ tenant-scoped ownership guards for hall/package/
      coordinator/guest-seat) + `eventRoutes.ts` mounted at `/api/events`
      (`tenantMiddleware`; reads = any authed user, mutations = `manage_events`, ADMIN bypasses)
- [x] Wedding terminology + feature profile — terminology from Phase 1; profile flags here
- [x] Typecheck clean; `tests/api/wedding.test.ts` (7 cases: stage validation,
      per-person pricing, foreign-package rejection, lazy plan + installment paidAt,
      guest RSVP, **tenant isolation**); full suite **33/33**. Commit; merge to integration.

**Phase 4b — frontend (branch `feat/mbp-04b-wedding-frontend`, DONE):**
- [x] `/dashboard/events` pipeline board (events grouped into the 7 stages, per-card
      client/date/guests/quotedTotal/coordinator, create-event dialog)
- [x] `/dashboard/events/[id]` detail: editable core fields + quick stage control,
      guest list (add/RSVP/delete), payment plan (total + installments add/mark-paid/
      delete, paid-vs-total summary)
- [x] Nav item gated on `hasEventPipeline`; `manage_events` added to tenant provisioning
- [x] Bilingual (tr/en) `events.*` + `common.loading/save/saved` i18n
- [x] Verified: frontend `tsc` + `eslint` (0 errors) + `next build` (both routes
      compile); backend tests still 33/33
**Phase 4c — relational pickers + seating (branch `feat/mbp-05-organizer-vendor`, DONE):**
- [x] Relational pickers on `/dashboard/events/[id]`: coordinator (staff), hall
      (BookableResource), package (MenuItem — drives per-person pricing) — all show
      human-readable names, never raw UUIDs; empty selection sends `'none'`
- [x] Live quote preview (`package.price × 100 × guestCount`) beside the package picker
- [x] Visual seating board: unseated bucket + per-resource cards with capacity/over
      indicators; assign guests to floor-plan resources from the detail page
- **Resume marker:** _Phase 4c DONE (folded into the Phase 5 branch)._

### Phase 5 — Organizer, vendors, invitations, polish  (branch `feat/mbp-05-organizer-vendor`, DONE)
- [x] `Vendor` + `EventVendor` (photographer/DJ/florist coordination) — organizer model B;
      tenant-scoped CRUD (`vendorController.ts`/`/api/vendors`), per-event link with
      role/cost/status, foreign+duplicate rejection; `/dashboard/vendors` + event-detail section
- [x] e-davetiye / RSVP microsite: public `/r/[slug]/invite/[token]` rich invitation
      (hero, event details, venue/map, RSVP form) fed by a per-event `publicToken`
      (mint/rotate via `generateInvitation`); display-safe public payload (no financials);
      public RSVP dedupes guests by case-insensitive name, stamps `respondedAt`
- [x] Quotes/proposals + contract tracking: `contractUrl`, `contractSignedAt`,
      `proposalSentAt`, `venueName`/`venueAddress`/`invitationMessage` on `Event`;
      mark-signed / mark-proposal-sent toggles on the detail page
- [x] New feature flag `hasVendors` (default off; WEDDING profile on) wired through
      `businessProfiles.ts` + sysadmin tenant entitlements UI
- [x] Vertical-specialized nav/titles: `AdminLayout` icons + page H1s use terminology
      per `businessType` (de-restaurant-ified) instead of hardcoded restaurant labels
- [x] Full i18n sweep (TR/EN): `events.*` (seating/vendors/contract/invitation) +
      `vendors.*` namespace added to both `en.json`/`tr.json`
- [x] Regression pass: portable SQLite test harness (Postgres→SQLite swap + client gen);
      `tests/api/organizer.test.ts` (7 cases: vendor CRUD, invalid category, tenant
      isolation, event-vendor foreign+duplicate rejection, invitation token +
      display-safe payload, public RSVP dedup, unknown-token 404); full suite **40/40**

## 5. Tier-1 vertical specs

Display labels shown as `EN / TR`. All reuse the existing engine; differences are
terminology + which feature flags default on + (salon/clinic) per-service duration.

| Vertical | Resource | Zone | Booking | Catalog | Notable features on | Off |
|---|---|---|---|---|---|---|
| **RESTAURANT** | Table / Masa | Section / Bölüm | Reservation / Rezervasyon | Menu / Menü | menu, shift, waitTime, payment | — |
| **SALON** (barber/beauty/tattoo) | Chair·Staff / Koltuk·Personel | Station / İstasyon | Appointment / Randevu | Services / Hizmetler | menu(services)+duration, shift, waitTime(walk-ins) | — |
| **SPORTS** (court/lane/room) | Court / Kort | Area / Alan | Booking / Rezervasyon | Services / Hizmetler | payment(deposit) | waitTime, menu(optional) |
| **COWORKING** | Room·Desk / Oda·Masa | Floor / Kat | Booking / Rezervasyon | — | payment | menu, waitTime |
| **CLINIC** | Practitioner·Room / Doktor·Oda | Department / Bölüm | Appointment / Randevu | Services / Hizmetler | menu(services)+duration, shift | waitTime |

## 6. Wedding schema (Phase 4 — draft)

```prisma
// Wedding "booking" with a sales pipeline. May extend Reservation/Booking instead
// of a new model — decide at Phase 4 start based on how much Reservation is reused.
model Event {
  id             String   @id @default(uuid())
  restaurantId   String   // tenant (venue/organizer)
  resourceId     String?  // the Hall (BookableResource) for a date-slot
  eventType      String   @default("WEDDING") // WEDDING, ENGAGEMENT, HENNA, CORPORATE
  clientName     String   // couple / client
  clientPhone    String
  eventDate      String   // YYYY-MM-DD (single date-slot; availability via DaySetting-style)
  slot           String?  // e.g. "EVENING" / "AFTERNOON"
  guestCount     Int
  packageId      String?  // CatalogItem (package tier)
  stage          String   @default("LEAD") // LEAD, VISIT, QUOTE, CONTRACT, CONFIRMED, COMPLETED, CANCELED
  coordinatorId  String?  // assigned staff User
  quotedTotal    Int?     // minor units
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model PaymentPlan {
  id           String   @id @default(uuid())
  restaurantId String
  eventId      String
  totalAmount  Int      // minor units
  currency     String   @default("TRY")
  installments PaymentInstallment[]
}

model PaymentInstallment {
  id         String    @id @default(uuid())
  planId     String
  dueDate    String    // YYYY-MM-DD
  amount     Int       // minor units
  status     String    @default("PENDING") // PENDING, PAID, OVERDUE
  paymentId  String?   // links to existing Payment row when charged
}

model Guest {
  id         String  @id @default(uuid())
  eventId    String
  name       String
  partySize  Int     @default(1)
  rsvp       String  @default("PENDING") // PENDING, YES, NO, MAYBE
  resourceId String? // seating: assigned guest table (BookableResource)
  dietary    String?
  note       String?
}
```

## 7. Conventions to honor (from CLAUDE.md + memory)

- Every tenant query filters by `restaurantId`; new routes mount `tenantMiddleware`
  ahead of them in `src/app.ts`. Auth layers `authMiddleware`/`roleMiddleware`.
- Bilingual TR+EN is required for every new user-facing string (both locale files).
- Never show raw UUIDs in dashboard selects — map id → human name (§7 PROJECT_LOGIC).
- Schema changes: `db push` + hand-authored migration, then `prisma:generate`
  (memory `prisma-migrate-broken-shadow-db`).
- The Prisma client is generated (not committed — it's gitignored). `build`,
  `typecheck`, and `postinstall` all run `prisma generate` first so a fresh
  checkout/deploy can't compile against a stale client. Don't drop that step.
- Base UI Select: root needs the items label map (memory `base-ui-select-value-items-map`).
- Dashboard layout: no top header; account controls in sidebar; `lg` mobile breakpoint.
- Frontend is Next.js 16 / React 19 — check `frontend/node_modules/next/dist/docs/`
  before relying on remembered APIs.

## 8. Build log (what was actually shipped, per phase)

Retrospective record of the concrete changes merged for each phase. Update this at
the end of every phase.

### Phase 0 — bootstrap (commit `f37e3e7`)
- Integration branch `feat/multi-business-platform` off `develop`; this roadmap;
  memory pointer `multi-business-platform-initiative`.

### Phase 1 — vertical foundation (branch `feat/mbp-01-vertical-foundation`, merged `c887cac`)
- **schema**: `Restaurant.businessType String @default("RESTAURANT")` (additive
  migration `20260705000000_add_business_type`).
- **backend**: `src/config/businessProfiles.ts` (BUSINESS_TYPES + per-vertical
  default `FeatureProfile`); `systemController.createTenant` seeds the profile +
  accepts `businessType`; `updateTenantSettings` applies profile on type switch
  (explicit flags win) and updates `Restaurant.businessType`; `settingsController`
  GET `/settings` now returns `businessType`.
- **frontend**: `lib/terminology.ts` (businessType×locale label table, RESTAURANT
  fallback) + `hooks/useTerms.ts` + `store/useTenantStore.ts`; `AdminLayout`
  hydrates businessType from `/settings` and relabels sidebar nav for non-restaurant
  tenants; SysAdmin tenant provision + entitlements dialogs get a Business Type
  `<select>`.
- **verification**: backend+frontend `tsc` clean; 23/23 tests.

### Phase 2 — standardization rename (branch `feat/mbp-02-standardization-rename`, merged `5623be7`)
- **schema**: `model Table → BookableResource` (`@@map("Table")`), `model TableType →
  Zone` (`@@map("TableType")`); relation TYPES updated on `Restaurant`,
  `Reservation`, `FloorElement`. **No data migration** — `db push` = "already in
  sync". Relation/field names (`tableId`, `tableType`, `tables`, `tableTypes`)
  deliberately KEPT → API shapes identical → **frontend untouched**.
- **backend**: rewrote accessors `prisma.table→prisma.bookableResource`,
  `prisma.tableType→prisma.zone` (+ `tx.`/`client.` aliases) across
  `tableController`, `tableTypeController`, `floorElementController`,
  `publicController`, `restaurantController`, `reservationController`,
  `restaurantService`, `utils/reservationConflict`, `prisma/seed.ts`,
  `scripts/demo-data.ts`.
- **verification**: backend `tsc` clean; 23/23 tests against mapped tables.

### Phase 3 — Tier-1 verticals (branch `feat/mbp-03-tier1-verticals`)
- **schema**: `MenuItem.durationMinutes Int?` (per-service length) + `Reservation.serviceId
  String?` with `service MenuItem?` relation and index; back-relation
  `MenuItem.reservations` (additive migration `20260705100000_add_service_duration`;
  `db push` = in sync, no data loss).
- **backend**: `reservationController.createReservation` parses `serviceId`, looks up
  the service scoped to the tenant (`category.menu.restaurantId`), uses its
  `durationMinutes` for the conflict window + stored `endTime` when present, stores
  `serviceId` (foreign/unknown → nulled, falls back to default). `menuController`
  create/update accept and parse `durationMinutes`.
- **frontend**: Duration (min) input on the menu-item form in `dashboard/menus/page.tsx`
  (form state + edit-populate + reset + payload); bilingual key
  `menus.form.serviceDuration` (en "Duration (min)" / tr "Süre (dk)").
- **verification**: backend+frontend `tsc` clean; new `tests/api/reservation-service-duration.test.ts`
  (3 cases: duration override, default fallback, foreign-tenant service rejected);
  full suite **26/26**.
- **deferred**: staff-as-resource (booking a specific practitioner) — future phase.

### Phase 4a — wedding module backend (branch `feat/mbp-04-wedding-module`)
- **schema** (additive migration `20260705200000_add_wedding_module`; `db push` in
  sync): 4 new models — `Event` (pipeline, client, eventDate/slot, guestCount,
  quotedTotal; relations to hall/package/coordinator via `EventHall`/`EventPackage`/
  `EventCoordinator`), `PaymentPlan` (1:1 with event), `PaymentInstallment`
  (label/dueDate/amount/status/paidAt/paymentId), `Guest` (RSVP + seating via
  `GuestSeat`). Back-relations added to `Restaurant`, `User`, `BookableResource`,
  `MenuItem`. 3 new `RestaurantSettings` flags (default false).
- **backend**: `businessProfiles.ts` extended (3 flags; `NO_WEDDING` spread for
  non-wedding verticals, all true for WEDDING). `eventController.ts` — events CRUD
  with stage/eventType validation + per-person `quotedTotal` derivation; payment
  plan upsert + installment add/update/delete (lazy plan create, paidAt auto-stamp);
  guest CRUD with RSVP. All tenant-scoped; hall/package/coordinator/seat references
  validated to belong to the tenant (foreign → nulled). `eventRoutes.ts` at
  `/api/events` (reads any authed user; mutations `manage_events`). i18n
  `errors.not_found` added (en/tr).
- **verification**: backend `tsc` clean; `tests/api/wedding.test.ts` (7 cases incl.
  tenant isolation, pipeline validation, per-person pricing, foreign-package
  rejection, installment paidAt); full suite **33/33**.
- **pending (Phase 4b)**: the wedding dashboard frontend (pipeline board, event
  detail, guest list, payment plan) + nav gating + `manage_events` in provisioning.

### Phase 4b — wedding module frontend (branch `feat/mbp-04b-wedding-frontend`)
- **frontend**: `dashboard/events/page.tsx` — 7-stage pipeline board with create-event
  dialog; `dashboard/events/[id]/page.tsx` — event detail with editable core fields,
  quick stage control, guest list (add/RSVP/delete), and payment plan (total +
  installments add/mark-paid/delete, paid-vs-total summary). Money shown in major
  units (÷100), stored/sent in minor units. Native `<select>`s (option text, no raw
  IDs). `AdminLayout` gains a `PartyPopper` "Events" nav item gated on
  `hasEventPipeline`. `businessProfiles`-driven flags mean it's hidden for non-wedding
  tenants.
- **backend**: `manage_events` added to the default tenant-provisioning permission
  string (ADMIN bypasses `requirePermission` anyway).
- **i18n**: `events.*` namespace (stages/types/rsvp/form + page copy) and
  `common.loading/save/saved` in both `en.json` and `tr.json`.
- **verification**: frontend `tsc` clean; `eslint` 0 errors; `next build` compiles
  `○ /dashboard/events` and `ƒ /dashboard/events/[id]`; backend suite 33/33.
- **deferred (4c/5)**: relational pickers (coordinator/hall/package) + visual seating
  chart — backend already supports them, only the list-picker UI is pending.

### Phase 4c + 5 — organizer, vendors, invitations, polish (branch `feat/mbp-05-organizer-vendor`)
Phase 4c (deferred pickers/seating) was folded into the Phase 5 branch and shipped together.
- **schema/migration** (`20260708000000_add_organizer_vendor`): new `Vendor`
  (tenant-scoped, `category` default `OTHER`, contact fields) + `EventVendor`
  (`@@unique([eventId, vendorId])`, `role`/`cost`/`status`); `Event` gains
  `contractUrl`/`contractSignedAt`/`proposalSentAt`/`publicToken @unique`/
  `invitationMessage`/`venueName`/`venueAddress`; `RestaurantSettings.hasVendors`
  (default false); `Guest.respondedAt`. Postgres DDL (separate `ADD CONSTRAINT` FKs).
- **backend**: `vendorController.ts` (CRUD, `_count.eventVendors`) + `/api/vendors`
  (reads any authed user, mutations `manage_events`). `eventController.ts` gains
  event-vendor link CRUD (tenant-scoped ownership guards, foreign+duplicate rejection),
  `generateInvitation` (mint/rotate `publicToken` via `crypto.randomBytes(24)`), and
  contract/venue/message fields on update. `publicController.ts`:
  `getInvitation` (display-safe — no financials) + `submitInvitationRsvp` (portable
  JS case-insensitive guest dedup, stamps `respondedAt`); mounted on `/api/public`.
- **feature flag**: `hasVendors` added to `FeatureProfile`/`FEATURE_FLAG_KEYS`
  (WEDDING on, others off) — flows automatically through provisioning + settings.
- **frontend**: `dashboard/events/[id]` — relational pickers (coordinator/hall/package,
  names only), live quote preview, seating board (unseated bucket + per-resource
  capacity/over cards), vendors section, contract toggles, invitation link generator.
  New `dashboard/vendors` category-filtered CRUD. Public `r/[slug]/invite/[token]`
  rich e-davetiye (warm serif microsite, tenant accent color, RSVP + thank-you state,
  Google Maps link). `AdminLayout` per-`businessType` `VERTICAL_ICONS` + `hasVendors`
  nav item; `tables`/`reservations` H1s use terminology (de-restaurant-ified).
  Sysadmin tenant entitlements gains 4 event/vendor checkboxes.
- **i18n**: `events.*` (seating/vendors/contract/invitation) + full `vendors.*`
  namespace in both `en.json`/`tr.json`.
- **verification**: portable test harness (`prepare-test-db.mjs` Postgres→SQLite swap
  + SQLite client generation); `tests/api/organizer.test.ts` (7 cases); full suite
  **40/40**. PostgreSQL client restored after the run.
