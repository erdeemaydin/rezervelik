# Rezervelik

**Multi-tenant SaaS for restaurants and booking-based businesses** — reservations, floor plans, QR menus, waitlists, staff scheduling, online ordering and per-tenant branded booking pages, served from one backend, one database and one frontend.

[![CI](https://github.com/erdeemaydin/rezervelik/actions/workflows/ci.yml/badge.svg)](https://github.com/erdeemaydin/rezervelik/actions/workflows/ci.yml)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)
![i18n](https://img.shields.io/badge/i18n-TR%20%7C%20EN-c2410c)

<!--
  Screenshots: add images under docs/screenshots/ and reference them here, e.g.
  ![Dashboard](docs/screenshots/dashboard.png)
-->

| | |
|---|---|
| **Live demo** | [ayd-dine.duckdns.org](https://ayd-dine.duckdns.org) |
| **Built** | April – September 2026 · ~330 commits · 18 integration merges |
| **Status** | Deployed to a production VPS (Nginx · pm2 · PostgreSQL · daily backups) |
| **Scope** | 27 controllers · 40+ Prisma models · 14 migrations · 60+ API integration test suites |
| **Languages** | Turkish and English, end to end (dashboard, public pages, API error messages) |

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Key engineering decisions](#key-engineering-decisions)
- [Quality & delivery](#quality--delivery)
- [How I worked](#how-i-worked)
- [Getting started](#getting-started)
- [Documentation map](#documentation-map)

---

## What it does

**For guests** — a branded public page per tenant (`/r/<slug>`) with eight curated layouts, live availability, booking with KVKK consent, a date waitlist when a day is full, a QR-friendly menu-only view, e-invitations with RSVP, and online ordering with delivery-zone checks.

**For tenant staff** (`/dashboard`)

| Area | Highlights |
|---|---|
| Reservations | List, calendar and Gantt-style timeline; three booking modes; conflict detection with staff override; opt-in overbooking caps; no-show history per phone number |
| Floor plan | Drag-and-drop editor on a fixed logical canvas that scales to any screen |
| Host console & waitlist | Real-time walk-in queue, wait-time estimates, offer/accept links |
| Menus | Categories, modifiers, pairings, dietary/regulatory fields, QR codes, printable PDF, **scheduled bulk price updates** (background worker) |
| Staff | Shift requirements per weekday, assignment with `DOUBLE_SHIFT` / 11-hour `CONSECUTIVE_REST` / availability warnings, time clock and worked hours |
| Orders | Order station with live updates (SSE), order settings, delivery zones, printable tickets |
| Events | Wedding/event pipeline (lead → contract → completed), installment plans, guest list & seating, vendors |
| Insights | Analytics, payments, reviews, audit log |
| Branding | Colors, typography, announcement banner, about/legal/privacy text, live preview |

**For the platform owner** (`/system-admin`) — tenant provisioning, subscriptions, per-tenant feature flags and add-on packages, layout selection, currency/2FA/language defaults, root and restricted sub-admins, maintenance mode, platform audit log.

---

## Architecture

```mermaid
flowchart LR
    subgraph Clients
        G[Guest browser<br/>/r/slug · menu · order]
        S[Staff dashboard<br/>/dashboard]
        A[Platform admin<br/>/system-admin]
        OS[Order station<br/>kitchen screen]
    end

    subgraph Frontend["Next.js 16 · React 19"]
        FE[App Router pages<br/>Zustand auth store<br/>single Axios client<br/>react-i18next]
    end

    subgraph Backend["Express · TypeScript"]
        MW[Middleware chain<br/>maintenance → tenant → auth → role → permission → feature flag]
        C[Controllers<br/>27 domain modules]
        SV[Services<br/>payments · storage · messaging · audit · OTP]
        W[In-process workers<br/>price updater · KVKK retention]
    end

    DB[(PostgreSQL<br/>Prisma ORM)]
    EXT[External providers<br/>PayTR · S3 · Netgsm SMS · WhatsApp · Sentry]

    G & S & A & OS --> FE
    FE -- "REST + JWT<br/>X-Restaurant-ID" --> MW --> C --> DB
    C --> SV --> EXT
    W --> DB
    C -. "SSE order events" .-> OS
```

### Request pipeline: how tenant isolation is enforced

Every tenant-scoped request passes the same chain. The tenant header alone is never trusted: the JWT has to belong to the same tenant.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant T as tenantMiddleware
    participant Au as authMiddleware
    participant R as role / permission / feature
    participant C as Controller
    participant DB as PostgreSQL

    B->>T: GET /api/reservations<br/>X-Restaurant-ID + Bearer JWT
    T-->>B: 400 if header missing
    T->>Au: req.restaurantId
    Au-->>B: 401 invalid token
    Au-->>B: 403 if token.restaurantId ≠ header (unless SUPER_ADMIN)
    Au->>R: req.user
    R-->>B: 403 role / permission / feature flag off
    R->>C: authorized
    C->>DB: every query filtered by restaurantId
    DB-->>B: tenant-scoped data
```

### Reservation decision flow

The booking engine has to balance "never double-book a table" against real restaurant behaviour (staff overrides, overbooking, walk-ins).

```mermaid
flowchart TD
    R[Booking request] --> WHO{Guest or staff?}
    WHO -- guest --> K{KVKK consent given?}
    K -- no --> E400[400 CONSENT_REQUIRED]
    K -- yes --> CAP{Day covers cap<br/>would be exceeded?}
    CAP -- yes --> E409C[409 DAY_CAPACITY_EXCEEDED]
    CAP -- no --> SEL
    WHO -- staff --> SEL{Specific table chosen?}

    SEL -- yes --> CF{Overlaps another booking<br/>in the reservation window?}
    CF -- no --> AC
    CF -- yes --> OV{Staff with<br/>overrideConflict?}
    OV -- yes --> AC
    OV -- no --> E409T[409 TABLE_CONFLICT]

    SEL -- no --> FREE{Smallest free table<br/>that fits?}
    FREE -- found --> AC
    FREE -- none --> FIT{Any table big enough<br/>at all?}
    FIT -- no --> E400N[400 party too large]
    FIT -- yes --> ST{Staff booking?}
    ST -- yes --> P1[PENDING · unassigned,<br/>resolved by staff]
    ST -- no --> OB{Overbooking enabled<br/>and under both caps?}
    OB -- yes --> P2[PENDING · overbooked]
    OB -- no --> E409F[409 FULLY_BOOKED<br/>day flagged → date waitlist]

    AC{Day auto-confirm on<br/>and table assigned?}
    AC -- yes --> C1[CONFIRMED<br/>or AWAITING_PAYMENT if deposit required]
    AC -- no --> P3[PENDING]
```

The cap and overbooking counts are re-read inside the same database transaction as the insert, so two simultaneous bookings cannot both slip past a limit.

### Core data model (excerpt)

```mermaid
erDiagram
    Restaurant ||--|| RestaurantSettings : configures
    Restaurant ||--o| FrontendCustomization : brands
    Restaurant ||--o{ User : employs
    Restaurant ||--o{ Zone : has
    Zone ||--o{ BookableResource : groups
    Restaurant ||--o{ Reservation : receives
    BookableResource ||--o{ Reservation : "assigned to"
    Reservation ||--o{ Payment : "deposit / refund"
    Restaurant ||--o{ WaitlistEntry : queues
    Restaurant ||--o{ Menu : publishes
    Menu ||--o{ MenuCategory : contains
    MenuCategory ||--o{ MenuItem : lists
    Restaurant ||--o{ Shift : defines
    Shift ||--o{ ShiftAssignment : staffed_by
    User ||--o{ ShiftAssignment : works
    User ||--o{ EmployeeAvailability : declares
    Restaurant ||--o{ Order : takes
    Order ||--o{ OrderItem : contains
    Restaurant ||--o{ Event : hosts
    Event ||--o{ Guest : invites
    Event ||--o| PaymentPlan : "paid via"

    Restaurant {
        uuid id
        string slug "public URL /r/slug"
        string businessType "RESTAURANT, WEDDING, SALON ..."
    }
    RestaurantSettings {
        string logic "FIXED_TIME_SLOT, DYNAMIC_DURATION, MANUAL_AVAILABILITY"
        int defaultDurationMinutes
        bool allowOverbooking
        bool hasEventPipeline "one of many feature flags"
    }
    FrontendCustomization {
        string layoutStyle "8 layouts, platform-owned"
    }
    Reservation {
        datetime startTime
        datetime endTime
        string status
        bool consentAccepted
        string confirmationCode
    }
```

The full schema is in [`prisma/schema.prisma`](prisma/schema.prisma). The domain rules behind it are in [`docs/architecture/PROJECT_LOGIC.md`](docs/architecture/PROJECT_LOGIC.md).

---

## Key engineering decisions

| Decision | Why |
|---|---|
| **Shared database, row-level tenancy** (`restaurantId` on every row, header + JWT cross-check) | One deployment to operate; isolation is enforced in one middleware chain and covered by dedicated cross-tenant tests |
| **One platform, many verticals** instead of forking for weddings, salons, clinics… | About 70% of the value (auth, RBAC, 2FA, i18n, payments, scheduling, CMS) is shared. Verticals are a `businessType` with terminology tables and feature-flag profiles. See [Multi-business roadmap](docs/planning/MULTI_BUSINESS_ROADMAP.md) §1 |
| **Provider interfaces with mock implementations** for payments (PayTR), storage (S3 / local disk) and messaging (SMS / WhatsApp) | The full flow runs end to end without real accounts. Going live means swapping a provider, not rewriting features ([Mock implementations](docs/engineering/MOCK_IMPLEMENTATIONS.md)) |
| **Hosted payment iframe** over direct card API | Keeps PCI scope at SAQ A ([Payments design](docs/architecture/PAYMENTS.md)) |
| **Design choices that affect the product are platform-owned** (layout, add-on packages, currency) | Tenants customize branding, not architecture, so support stays predictable |
| **Same database engine everywhere** (PostgreSQL in prod, dev, CI and tests) | Removed a whole class of "works on SQLite" bugs. Migrations were squashed to one clean baseline when switching |
| **Standard error envelope** `{ code, error, message, details }` with i18n keys | The frontend shows localized, field-level errors without guessing |
| **KVKK by design**: server-enforced consent, separate marketing opt-in, daily anonymization worker | Turkish data protection law; the platform is the data processor, each tenant the controller |

---

## Quality & delivery

- **Tests on real PostgreSQL.** Vitest + Supertest, an isolated test database provisioned automatically (container locally, service container in CI).
- **What is tested** is the risky stuff: cross-tenant access and IDOR, role escalation, 2FA bypass, rate limits, XSS in tenant HTML, race conditions (double assignment, waitlist offer acceptance, RSVP and vendor linking), timezone handling in analytics, payment refunds.
- **CI gate** ([`ci.yml`](.github/workflows/ci.yml)): blocking `npm audit`, migrations, tests, type-check and build for the backend; lint, types, unit tests and build for the frontend. Post-deploy smoke test ([`smoke.yml`](.github/workflows/smoke.yml)), Dependabot.
- **Operations**: written runbooks for [server setup](docs/operations/SERVER_SETUP.md), [database backups & restore](docs/operations/DATABASE_RUNBOOK.md), [staging](docs/operations/STAGING.md), [monitoring](docs/operations/MONITORING.md) and a [pre-deploy checklist](docs/operations/PRE_DEPLOY_SMOKE_CHECKLIST.md).

---

## How I worked

I built this as a solo product owner and engineer, using AI coding agents (Claude Code, Gemini) to implement. Product scope, architecture, sequencing, review and the merge decisions were mine. The repository is set up so that this process is visible.

**1. Plan before building.** Every larger initiative starts as a written plan with decisions, phases and checkboxes, and is updated as the work ships:

- [Production roadmap](docs/planning/PRODUCTION_ROADMAP.md): security, KVKK, ops and payments gaps before going live
- [Multi-business roadmap](docs/planning/MULTI_BUSINESS_ROADMAP.md): turning a restaurant tool into a multi-vertical platform, including a per-phase build log
- [Online ordering plan](docs/packaging/online-ordering-plan.md), [spec](docs/packaging/online-ordering-spec.md) and [v3 plan](docs/packaging/online-ordering-v3-plan.md)

**2. One branch per phase, merged when green.** For example, the multi-business initiative:

```mermaid
%%{init: {'gitGraph': {'mainBranchName': 'develop'}}}%%
gitGraph
    commit id: "roadmap"
    branch feat/multi-business-platform
    branch feat/mbp-01-vertical-foundation
    commit id: "businessType + terminology"
    checkout feat/multi-business-platform
    merge feat/mbp-01-vertical-foundation id: "Phase 1"
    branch feat/mbp-02-standardization-rename
    commit id: "Table → BookableResource"
    checkout feat/multi-business-platform
    merge feat/mbp-02-standardization-rename id: "Phase 2"
    branch feat/mbp-04-wedding-module
    commit id: "event pipeline backend"
    commit id: "wedding dashboard"
    checkout feat/multi-business-platform
    merge feat/mbp-04-wedding-module id: "Phase 4"
    branch feat/mbp-05-organizer-vendor
    commit id: "vendors + e-invitations"
    checkout feat/multi-business-platform
    merge feat/mbp-05-organizer-vendor id: "Phase 5"
    checkout develop
    merge feat/multi-business-platform id: "integrate"
```

Branching and release rules are in [Git workflow](docs/engineering/GIT_WORKFLOW.md). Commits follow `type(scope): summary`.

**3. Give agents a contract, not a prompt.** [`CLAUDE.md`](CLAUDE.md) defines the architecture rules every change must respect: tenant scoping, i18n in both languages, never exposing raw IDs, which settings are platform-only. Agent output is reviewed against it and against the tests. Commits that an AI agent co-wrote carry a `Co-Authored-By` trailer, so the history is transparent about it.

**4. Keep a journal.** [Progress log](docs/journal/PROGRESS.md) and [work log](docs/journal/WORK_LOG.md) record what was done, what was found during audits, and what was deliberately postponed.

---

## Getting started

**Requirements:** Node.js 20+, and PostgreSQL 16 or Podman/Docker for the test database.

```bash
# Backend (repo root, port 3000)
cp .env.example .env              # set DATABASE_URL, JWT_SECRET, SETUP_SECRET_TOKEN
npm install
npx prisma migrate deploy
npx ts-node prisma/seed.ts        # demo tenant "gourmet-bistro"
npm run dev

# Frontend (port 3001)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open <http://localhost:3001/r/gourmet-bistro> for the public page, or log in at `/auth/login` with `admin@gourmetbistro.com` / `password123`.
To fill a day with realistic data: `npm run demo -- --restaurant gourmet-bistro --date 2026-09-01`.

```bash
# Tests
npm run test:setup-db   # starts a throwaway Postgres on :5433 (or uses TEST_DATABASE_URL)
npm test
cd frontend && npm run lint && npm test
```

---

## Documentation map

| Folder | Contents |
|---|---|
| [`docs/architecture`](docs/architecture) | [Domain logic](docs/architecture/PROJECT_LOGIC.md) · [API reference](docs/architecture/API_DOCS.md) · [Payments design](docs/architecture/PAYMENTS.md) |
| [`docs/planning`](docs/planning) | [Roadmap](docs/planning/ROADMAP.md) · [Production roadmap](docs/planning/PRODUCTION_ROADMAP.md) · [Multi-business roadmap](docs/planning/MULTI_BUSINESS_ROADMAP.md) · [Feature opportunities](docs/planning/FEATURE_OPPORTUNITIES.md) |
| [`docs/packaging`](docs/packaging) | Add-on packages (hosted site, widget) and online ordering plans |
| [`docs/engineering`](docs/engineering) | [Git workflow](docs/engineering/GIT_WORKFLOW.md) · [Testing & CI/CD](docs/engineering/TESTING_AND_CICD.md) · [Mock implementations](docs/engineering/MOCK_IMPLEMENTATIONS.md) |
| [`docs/operations`](docs/operations) | Server setup · Staging · Database runbook · Monitoring · Pre-deploy checklist |
| [`docs/journal`](docs/journal) | Progress log, work log, daily summaries |

---

## License

© 2026 Muhammed Erdem Aydin. All rights reserved. The source is public for portfolio and review purposes. Please ask before reusing it.
