# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant SaaS platform for restaurants: table/reservation management, a digital QR-code menu system, waitlist/wait-time display, staff scheduling, and per-tenant frontend customization. A single Express + Prisma backend and single Next.js frontend serve all tenants. See `PROJECT_LOGIC.md` for the full domain model and `API_DOCS.md` for the endpoint reference — read both before making non-trivial backend changes. `ROADMAP.md` tracks what's built vs. planned.

This is two apps in one repo, not a monorepo tool (no workspaces/turborepo):
- **Root (`/`)**: Express + TypeScript + Prisma backend, runs on port 3000.
- **`frontend/`**: Next.js 16 (App Router) + React 19 frontend, runs on port 3001.

## Commands

### Backend (run from repo root)
```bash
npm run dev              # start backend with hot reload (ts-node-dev), port 3000
npm run build             # compile TypeScript to dist/
npm start                 # run compiled server (dist/server.js)
npm run prisma:generate   # regenerate Prisma client after schema changes
npm run prisma:migrate    # create/apply a dev migration
npm run prisma:studio     # open Prisma Studio GUI on the SQLite db
```
There is no lint or test script for the backend and no test framework is configured.

### Frontend (run from `frontend/`)
```bash
npm run dev     # Next.js dev server, port 3001
npm run build
npm start
npm run lint    # eslint
```
No test framework is configured for the frontend either.

### Database
- SQLite, file at `prisma/dev.db` (gitignored). Schema: `prisma/schema.prisma`. Seed script: `prisma/seed.ts`.
- After editing `schema.prisma`, run `npm run prisma:migrate` then `npm run prisma:generate` from the repo root.

## Architecture

### Multi-tenancy
Every tenant-scoped request must carry an `X-Restaurant-ID` header (a `Restaurant.id` UUID). `tenantMiddleware` (`src/middlewares/tenant.ts`) reads this header and attaches `req.restaurantId`; it 400s if the header is missing. It is mounted per-route-group in `src/app.ts`, not globally. Nearly all Prisma queries in controllers must filter by `restaurantId` — when adding a new controller/route, follow the existing pattern of mounting `tenantMiddleware` ahead of it in `app.ts` and scoping every query.

Auth (`src/middlewares/auth.ts`) is separate and layered on top: `authMiddleware` verifies the JWT and additionally checks that the token's `restaurantId` matches `req.restaurantId` (unless the caller is `SUPER_ADMIN`) — so tenant-header spoofing across tenants is rejected at the auth layer, not the tenant layer. `roleMiddleware(roles)` gates by role (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `STAFF`), and `requirePermission(name)` checks the comma-separated `User.permissions` string for finer-grained module access (bypassed by `SUPER_ADMIN`/`ADMIN`).

Route mounting lives entirely in `src/app.ts` — that file is the map of which prefixes are public, auth-only, or tenant+auth-scoped.

### Reservation logic modes
`RestaurantSettings` configures one of three mutually exclusive reservation behaviors per tenant (see `PROJECT_LOGIC.md` §3): `FIXED_TIME_SLOT`, `DYNAMIC_DURATION` (end time computed from `defaultDurationMinutes`), or `MANUAL_AVAILABILITY` (staff manually toggle table status). Code touching `reservationController.ts` or the booking flow needs to branch on this mode.

### Public-facing layout system
The tenant-facing booking/menu page (`frontend/src/app/r/[slug]/page.tsx`) dispatches to one of four layout components based on `restaurant.customization.layoutStyle`: `ClassicLayout` (default/`CLASSIC_LIST`), `PremiumLayout` (`EDITORIAL_IMAGE`), `OldenLayout` (`ANIMATED`), `GardenLayout` (`GARDEN_FRESH`, light/warm). Per `PROJECT_LOGIC.md` §8, this design-architecture choice is set exclusively by the SysAdmin via `PUT /api/system/tenants/:id/settings`, not by the tenant — don't add tenant-facing UI to change it. Tenant-controllable customization (colors, typography, announcement banner, about/legal text) goes through `customizationController.ts` / `frontend/.../dashboard/customization`. A dedicated QR-friendly menu-only route (`frontend/src/app/r/[slug]/menu/page.tsx`) renders the same layout components with a `menuOnly` prop that hides the hero/reservation sections but keeps the tenant's branding.

