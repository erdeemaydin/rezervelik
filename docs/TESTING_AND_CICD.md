# Testing & CI/CD Plan — Dining Reservation Platform

This document is the test strategy for taking the platform from commit → CI → production
safely, and for guaranteeing that **an update to production doesn't break existing behavior**.

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
| Integration (backend) | Vitest + Supertest | HTTP API against the real Express app + an isolated SQLite DB: auth, tenant isolation, RBAC, scheduling visibility, menu/live-menu, bulk-price, settings authority | CI `backend` job |
| Unit (frontend) | Vitest | Pure libs: `lib/format`, `lib/workedHours` | CI `frontend` job |
| Static | `tsc --noEmit`, `eslint`, `next build` | Type safety, lint, production build | CI both jobs |
| Smoke (post-deploy) | `scripts/smoke-test.mjs` | Hits the **live** URL: `/health`, a login round-trip, an authenticated tenant-scoped read | CD, after deploy |

We deliberately keep browser E2E (Playwright) out of the required gate for speed/flakiness;
the integration layer exercises the same backend contracts the UI depends on. A Playwright
scaffold can be added later behind an optional job.

## 3. Environments & data

- **Isolated test DB**: tests never touch `prisma/dev.db`. `tests/setup/prepare-test-db.ts`
  provisions a throwaway SQLite file (`prisma/test.db`) by pushing the schema to it via a
  temp schema whose datasource reads `env("DATABASE_URL")`. The app picks up the same
  `DATABASE_URL` because `src/config/prisma.ts` now honors it (see that file).
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

Triggered on PRs and pushes to `main`. Two parallel jobs:

- **backend**: `npm ci` → `prisma generate` → `npm run test:setup-db` → `npm test` → `npm run build`.
- **frontend**: `npm ci` (in `frontend/`) → `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`.

A merge is only allowed when both are green. This is the "before it can reach production" gate.

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
npm run test:setup-db     # provision prisma/test.db
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
