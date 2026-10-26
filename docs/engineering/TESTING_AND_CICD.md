# Testing & CI/CD Plan — Dining Reservation Platform

This document is the test strategy for taking the platform from commit → CI → production
safely, and for guaranteeing that **an update to production doesn't break existing behavior**.

> **Refreshed 2026-08-11:** this doc previously described the test suite as running against a
> throwaway **SQLite** file. That's stale — the suite runs on real **PostgreSQL** everywhere
> (same engine as production, no SQLite anywhere in this repo), matching `CLAUDE.md` and
> `docs/operations/DATABASE_RUNBOOK.md`. §2/§3/§5/§7 below are corrected to match current code
> (`tests/setup/prepare-test-db.mjs`, `.github/workflows/ci.yml`) as of this refresh.

## 1. Goals

1. **Regression safety** — every merge to `main` proves the critical flows still work.
2. **Multi-tenant + RBAC correctness** — the security invariants (tenant isolation, permission
   guards, role-based 2FA) are covered by automated tests, not manual clicking.
3. **Deployability** — the exact build that ships is type-checked and boots; a post-deploy
   smoke test confirms the live instance is healthy before traffic is trusted.

## 2. Test pyramid

| Layer | Tool | What it covers | Where it runs |
|-------|------|----------------|---------------|
| Unit (backend) | Vitest | Pure logic: TOTP, JWT, permission strings | CI `backend` job |
| Integration (backend) | Vitest + Supertest | HTTP API against the real Express app + an isolated PostgreSQL DB (same engine as production): auth, tenant isolation, RBAC, scheduling visibility, menu/live-menu, bulk-price, settings authority | CI `backend` job |
| Unit (frontend) | Vitest | Pure libs: `lib/format`, `lib/workedHours` | CI `frontend` job |
| Static | `tsc --noEmit`, `eslint`, `next build` | Type safety, lint, production build | CI both jobs |
| Smoke (post-deploy) | `scripts/smoke-test.mjs` | Hits the **live** URL: `/health`, a login round-trip, an authenticated tenant-scoped read | CD, after deploy |

We deliberately keep browser E2E (Playwright) out of the required gate for speed/flakiness;
the integration layer exercises the same backend contracts the UI depends on. A Playwright
scaffold can be added later behind an optional job.

## 3. Environments & data

- **Isolated test DB**: tests never touch the real dev/production database — same engine
  (PostgreSQL) everywhere, no SQLite anywhere in this repo. `npm run test:setup-db`
  (`tests/setup/prepare-test-db.mjs`) resets and re-applies every committed Prisma migration to a
  throwaway `dining_test` database, then the suite runs against it. Where that database comes from
  depends on the environment:
  - **CI**: a Postgres service container (`.github/workflows/ci.yml`), reachable at
    `TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/dining_test?schema=public`.
  - **Local dev**: if `TEST_DATABASE_URL` (or `DATABASE_URL`) is already set to a reachable
    Postgres, the script just resets + migrates it. Otherwise it starts a throwaway Podman/Docker
    Postgres container (`dining-test-pg`) on port 5433 automatically. If neither a container engine
    nor an explicit URL is available (e.g. a sandboxed environment with no Docker/Podman but a
    Postgres server already running), hand-create a `dining_test` database on that server and pass
    it via `TEST_DATABASE_URL` — see `tests/setup/test-env.ts` for the exact default it falls back
    to.
  - `tests/setup/test-env.ts` (the Vitest `setupFiles` entry) points `DATABASE_URL` at the test
    database before any module imports the Prisma client, and `src/config/prisma.ts` honors that
    override (see that file).
- **Seed**: `tests/helpers/seed.ts` creates two restaurants (tenant isolation) each with an
  ADMIN / MANAGER / STAFF / HOST user, settings, a menu, shift, etc., and hands back valid
  JWTs generated with the same `utils/jwt` the app uses.
- **Secrets**: tests set `JWT_SECRET` in-process so the tokens they mint verify against the
  app running in the same process. Production sets real secrets via env (`.env.example`).