### System admin vs. tenant admin
There are two separate frontend surfaces and role tiers:
- `/system-admin/*` — `SUPER_ADMIN` only, backed by `src/controllers/systemController.ts` and `/api/system/*`. Manages tenant provisioning, subscriptions, feature-flag toggles, and `layoutStyle`.
- `/dashboard/*` — tenant staff (`ADMIN`/`MANAGER`/`STAFF`), scoped by `X-Restaurant-ID` + JWT as above.

### Internationalization (Turkish + English)
Both backend and frontend are fully bilingual (`PROJECT_LOGIC.md` §1) — this is not optional coverage, it's a project requirement for new user-facing strings.
- **Backend**: `i18next` + `i18next-fs-backend`, initialized in `src/config/i18n.ts`, dictionaries in `src/locales/{en,tr}.json`. Language is set per-request in `src/app.ts` from the `Accept-Language` header. Error/response helpers in `src/utils/response.ts` take i18n keys (e.g. `errors.unauthorized`), not literal strings.
- **Frontend**: `react-i18next`, dictionaries in `frontend/src/i18n/locales/{en,tr}.json`, default locale is `tr` (`frontend/src/i18n/index.ts`). `scripts/merge_i18n.js` merges any stray `temp_*.json` files in that locales directory into `en.json`/`tr.json` and deletes the temp files — used when translations were generated into scratch files and need consolidating.
- When adding new UI strings, add keys to both `en.json` and `tr.json` together.

### Frontend data/auth flow
- `frontend/src/lib/api.ts` is the single Axios instance. Its request interceptor attaches `Authorization: Bearer <token>` and `X-Restaurant-ID` from cookies (`token`, `restaurantId`) automatically — controllers/pages should call through this instance rather than raw `axios` or `fetch` so tenant scoping isn't accidentally dropped. Its response interceptor clears cookies and redirects to `/auth/login` on 401.
- `frontend/src/store/useAuthStore.ts` (Zustand) is the source of truth for the logged-in user; it hydrates from the `user`/`token` cookies on init. `login()`/`logout()` there are the only places that should mutate those auth cookies.
- Route layout: `dashboard/*` pages share `AdminLayout`; `system-admin/*` pages share `SystemAdminLayout`.

### Scheduled/background work
- `src/workers/priceUpdater.ts` executes `ScheduledPriceUpdate` records (bulk percentage/fixed menu price changes, immediate or future-dated) — see `PROJECT_LOGIC.md` §9.
- `src/services/aiMenuService.ts` is a placeholder service layer for the planned AI/OCR menu importer (`PROJECT_LOGIC.md` §6) — not yet wired to a real provider.

### Shift scheduling constraints
`schedulingController.ts` / `EmployeeAvailability` / `ShiftAssignment` implement the rules in `PROJECT_LOGIC.md` §10: required staff counts come from `ShiftDayRequirement` (per weekday), and the assigner must warn on `DOUBLE_SHIFT` conflicts, `CONSECUTIVE_REST` violations (minimum 11 hours between shifts), and assigning staff marked `UNAVAILABLE` that day. Preserve these checks when touching the assignment logic.

### UI convention: never expose raw IDs
Per `PROJECT_LOGIC.md` §7, dropdowns/selects in the admin dashboard must never show a raw database UUID — always map the selected `id` to its human-readable `name`/`identifier` in the displayed value.

## Environment

Backend expects a `.env` at the repo root (gitignored, no `.env.example` present) with at least a Prisma `DATABASE_URL` override if not using the default SQLite path, `JWT_SECRET`, and `SETUP_SECRET_TOKEN` (required to bootstrap the first `SUPER_ADMIN` via `POST /api/system/setup-super-admin`; also gates whether `publicRegistrationEnabled` matters). Frontend reads `NEXT_PUBLIC_API_URL` (falls back to `http://<host>:3000/api`).

## Notes for this Next.js version

`frontend/AGENTS.md` (loaded via `frontend/CLAUDE.md`) warns that the installed Next.js version (16.2.4, App Router, React 19) has breaking changes vs. training-data assumptions — check `frontend/node_modules/next/dist/docs/` before relying on remembered Next.js APIs/conventions.
