# Staging Environment

> **Status: documented, not provisioned.** This is the runbook for standing up a
> staging environment — the missing piece flagged in `PRODUCTION_ROADMAP.md` §4.1.
> As of this writing **no staging server exists**: there is no second VPS, no
> `staging.*` DNS record, and no credentials for one. Nothing in this repo's CI/CD
> currently deploys anywhere. Follow this doc when you (a human, with real
> infrastructure access) are ready to provision it; until then, treat it as the
> plan, not a status report.

Companion docs, read alongside this one:
- `docs/DATABASE_RUNBOOK.md` — the authoritative backup/restore procedure this doc
  points at rather than duplicating.
- `docs/SERVER_SETUP.md` — the full from-scratch VPS setup this doc mirrors for
  staging (same stack: Nginx + PM2 + PostgreSQL + Node 22).
- `docs/GIT_WORKFLOW.md` — where `develop` (staging's branch) fits in the branching
  model.
- `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md` — the manual checklist to run **on staging**
  before every merge to `main`. Different from `scripts/smoke-test.mjs` /
  `.github/workflows/smoke.yml` — see the "Two different smoke tests" section below.

---

## 1. Which shape of staging to build

Two legitimate options. Pick based on budget and how much prod traffic/tenant count
you have — you can start with Option A and move to Option B later without changing
anything else in this doc (branch mapping, data refresh, and the smoke checklist all
stay the same).

### Option A — same box as production, second port-set (recommended to start)

Reuses the existing production VPS (`deploy@your-server-ip` per
`docs/DATABASE_RUNBOOK.md`). Zero new infrastructure to buy or manage — just a
second checkout, a second Postgres database, and a second pair of PM2 processes,
all offset from prod's:

| Thing | Production | Staging |
|---|---|---|
| App directory | `~/dining-reservation` | `~/dining-reservation-staging` (separate git checkout, on `develop`) |
| Git branch | `main` | `develop` |
| Backend port | `3000` | `3010` |
| Frontend port | `3001` | `3011` |
| PM2 process names | `dining-api`, `dining-web` | `dining-api-staging`, `dining-web-staging` |
| Database name | `dining` | `dining_staging` (same Postgres instance, separate database) |
| DB user | `dining_app` | reuse `dining_app` granted on both DBs, or a dedicated `dining_staging_app` for tighter isolation |
| Public URL | `https://YOUR_DOMAIN` | `https://staging.YOUR_DOMAIN` (own Nginx server block + its own Let's Encrypt cert) |

**Tradeoff to accept knowingly:** staging shares CPU/RAM/disk with production on
this option. A runaway staging process (e.g. a bad migration loop) can degrade
prod. For a small, single-operator SaaS at current scale this is an acceptable and
common tradeoff — it's what makes staging affordable at all — but revisit it before
it becomes actually risky (see Option B).

Setup mirrors `docs/SERVER_SETUP.md` §§1–9, with these staging-specific deltas:

```bash
# On the server, alongside the existing ~/dining-reservation checkout:
cd ~
git clone https://github.com/erdeemaydin/dining-reservation.git dining-reservation-staging
cd dining-reservation-staging
git checkout develop

# Database — same Postgres instance as prod, new database:
sudo -u postgres psql
#   CREATE DATABASE dining_staging;
#   GRANT ALL PRIVILEGES ON DATABASE dining_staging TO dining_app;
#   \c dining_staging
#   GRANT ALL ON SCHEMA public TO dining_app;

# .env — see §4 below for the full list of what differs from prod's .env
cp .env.example .env
nano .env    # DATABASE_URL -> dining_staging, PORT=3010, CORS_ORIGIN -> staging URL, separate JWT_SECRET

cp frontend/.env.example frontend/.env
nano frontend/.env   # NEXT_PUBLIC_API_URL=https://staging.YOUR_DOMAIN/api

npm install && npx prisma generate && npx prisma migrate deploy && npm run build
cd frontend && npm install && npm run build && cd ..
```

Add a second `ecosystem.staging.config.js` in the staging checkout (same shape as
the `ecosystem.config.js` already in this repo, just offset ports/names):

```js
module.exports = {
  apps: [
    {
      name: 'dining-api-staging',
      cwd: '/home/deploy/dining-reservation-staging',
      script: 'dist/server.js',
      exec_mode: 'fork',   // same caveat as prod: never cluster, priceUpdater runs in-process
      env: { NODE_ENV: 'production', PORT: 3010 },
    },
    {
      name: 'dining-web-staging',
      cwd: '/home/deploy/dining-reservation-staging/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3011',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

```bash
pm2 start ecosystem.staging.config.js
pm2 save
```

Nginx: add a second server block for `staging.YOUR_DOMAIN` proxying `/api` ->
`127.0.0.1:3010` and everything else -> `127.0.0.1:3011` (copy the block in
`docs/SERVER_SETUP.md` §9 and change the `server_name` + upstream ports), then
`sudo certbot --nginx -d staging.YOUR_DOMAIN`.

### Option B — a second, cheap VPS

Follow `docs/SERVER_SETUP.md` end-to-end on a second, smaller box (a 1–2 GB VPS is
plenty for staging traffic), checked out on `develop` instead of `main`, with its
own subdomain (`staging.YOUR_DOMAIN`) pointed at the new box's IP. This gives full
isolation (no shared CPU/RAM/disk with prod) at the cost of an extra VPS bill
(roughly the same ballpark as prod's phase-1 pricing, per `PRODUCTION_ROADMAP.md`
§8).

Move to this option once tenant count or production load makes "staging can starve
prod of resources" an actual risk rather than a theoretical one.

---

## 2. Branch mapping

Per `docs/GIT_WORKFLOW.md`: `develop` is the integration branch, and staging is
where it's meant to run. Concretely:

- Staging always runs whatever is at the tip of `develop` — same loop as
  `docs/SERVER_SETUP.md` §12's production deploy, but pulling `develop` instead of
  `main`, into the staging checkout/ports/PM2 names from §1 instead of prod's:

  ```bash
  cd ~/dining-reservation-staging   # (Option A) or the staging box's app dir (Option B)
  git pull origin develop
  npm install && npx prisma generate && npx prisma migrate deploy && npm run build
  cd frontend && npm install && npm run build && cd ..
  pm2 reload dining-api-staging dining-web-staging   # or dining-api/dining-web on a dedicated Option B box
  ```

- `main` never runs on staging directly — staging's whole job is to prove
  `develop` before it becomes the next `main`. `docs/GIT_WORKFLOW.md`'s
  "Releasing to production" section already says this: merge to `main` only after
  "staging smoke-test passes" (`PRODUCTION_ROADMAP.md` §4).

---

## 3. Getting a copy of production data onto staging

Don't reinvent backup/restore — `docs/DATABASE_RUNBOOK.md` §§2–3 already has the
full, tested `pg_dump`/`pg_restore` procedure. Staging just points the restore at
`dining_staging` instead of `dining`:

```bash
# On the server (Option A — same box, so no transfer needed):
cd ~/dining-reservation            # prod checkout, where the nightly dumps live
ls -t ~/db-backups/dining-*.dump | head -1     # find the latest nightly backup (§2)

# Restore that dump into the STAGING database, not prod's:
pg_restore --clean --if-exists --no-owner \
  -d "postgresql://dining_app:DB_PASSWORD@localhost:5432/dining_staging" \
  ~/db-backups/<FILE>.dump
```

If staging is on a separate box (Option B), `scp` the dump across first — this is
exactly the "off-box copies" step `docs/DATABASE_RUNBOOK.md` §2 already recommends
for disaster-proofing, just repurposed as the transport for staging refreshes:

```bash
scp deploy@your-server-ip:'~/db-backups/dining-*.dump' .
scp dining-<latest>.dump deploy@STAGING_IP:~/db-backups/
# then run the pg_restore above on the staging box
```

**Refresh cadence:** there's no hard rule — a sensible default is "refresh staging
from the latest nightly prod backup before starting a release cycle," so the smoke
checklist (§5 below) runs against realistic data, not months-stale fixtures.

**KVKK note:** a staging copy of production data is still customer PII
(`PRODUCTION_ROADMAP.md` §7) — it needs the same access controls as prod (don't
loosen SSH/firewall rules just because it's "only staging"). The retention/
anonymization job described in `PRODUCTION_ROADMAP.md` §3/§7 (still open) should
eventually run against staging too, or staging refreshes should scrub PII before
loading. Not solved by this doc — flagged here so it isn't forgotten when that job
gets built.

---

## 4. What changes in `.env` between production and staging

Base both on `.env.example` / `frontend/.env.example`; everything not listed here
stays the same shape (just copy the file and edit these keys):

| Variable | File | Production | Staging |
|---|---|---|---|
| `DATABASE_URL` | `.env` | `.../dining` | `.../dining_staging` |
| `PORT` | `.env` | `3000` | `3010` |
| `CORS_ORIGIN` | `.env` | `https://YOUR_DOMAIN` | `https://staging.YOUR_DOMAIN` |
| `JWT_SECRET` | `.env` | prod secret | **a different secret** — never reuse prod's, so a leaked staging box can't forge prod sessions |
| `SETUP_SECRET_TOKEN` | `.env` | prod secret | a different secret, same reasoning |
| `COOKIE_SAME_SITE` / `COOKIE_SECURE` | `.env` | per `docs/SERVER_SETUP.md` §10 | same values, since staging is also same-origin HTTPS behind Nginx |
| `SMOKE_BASE_URL` / `SMOKE_EMAIL` / `SMOKE_PASSWORD` / `SMOKE_RESTAURANT_ID` | `.env` | prod smoke account, prod URL | staging smoke account, `https://staging.YOUR_DOMAIN` — see §6 |
| `NEXT_PUBLIC_API_URL` | `frontend/.env` | `https://YOUR_DOMAIN/api` | `https://staging.YOUR_DOMAIN/api` |

Everything else (`JWT_EXPIRES_IN`, etc.) can stay identical to prod — staging is
supposed to behave like production, not like a stripped-down dev config.

---

## 5. Pre-deploy smoke checklist — run this on staging before every merge to `main`

See `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md` for the actual checklist (the money-path
flows from `PRODUCTION_ROADMAP.md` §4.2, turned into a literal checkbox list). Run
it by hand against the staging URL after every `develop` update, before cutting a
release per `docs/GIT_WORKFLOW.md`'s "Releasing to production" section.

### Two different smoke tests — don't confuse them

| | `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md` (this doc) | `scripts/smoke-test.mjs` / `.github/workflows/smoke.yml` |
|---|---|---|
| **When** | Manually, on **staging**, before merging `develop` → `main` | Automatically, against a **live URL**, after a deploy already happened |
| **Who/what runs it** | A human, by hand, in a browser | CI (`workflow_dispatch` or `workflow_call`), or you, from a shell |
| **What it checks** | The actual money-path UX: login as each role, book in all 3 reservation modes, load the public menu, staff check-in/out, a price update firing, TR↔EN | `/health` responds, login round-trips a token, one authenticated tenant-scoped read works |
| **Depth** | Broad, UI-level, human judgment | Narrow, API-level, scriptable |
| **Purpose** | Catch functional/UX regressions *before* they reach production | Catch "the deploy itself is broken" (crashed process, bad env, migration didn't run) *after* it ships |

They're complementary, not redundant: the checklist is the pre-flight check on
staging; `smoke-test.mjs` is the post-flight check on whatever you just deployed
(staging or production — it's parameterized by `SMOKE_BASE_URL`, so it can run
against either).

---

## 6. CI: a build/test gate for `develop`

`.github/workflows/staging.yml` (added alongside this doc) runs the same
build/lint/typecheck/test steps as `.github/workflows/ci.yml` on every push to
`develop`. It intentionally does **not** deploy anywhere — see §1, there is no
staging server for it to deploy to yet. Once a real staging box exists (Option A or
B above), extend that workflow with an actual deploy step (SSH + the
`git pull`/`migrate deploy`/`pm2 reload` loop from §2), gated on repository secrets
for the staging host the same way `.github/workflows/smoke.yml` is already gated on
`secrets.SMOKE_*`.

---

## 7. What's genuinely blocked on real infrastructure

To be explicit, since this doc could otherwise read as if staging already exists:

- **No staging VPS or subdomain exists.** Nobody has provisioned Option A's second
  checkout/ports on the production box, nor Option B's second VPS, nor a
  `staging.YOUR_DOMAIN` DNS record.
- **No SSH access to the production server from this sandbox** — confirmed via a
  direct failed SSH attempt this session. Provisioning steps above must be run by
  someone with real credentials to the box (or to a new VPS/registrar/cloud
  account), not by an agent in this repo.
- **No staging secrets exist** (`SMOKE_*` for a staging URL, staging `JWT_SECRET`/
  `SETUP_SECRET_TOKEN`) — nothing to wire into GitHub Actions secrets yet.

This document and `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md` are the paperwork/tooling
half of closing `PRODUCTION_ROADMAP.md` §4.1/§4.2: everything needed to stand
staging up correctly once someone with infrastructure access executes it. The
infrastructure itself is not part of this repo and can't be created from here.
