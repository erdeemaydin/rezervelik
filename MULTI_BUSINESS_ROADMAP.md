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
- [ ] Add `durationMinutes Int?` to `MenuItem` (per-service duration; booking flow
      reads it when set, else falls back to `RestaurantSettings.defaultDurationMinutes`)
- [ ] Booking flow: when catalog item has `durationMinutes`, use it for the
      resource-blocking window (extends `reservationController` conflict logic)
- [ ] Option: allow a booking to target a **staff `User`** as the bookable resource
      (salon/clinic) — model staff-as-resource or a `resourceUserId` on booking
- [ ] Terminology + feature profiles for each Tier-1 vertical
- [ ] SysAdmin: expose the new verticals in the `businessType` selector
- [ ] Typecheck + tests + smoke; commit; merge to integration
- **Resume marker:** _Phase 3 not started._

### Phase 4 — Wedding / organization module  (branch `feat/mbp-04-wedding-module`)
The one vertical with genuinely new domain logic. New models isolated under a
wedding module. See §6 for schema.
- [ ] `Event` entity (or `Booking` lifecycle extension): client/couple, eventType,
      eventDate, slot, hall (`BookableResource`), guestCount, package, **pipeline
      stage** (LEAD→VISIT→QUOTE→CONTRACT→CONFIRMED→COMPLETED→CANCELED), coordinator
- [ ] `PaymentPlan` + `PaymentInstallment` (kapora + taksit); each installment links
      to the existing `Payment` row when charged
- [ ] `Guest` list + RSVP (LCV) + seating assignment onto floor-plan `BookableResource`
- [ ] New feature flags: `hasEventPipeline`, `hasInstallmentPlans`, `hasGuestList`
- [ ] Wedding dashboard route group `(wedding)` reusing `AdminLayout`; pipeline board,
      package builder (reuses catalog), payment-plan view, seating/guest list
- [ ] Per-person pricing: total = guestCount × package price + fixed extras
- [ ] Wedding terminology + feature profile
- [ ] Typecheck + tests; commit; merge to integration
- **Resume marker:** _Phase 4 not started._

### Phase 5 — Organizer, vendors, invitations, polish  (branch `feat/mbp-05-organizer-vendor`)
- [ ] `Vendor` + `EventVendor` (photographer/DJ/florist coordination) — organizer model B
- [ ] e-davetiye / RSVP microsite reusing public `/r/[slug]` infra
- [ ] Quotes/proposals + contract document attach
- [ ] Full i18n sweep (TR/EN) for all new strings; docs update (`PROJECT_LOGIC.md`)
- [ ] Regression pass across all verticals; merge integration → `develop`

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
- Base UI Select: root needs the items label map (memory `base-ui-select-value-items-map`).
- Dashboard layout: no top header; account controls in sidebar; `lg` mobile breakpoint.
- Frontend is Next.js 16 / React 19 — check `frontend/node_modules/next/dist/docs/`
  before relying on remembered APIs.
```
```