## 4. Critical flows under test (the "must never regress" list)

**Auth**
- Login success returns a token + user; wrong password → 401.
- A token minted for tenant A is rejected when used with `X-Restaurant-ID` of tenant B (403).
- Role-based 2FA: when a restaurant has `twoFactorEnabled` + the user's role in
  `twoFactorRoles`, login returns an OTP challenge instead of a session.

**Tenant isolation**
- Every tenant-scoped read/write is filtered by `X-Restaurant-ID`; data from another tenant
  is never returned.

**RBAC / permission guards**
- `view_analytics` / `view_payments`: STAFF without the permission → 403; MANAGER/ADMIN → 200.

**Scheduling visibility (privacy)**
- With `staffScheduleView = OWN_ONLY`, a STAFF calling `GET /scheduling/assignments` only
  ever receives their own assignments even if they omit/spoof the `userId` query param.

**Menu**
- Activating a menu deactivates the others (only one live menu per tenant).
- `POST /menus/prices/set` applies explicit prices immediately, and with `scheduledFor` in the
  future defers via a `ScheduledPriceUpdate` (prices unchanged now).

**Settings authority**
- `currency` is not writable through the tenant settings endpoint (root-admin-only).

## 5. CI pipeline (`.github/workflows/ci.yml`)

Triggered on PRs and pushes to `main`. Two parallel jobs, each running against a Postgres service
container where needed (see §3):

- **backend**: `npm ci` → `npm audit --audit-level=moderate` (blocking) → `prisma generate` →
  `npm run test:setup-db` → `npm test` → `npm run typecheck` → `npm run build`.
- **frontend**: `npm ci` (in `frontend/`) → `npm audit --audit-level=moderate` (blocking) →
  `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.

A merge is only allowed when both are green. This is the "before it can reach production" gate.
The `npm audit` steps are dependency-CVE scanning, a separate failure mode from the
application-logic tests above — see `docs/planning/PRODUCTION_ROADMAP.md` §11 and `.github/dependabot.yml` for
the ongoing-scanning story. Both apps are 0 known vulnerabilities at every severity as of the
2026-08-11 Next.js 16.3.0 upgrade.

`.github/workflows/staging.yml` runs the same two jobs on push to `develop` (plus a placeholder
`deploy-staging` job, since there's no staging server to deploy to yet — see `docs/operations/STAGING.md`).
PRs targeting `develop` already get `ci.yml`'s gate via its branch-filter-less `pull_request`
trigger; `staging.yml` additionally catches a bad merge landing directly on `develop`.

## 6. Deployment gate (post-deploy smoke)

After the app is deployed, run `node scripts/smoke-test.mjs` against the live base URL. It:
1. `GET /health` → `{ status: "ok" }`.
2. Logs in with a known smoke account and asserts a token comes back.
3. Performs one authenticated, tenant-scoped read.

Non-zero exit = roll back / hold traffic. Wire this as the last CD step (or a scheduled
uptime check). See `scripts/smoke-test.mjs` for the env vars it expects.

## 7. Running locally

```bash
# Backend (from repo root)
npm run test:setup-db     # provision + migrate the throwaway `dining_test` Postgres DB
                           # (starts a Podman/Docker container automatically if neither
                           # TEST_DATABASE_URL nor DATABASE_URL is already set — see §3)
npm test                  # vitest run (unit + integration)
npm run typecheck

# Frontend (from frontend/)
npm test
npm run typecheck && npm run build

# Smoke against a running instance
SMOKE_BASE_URL=http://localhost:3000 SMOKE_EMAIL=... SMOKE_PASSWORD=... \
  SMOKE_RESTAURANT_ID=... node scripts/smoke-test.mjs
```

## 8. Extending

- Add a new controller → add an integration test asserting its tenant scoping + permission
  guard (copy an existing spec in `tests/api/`).
- Add a new pure util → add a Vitest unit test next to it.
- Keep the smoke test tiny and dependency-light — it must run anywhere `node` + `fetch` exist.
