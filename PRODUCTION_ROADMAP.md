# Production Roadmap & Know-How

> Operational guide for taking this multi-tenant restaurant SaaS to production.
> Covers infrastructure, database, safe updates, backups, security, and Turkish (KVKK) legal requirements.
>
> **Disclaimer:** The legal/KVKK sections give direction, not legal advice. Confirm current requirements with a KVKK danışmanı/lawyer before launch.
>
> **Status note (refreshed 2026-08-11, twice today):** this doc was originally written pre-launch
> and nearly all of its original "blockers" have since shipped — most importantly, **the app is
> already running in production** (`deploy@your-server-ip`, PostgreSQL, `pm2`, daily automated
> backups — see `docs/DATABASE_RUNBOOK.md`, which is now the authoritative source for current
> live-ops state). A second pass later the same day worked through this doc's own "Follow-ups"
> list end-to-end (object storage, a staging-tooling pass, KVKK consent/retention, uptime/error
> monitoring, and a frontend CSP), using parallel isolated-worktree agents merged back in one at a
> time with conflicts resolved by hand — see `PROGRESS.md`'s session log for the full account,
> including two things worth knowing before trusting a future multi-agent session in this sandbox:
> agent worktrees kept getting created from a stale ~130-commit-behind base rather than the current
> branch tip (caught and fixed at merge time every time), and one agent silently left 56 minutes of
> real work uncommitted despite claiming otherwise. Sections below are marked **✅ Done** where the
> code/infra already reflects them, or left as-is where they're still open. Historical rationale is
> kept even for done items since it explains *why* a decision was made, not just what to do. If
> something below conflicts with the current code, trust the code (and `docs/DATABASE_RUNBOOK.md`
> for live-server specifics) over this doc.

---

## 0. TL;DR — What actually matters now

1. ✅ **PostgreSQL migration** — done (see §2). No SQLite anywhere in the codebase (`CLAUDE.md`).
2. ✅ **Automated tests + CI gate** — done (see §4). 282 tests, both apps type-checked/linted/built on every PR (`.github/workflows/ci.yml`, `docs/TESTING_AND_CICD.md`).
3. ✅ **Tested, encrypted, offsite backups** — done (see §6). Daily `pg_dump` via cron, documented restore procedure in `docs/DATABASE_RUNBOOK.md`. Confirm the "practice restore" and "offsite copy" specifics still hold — that's operational state this doc can't verify from the repo alone.
4. ✅ **Object storage for uploads** — done (see §3). ✅ **KVKK consent/retention UI** — done (see §7). ✅ **Uptime/error monitoring readiness** (Sentry, gated behind env vars) — done (see §9/`docs/MONITORING.md`). ✅ **Frontend CSP** — done (see §10 #4).
5. **Still genuinely open, in priority order:** confirming HTTPS is actually live on the deploy server (§10 #1 — this repo/sandbox cannot check; HSTS is safely disabled in code either way, §10 #5), a **real** staging environment (§4.1 — the tooling/docs are now ready, `docs/STAGING.md`, but no VPS/instance has actually been provisioned), the `⚠️`-marked live-server-only checklist items (§9), and a real browser pass over the new CSP header (§10 #4) and the Next.js 16.3.0 upgrade (§11) — this sandbox cannot launch a browser at all.

VPS choice and splitting frontend/backend still matter far less than the open items above.

---

## 1. Infrastructure & VPS Sizing

### What this app actually is
- **Backend:** Express + TypeScript + Prisma, port 3000. Lean deps (no Puppeteer/Chromium, no image processing, no ML). Modest CPU/RAM.
- **Frontend:** Next.js 16 SSR + React 19, port 3001. This is the memory hog at runtime.
- **Background work:** `priceUpdater` and (as of 2026-08-11) `retentionAnonymizer` both run **in-process** with the backend — important for how you run PM2 (see §4).
- **Uploads:** ✅ go through a pluggable storage provider now (S3-compatible or local-disk fallback — see §3), not hardcoded to local disk anymore.

### Recommended VPS for launch (few tenants, low-moderate traffic)

| Resource | Recommendation |
|---|---|
| RAM | **2 GB minimum, 4 GB comfortable** — Next.js SSR + Node backend + Postgres each need their share. `npm run build` for Next.js can OOM on 1 GB. |
| vCPU | 2 |
| Disk | 40–50 GB SSD (plenty for app + live DB; images/backups go to object storage) |

**Provider:** For users all in Turkey, an **İstanbul-based VPS** is the right call (lower latency + simpler legal picture — see §7). TR-presence options: Turkcell, Türk Telekom, Vargonen, Natro. Hetzner/DO's nearest EU regions are cheaper but add latency and cross-border-transfer handling.

### Should you split frontend and backend onto two servers?

**For security: No — not initially.** Splitting into two VPSes does *not* meaningfully improve security. Your real security boundaries are already in code (`tenantMiddleware` + `authMiddleware` tenant matching, `helmet`, CORS, bcrypt, role/permission gating).

**What actually hardens you (do this instead):**
- **Never expose the database to the internet** — bind Postgres to localhost/private network.
- **Reverse proxy in front of both apps** (Caddy or Nginx) terminating TLS. Caddy = automatic HTTPS, near-zero config.
- **Never expose backend port 3000 publicly** — proxy `/api/*` to it; only the proxy faces the internet.
- **Firewall** everything except 80/443 and SSH.
- Keep `JWT_SECRET` / `SETUP_SECRET_TOKEN` in real secrets, not the repo.

**Split later for *scaling*, not security** — when frontend SSR and API load profiles diverge and you want to scale each independently. That's a "you have traffic" problem, not a launch problem.

**Correct starting architecture:** one VPS running frontend + backend + reverse proxy (Caddy) + PM2.

---

## 2. Database: PostgreSQL ✅ Done

This section originally argued for migrating off **SQLite** (`file:./dev.db`). That migration is
complete — production, local dev, and the test suite all run PostgreSQL now (`CLAUDE.md`,
`docs/DATABASE_RUNBOOK.md`); `prisma/migrations/migration_lock.toml` is `postgresql` and there's a
clean baseline of real migration files. Kept below for context on *why*, in case a future schema
decision needs the reasoning:

- SQLite is a single file with a **global write lock** — concurrent writes serialize →
  `SQLITE_BUSY` under load. Not viable for a multi-tenant SaaS with concurrent reservations/staff
  check-in/out/price-worker writes.
- SQLite ties the app to **one machine's local disk** — can't scale to a second instance, can't use
  a managed/backed-up DB.
- SQLite backups mean copying a live file — risky, vs. Postgres's `pg_dump`/PITR story.

---

## 3. Storage: How much space for 1 year? — object storage ✅ Done

**Resolved 2026-08-11.** `src/services/storage/` is now a provider-agnostic abstraction
(`StorageProvider` interface, `types.ts`) with two implementations:
- `S3Provider.ts` — any S3-compatible store (real AWS S3, Cloudflare R2, Backblaze B2, MinIO), via
  the AWS SDK pointed at a custom `S3_ENDPOINT`. Selected when `S3_BUCKET` (or `STORAGE_PROVIDER=s3`)
  is set.
- `LocalDiskProvider.ts` — the local-disk fallback for dev/sandboxes with no cloud credentials
  (this repo's own dev environment included). Explicitly documented as **not suitable for
  production** (see `.env.example`'s comments) since most hosts don't persist/share local disk
  across redeploys or multiple instances — the exact footgun this section originally warned about.

`src/controllers/uploadController.ts` sniffs the real file content (magic bytes) and passes the
*sniffed* extension/mimetype to the provider — not the client-supplied filename/mimetype — so the
provider abstraction didn't reopen a spoofed-upload hole a prior security pass had closed. Storage
keys are tenant-namespaced (`uploads/<restaurantId>/...`). Verified via unit tests against a mocked
S3 client (`tests/unit/storage.test.ts`) and full HTTP-stack tests against the local-disk fallback
(`tests/api/upload.test.ts`) — **not verified against a real bucket**, since no cloud credentials
exist in this sandbox; that's the one thing a human still needs to confirm before relying on it in
production (create a bucket, set the `S3_*` env vars per `.env.example`, upload something for real).

Structured data is tiny; **uploaded images are the real space driver** and shouldn't live in the DB or on the VPS disk.

**Structured data** (reservations, staff, schedules, timesheets, menus):
- A reservation row ≈ 0.5–1 KB with indexes. A very busy restaurant at 200/day = ~73,000/year ≈ **~70 MB/year**. Most tenants far less.
- Planning number: **~50 MB per tenant per year**.
- **100 tenants → ~2–5 GB/year.** Trivial.

**Images** (menu photos, logos) — via the storage provider above:
- 100 photos @ ~300 KB ≈ 30 MB/tenant; photo-heavy tenants 200–500 MB.
- Object storage (Cloudflare R2 / Backblaze B2 / S3) grows independently of the VPS disk, ~$0.01–0.015/GB/month — set the `S3_*` env vars to actually use it in production (the local-disk fallback is dev-only).

**Backups**: compressed Postgres dumps are small. With a sane retention policy (§6), 100 tenants after a year ≈ **30–60 GB compressed** — a few dollars/month.

**Takeaway:** a 40–50 GB VPS disk covers app + live DB. You're not space-constrained — you're integrity- and process-constrained.

**KVKK: retention job ✅ Done** — see §7. The storage-limitation principle says don't keep personal
data longer than necessary; `src/workers/retentionAnonymizer.ts` now anonymizes customer PII
(name, phone, email, notes) on `Reservation`/`WaitlistEntry` rows past a configurable retention
window (`RETENTION_DAYS`, default 400 days), running in-process daily alongside `priceUpdater`.

---

## 4. Safe Updates — the core operational discipline

> "It must be perfect and contain no bugs" is not achievable for any software. What you need is a process that **catches breakage before users see it** and lets you **recover fast** when something slips through.

**Current reality (updated 2026-08-11):** the "zero automated tests" risk this section originally
opened with is resolved — 282 Vitest tests (backend API/integration + frontend unit) run in
`.github/workflows/ci.yml` on every PR and push to `main`, alongside `tsc`, `eslint`, and a
production build for both apps (see `docs/TESTING_AND_CICD.md` for the full test-pyramid writeup,
itself refreshed 2026-08-11 to fix its own SQLite-vs-Postgres staleness).

**Genuinely open:** a *real* staging environment (§4.1) still doesn't exist — the tooling and
process around it are ready now (below), but nobody has provisioned the actual second
VPS/port-set. `.github/workflows/smoke.yml` + `scripts/smoke-test.mjs` remain the separate
*post-deploy* smoke check against a live URL, distinct from the pre-deploy checklist below.

### 4.1 Staging environment — tooling ready 2026-08-11, infra still not provisioned
A second, identical deployment running a **copy of production data** (separate cheap VPS, or a
second set of ports/containers on the same box). Every update goes to staging first. `docs/STAGING.md`
now documents exactly how to stand this up (both the same-box-offset-ports option and the
second-VPS option, with a full `.env` diff table and a data-refresh procedure built on
`docs/DATABASE_RUNBOOK.md`'s existing `pg_dump`/`pg_restore` commands), and `.github/workflows/staging.yml`
runs build+test on every push to `develop` (no deploy step yet — there's nowhere to deploy to).
**What's still actually missing:** the VPS/port-set itself, and staging-specific secrets — this repo's
tooling can't provision those; a human with hosting access needs to do it once, following `docs/STAGING.md`.

### 4.2 Written smoke-test checklist — ✅ Done, now a real file
`docs/PRE_DEPLOY_SMOKE_CHECKLIST.md` is the money-path checklist (log in as each role, all 3
reservation modes, public `/r/[slug]` + QR menu, staff check-in/out, a price update firing,
TR↔EN) as an actual markdown checklist to run by hand on staging before every deploy — distinct
from the automated *post-deploy* `scripts/smoke-test.mjs`. If any step fails on staging → the
update does not ship.

### 4.3 Add automated tests over time — ✅ Done, keep growing it
Vitest + Supertest now covers auth, tenant isolation, RBAC, and every domain's business-logic
invariants (282 tests as of 2026-08-11, one new test per bug fix — see `PROGRESS.md`'s session
log for the pattern). Keep the habit: every bug fix gets a regression test in the same commit,
same as the last several sessions did.

### 4.4 Every-deploy sequence
```
1. Merge to main only after staging passes the smoke checklist
2. On production: BACK UP THE DB before anything (see §6)
3. Deploy new code, keep the OLD build directory intact
4. Run the smoke checklist against production
5. If broken → roll back: restore old build + restore DB backup
```
Keep the previous release ready to restart in seconds. **PM2** makes this easy (`pm2 reload`, keep prior `dist/`).

> **PM2 caveat:** `priceUpdater` and `retentionAnonymizer` both run *in-process* with the backend. Under PM2 **cluster mode you'd get duplicate workers** → run the backend as a **single instance**, not clustered (or extract them into their own process(es)).

---

## 5. Database Migrations — your highest-risk update type

Schema changes are where "an update breaks the DB" actually happens.

**✅ Mostly resolved.** `prisma/migrations/` is now a clean baseline of 9 real, generated
migration files (`migration_lock.toml` = `postgresql`), and production deploys apply them with
`prisma migrate deploy` (documented in `docs/DATABASE_RUNBOOK.md`), which needs no shadow DB — the
original "hand-authored migrations aren't validated" risk this section warned about doesn't apply
to what's shipped. One caveat specific to *this coding agent's sandbox* (not production): it
sometimes can't reach a shadow database to run `prisma migrate dev` interactively, so migrations
are occasionally hand-written SQL in that situation — see `PROGRESS.md`'s methodology notes. That
SQL still gets validated the same way any migration does: applied via `migrate deploy` against a
real Postgres, then the full test suite run against the resulting schema.

**Rules for every schema change:**
- **Always `pg_dump` the production DB immediately before running a migration.** This is your undo button.
- **Test the migration on a copy of production data** (that's what staging is for) — not an empty dev DB. Migrations that pass on empty data routinely fail on real data (nulls, duplicates violating a new unique constraint, etc.).
- Use the **expand/contract pattern** for risky changes: add the new column/table (backwards-compatible) → deploy code that writes both → backfill → remove the old thing in a *later* release. Never rename-and-drop in one shot.
- **Migrations only go forward.** If one goes wrong, you **restore from the pre-migration backup** — you don't try to "un-migrate."

**"What if the DB breaks after an update?"** Always the same answer: stop the app → restore the pre-deploy backup → restart the old code → investigate on staging. With **managed Postgres + point-in-time recovery** you can rewind to a specific second before the bad migration. This is the strongest argument for a managed DB.

---

## 6. Protecting the Database & Backups

### 6.1 Protection
- **Never expose to the internet.** Bind Postgres to localhost/private network; DB port unreachable from outside. Firewall all but 80/443/SSH.
- **Least-privilege DB user** for the app — not the Postgres superuser; access only to its own database.
- **Strong secret credentials** in env/secrets management, never in the repo.
- **Encryption at rest** (managed DBs default; self-hosted → encrypted volume) and **TLS in transit**.
- **Tested backups** — a backup you've never restored is not a backup. Do a practice restore before launch and quarterly after.
- **Strongly consider managed Postgres** (Turkish provider or Turkey-region) instead of self-hosting: automated backups, point-in-time recovery, patching, encryption handled for you. Best fit for a solo, non-expert operator running a data-critical SaaS.

### 6.2 Backup storage — follow 3-2-1
Three copies, two locations/media, one offsite.
- **Primary:** managed DB's own backups, or nightly `pg_dump` cron on the VPS.
- **Offsite:** encrypted, compressed dumps pushed to object storage. For KVKK comfort, prefer a **Turkey-based / Turkey-region** store so backups don't leave the country (Turkcell/Türk Telekom bulut, or an S3-compatible Turkish provider). If using B2/R2/S3, pick an EU region at minimum and treat it as a cross-border transfer.
- **Encrypt backups before upload** — they contain customer PII; a leaked backup is a KVKK breach.
- **Retention policy** (covers your "1 year" requirement with ~50 snapshots, not 365):
  - Daily for 30 days
  - Weekly for 12 weeks
  - Monthly for 12 months

---

## 7. Turkey Hosting & KVKK Legal Requirements

> Direction, not legal advice. Verify current 2026 requirements with a KVKK danışmanı before launch.

### 7.1 Latency
An İstanbul VPS is the right call when all users/restaurants are in Turkey — real round-trip savings vs. EU, and it simplifies the legal picture.

### 7.2 Is Turkish data-residency legally required?
For a restaurant reservation SaaS: **no strict localization mandate.** KVKK (Law 6698) does **not** force general personal data to stay on Turkish servers (unlike Russia's law). Strict in-country storage applies only to specific regulated sectors (banking/BDDK, payments, some telecom) — not restaurant bookings.

**However:** KVKK Article 9 regulates **cross-border transfer (yurt dışına aktarma)**, and the 2024 amendments tightened it (adequacy decisions, standard contractual clauses, or explicit consent). So keeping **app + DB + backups all in Turkey** isn't legally mandatory, but it **sidesteps the entire cross-border-transfer compliance burden** — a stronger reason than latency.

### 7.3 Consent & permissions — two different relationships

You are a **veri işleyen (data processor)**. Each restaurant is the **veri sorumlusu (data controller)** for its own customers' data.

1. **Between you and each restaurant:** a **veri işleme sözleşmesi (data processing agreement)** in your SaaS contract — you process data only on their instructions, your security measures, breach notification, deletion on termination.

2. **Between the restaurant and its customers** (your product must *enable* this):
   - **Aydınlatma metni** (privacy/disclosure notice) at the point of booking — who collects data, why, how long, shared with whom.
   - **Açık rıza (explicit consent)** where required — checkbox at reservation time, and *separately* for marketing/WhatsApp messages (WhatsApp notifications need consent; marketing also falls under **İYS** / e-commerce rules).
   - **Data-subject rights** — customers can request access, correction, or deletion. Build an endpoint/process for this.

3. **VERBİS registration:** depending on size/data volume, you and/or the restaurants may need to register with the VERBİS registry. Check current thresholds.

**Product implications — ✅ Done 2026-08-11:**
- ✅ Required consent checkbox + privacy-notice link (`/r/[slug]/privacy`, bilingual, tenant-overridable
  via `FrontendCustomization.privacyNoticeText`) on the booking form — added across all 8 public
  layout components via a shared `ConsentFields.tsx`, enforced server-side too (`createReservation`
  rejects a guest booking with no `consentAccepted`), not just client-side.
- ✅ Separate, optional, visually distinct consent checkbox for WhatsApp/marketing (`marketingConsent`
  — never implied by the required booking consent).
- ✅ Data-retention/anonymization job (§3) — `src/workers/retentionAnonymizer.ts`, daily, in-process.
- ✅ A way to fulfill deletion requests — `DELETE /api/reservations/customer/:phone`, tenant-scoped +
  authenticated, anonymizes every `Reservation`/`WaitlistEntry` row for that phone within the
  caller's tenant.

**Still open:** the aydınlatma metni content itself is generic, structurally-correct placeholder
text (what/why/how-long/who-with) — deliberately not written with specific Turkish legal claims,
since that needs a KVKK danışmanı's review before launch (see this doc's disclaimer at the top).
VERBİS registration and the veri işleme sözleşmesi (data processing agreement) template are still
unaddressed — those are legal/contractual artifacts, not code.

---

## 8. Phased Rollout Plan

**Status note (2026-08-11):** the app is already live (`docs/DATABASE_RUNBOOK.md`), so "Phase 1" below is
now a record of what launch required rather than a forward-looking plan — kept for reference, with
items already confirmed done struck through inline. Treat Phase 2/3 as the actually-forward-looking
part of this section.

### Phase 1 — Launch (single VPS, ~€5–15/mo equivalent)
1. ~~Migrate SQLite → PostgreSQL~~ — ✅ done (§2).
2. One İstanbul VPS, 2–4 GB RAM. *(confirm against the actual live server)*
3. **Caddy** reverse proxy: TLS + `yourdomain.com` → Next.js:3001, `/api` → Express:3000. *(unconfirmed — no credentialed access to the live server from this repo's coding-agent sandbox to check; see §10 #1)*
4. ~~**PM2** keeps both Node processes alive; backend as single instance~~ — ✅ done (`docs/DATABASE_RUNBOOK.md`: `dining-api`/`dining-web`).
5. ~~**Move `multer` uploads to object storage**~~ — ✅ done (§3); S3-compatible or local-disk fallback, not verified against a real bucket yet (no cloud credentials in this sandbox).
6. ~~**Automated Postgres backups**~~ — ✅ done (daily cron, §6); confirm encryption/offsite specifics.
7. **Staging environment + smoke-test checklist** (§4) — tooling/docs ✅ done (`docs/STAGING.md`, `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md`); the actual VPS/port-set is still not provisioned.
8. ~~**KVKK basics**~~ — ✅ done (§7): consent UI, privacy notice, retention job, deletion endpoint. Data processing agreement template and VERBİS registration remain (legal artifacts, not code).

### Phase 2 — First paying tenants
- Move Postgres to a **managed database** (Turkey-region) — backups, patching, PITR, failover off your plate. Highest-value upgrade. *(confirm current hosting — `docs/DATABASE_RUNBOOK.md` describes a single self-managed server, not a managed DB, so this is likely still open)*
- ~~Add **uptime monitoring** (UptimeRobot/BetterStack) and **error tracking** (Sentry)~~ — app-side readiness ✅ done (§9/`docs/MONITORING.md`): Sentry wired behind `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` env vars (clean no-op when unset), `/health` confirmed fit for an uptime check. Still needs a human to actually create the Sentry project and the UptimeRobot/BetterStack monitor — this repo can't do that itself.
- ~~Add backend integration tests in CI~~ — ✅ done (§4.3).
- ~~Fix the Prisma migration workflow~~ — ✅ done (§5).

### Phase 3 — When traffic justifies it
- Split frontend and backend, add a load balancer, run multiple API instances.
- **Extract the `priceUpdater`/`retentionAnonymizer` workers** into their own single process(es) so they don't duplicate.

---

## 9. Pre-Launch Checklist

Re-verified against current code/docs 2026-08-11 — ✅ items are confirmed done from the repo
itself; ⚠️ items need a human to confirm live operational state (the repo can't prove these — this
was tested directly on 2026-08-11: this coding-agent sandbox tried SSHing to
`docs/DATABASE_RUNBOOK.md`'s deploy host and confirmed it has no credentialed access, so every ⚠️
item below is unavailable to *any* session running in an environment like this one, not just
untried); unmarked items are confirmed still open.

- [x] ✅ SQLite → PostgreSQL migration done (§2)
- [x] ✅ Prisma production migration workflow reliable (`migrate deploy`, clean migration baseline — §5)
- [x] ✅ `multer` uploads moved to object storage (§3) — S3-compatible via `src/services/storage/`, local-disk dev fallback; ⚠️ not verified against a real bucket (no cloud credentials in this sandbox) — set the `S3_*` env vars and upload something for real before trusting this in production
- [ ] ⚠️ DB not exposed to internet; least-privilege DB user; TLS; encryption at rest — `docs/DATABASE_RUNBOOK.md` shows Postgres is live on the deploy server; confirm the specific hardening (firewall, DB user privileges, at-rest encryption) directly on that server, not from this repo
- [ ] ⚠️ Reverse proxy (Caddy) with TLS; only 80/443/SSH open — confirm on the live server (§10 #1 — HSTS is now safely disabled in code pending this confirmation, see §10 #5, but that doesn't tell you whether TLS is actually live)
- [x] ✅ PM2 running backend (single instance) + frontend (`docs/DATABASE_RUNBOOK.md`: `dining-api` / `dining-web`)
- [x] ✅ Automated, encrypted*, offsite* backups with retention policy — daily cron `pg_dump` + pruning (`scripts/db-backup.sh`, `docs/DATABASE_RUNBOOK.md`). *Confirm encryption-at-rest/in-transit and true offsite copy are actually configured — the script itself doesn't show that from the repo alone.
- [ ] ⚠️ **Practice restore performed successfully** — procedure is documented in `docs/DATABASE_RUNBOOK.md`; confirm it's actually been run, not just written
- [x] ✅ Staging environment tooling/docs ready (§4.1 — `docs/STAGING.md`, `.github/workflows/staging.yml`); ⚠️ the actual VPS/port-set is still not provisioned — needs a human with hosting access
- [x] ✅ Smoke-test checklist written (§4.2 — `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md`), distinct from the *post-deploy* `smoke.yml` workflow; still needs to actually be run before a deploy once staging exists
- [ ] ⚠️ Secrets (`JWT_SECRET`, `SETUP_SECRET_TOKEN`) in real secret storage, not repo — confirm on the live server
- [x] ✅ KVKK: consent UI, privacy notice, retention/anonymization job, deletion endpoint (§7) — DPA template and VERBİS registration remain (legal artifacts, not code)
- [ ] VERBİS registration checked
- [x] ✅ Uptime/error-tracking readiness (§9/`docs/MONITORING.md`) — Sentry wired behind env vars (no-op when unset), `/health` confirmed fit for an uptime check; ⚠️ actually creating the Sentry project + UptimeRobot/BetterStack monitor still needs a human with account access
- [x] ✅ Backend integration tests in CI (§4.3 — 282 tests, `.github/workflows/ci.yml`)
- [x] ✅ Dependency vulnerability scanning in CI + Dependabot (new — see §11)
- [x] ✅ HSTS disabled in code pending live-HTTPS confirmation (§10 #5 — fixed 2026-08-11; re-enable once TLS is confirmed live on the deploy server)
- [x] ✅ Content-Security-Policy on the frontend (§10 #4 — fixed 2026-08-11); ⚠️ not verified in a real browser (no Chromium in this sandbox) — do a manual pass watching devtools console before this ships

---

## 10. Auth, Login & Session Security Hardening

> The auth **logic** is sound — bcrypt password hashing, JWT with 24h expiry, optional 2FA/OTP, and per-tenant isolation (`X-Restaurant-ID` matched against the token's `restaurantId` in `authMiddleware`). The items below are **configuration/hardening**, not logic rewrites. Ordered by priority. Re-verified against current code 2026-08-11 — several items below have shipped since this section was written; #5 (HSTS) is now fixed in code as of 2026-08-11 (disabled pending live-HTTPS confirmation); #1 (is TLS actually live) still needs a live-server check no coding-agent sandbox has credentials for.

### How the session currently works (context — updated 2026-08-11)
- **The session moved from `localStorage` to an httpOnly cookie.** `src/utils/authCookie.ts` sets
  `token`/`adminToken` as `httpOnly`, with `sameSite`/`secure` driven by `COOKIE_SAME_SITE`/
  `COOKIE_SECURE` env vars (defaulting to `secure: true` when `NODE_ENV=production` or
  `sameSite=none`). `frontend/src/lib/api.ts` sends `withCredentials: true`; `authMiddleware`
  reads the cookie first, falling back to `Authorization: Bearer` for non-browser callers.
  `frontend/src/lib/authStorage.ts` now only caches the non-secret user profile client-side, and
  explicitly documents the migration in its own comment. **This closes old #4 below** — the
  original XSS-reads-localStorage concern no longer applies to the session token itself.
- **Route protection now has a server-side layer too (2026-08-11).** `frontend/src/proxy.ts`'s
  comment used to claim the session token "lives in localStorage... this server-side proxy cannot
  read it" — false since the httpOnly-cookie migration (cookie matching ignores port, so the
  cross-port dev setup and the same-origin production setup behind the reverse proxy both let this
  proxy read the `token` cookie). It now redirects unauthenticated requests to `/dashboard/*` and
  `/system-admin/*` straight to `/auth/login`, checking only *presence* of the cookie, not JWT
  validity — verifying the JWT would need `JWT_SECRET` shared into the frontend, which this
  deliberately doesn't do. An expired/invalid token still reaches the client shell exactly as
  before; `AdminLayout`/`SystemAdminLayout` + the `lib/api.ts` 401 interceptor remain the fallback,
  and the backend's `authMiddleware` remains the actual enforcement boundary regardless. What this
  closes is just the gap where a fully logged-out visitor could load the dashboard shell HTML/JS at
  all before the client-side redirect fired. Verified with `next build` + `next start` + `curl`
  (protected paths 307 to `/auth/login` without a cookie, 200 with one; public `/r/[slug]` and
  `/auth/login` itself are unaffected) — not a real browser test (see §11's Chromium-sandbox note).

### #1 — HTTPS / TLS everywhere (blocker) — still open, still unconfirmed
Right now passwords and JWTs travel in **cleartext HTTP** — anyone on the network can read them. This is the top blocker and is already covered by the Caddy reverse-proxy step (§1, §8). Nothing else in this section is fully effective until TLS is in place. **2026-08-11: attempted to confirm directly** — SSH'd toward `docs/DATABASE_RUNBOOK.md`'s deploy host (`deploy@your-server-ip`) from this session's sandbox; the host is reachable but this sandbox has no credentialed key for the `deploy` user, so it can't log in and check. This needs someone with real access to that server — the repo alone cannot answer it.
- Serve both apps behind **Caddy** (auto-HTTPS) on one domain: `yourdomain.com` → Next.js, `/api/*` → Express.
- Once same-origin over HTTPS, CORS (#2, already locked down either way) gets simpler too.

### #2 — Lock down CORS — ✅ Done
`src/app.ts` now validates `Origin` against an explicit allowlist (`CORS_ORIGIN` env, comma-separated) with `credentials: true`, required for the httpOnly-cookie auth flow above — not the `cors()` wildcard this section originally warned about. Just confirm `CORS_ORIGIN` is actually set to the real production frontend origin(s) in the live `.env`.

### #3 — Rate-limit the login endpoint — ✅ Done
`src/routes/authRoutes.ts` rate-limits both `/login` and `/login/otp` (15 min window, max 10) via `rateLimitOrNoop` — the code comment there even calls out this exact finding ("Security-audit finding: /login and /login/otp had no throttling at all").

### #4 — Token storage — ✅ Done (see "How the session currently works" above)
Session token is now an httpOnly cookie, not `localStorage`. **Content-Security-Policy on the
frontend — ✅ Done (2026-08-11).** `frontend/next.config.ts`'s `headers()` now sends one, layered on
top of the backend API's own separate default CSP from `helmet()` (different surface — JSON
responses, not the frontend's HTML/JS). Specific to this app rather than a generic template:
`script-src`/`style-src` need `'unsafe-inline'` (Next's App Router injects inline RSC-streaming
scripts on every page; the public layouts set per-tenant customization colors via inline
`style={{...}}`, which nonces can't cover at all); `img-src` stays broad (`https: data: blob:`)
since uploads are mid-migration to object storage (§3) and the shift-schedule PNG export uses a
`data:` URI internally; `frame-src` explicitly allows `https://www.paytr.com` for the payment
iframe. Verified via `next build` + `next start` + `curl` across route types (public page, login,
both the redirect and 200 paths of `proxy.ts`'s auth gate) — confirmed present and not interfering
with that gate. **Not verified:** a real browser session watching devtools for actual CSP
violations from live interactivity (chart rendering, PDF/PNG export, hydration) — no Chromium in
this sandbox. That pass is still needed before this ships.

### #5 — Fix HSTS (currently sent over HTTP — actively harmful) — ✅ Done (2026-08-11)
`src/app.ts` now reads `app.use(helmet({ hsts: false, crossOriginResourcePolicy: false }))`. Previously it had no `hsts: false` override, so helmet's default `Strict-Transport-Security` header went out on every response regardless of whether the connection was actually HTTPS — once any browser (especially **iOS Safari**) saw it, it force-upgrades future `http://<host>` requests to HTTPS, which a non-TLS server doesn't speak, silently breaking access. **This was flagged as "a leading suspect for can't sign in from iPhone/iPad Safari."**
- **After HTTPS is confirmed live on the deploy server (§10 #1):** revert this override so HSTS goes out again (it's correct and desirable once TLS is actually in front of the app).
- To recover an already-poisoned device now: iOS → Settings → Safari → **Clear History and Website Data** (wipes the cached HSTS entry).

### #6 — Secrets
Confirm `JWT_SECRET` and `SETUP_SECRET_TOKEN` are long, random, and stored in real secrets/env — never committed. (Also in §6 / §9.) `src/utils/jwt.ts` already fails startup loudly if `JWT_SECRET` is unset, so this can only be silently wrong via a *weak* value, not a missing one.

### #7 — Done already (no action)
- **Request timeout** added to the Axios client (`frontend/src/lib/api.ts`, `timeout: 20000`) so an unreachable backend surfaces an error instead of hanging silently.
- Client-side route guards on both `/dashboard` and `/system-admin`.
- CORS origin allowlist (#2), login rate-limiting (#3), httpOnly cookie session (#4) — all added since this section was last written.

### Auth pre-launch checklist
- [ ] ⚠️ HTTPS/TLS in front of both apps (Caddy) — confirm on the live server
- [x] ✅ CORS restricted to real frontend origin(s) — confirm `CORS_ORIGIN` env is set correctly in production
- [x] ✅ Rate-limiting on login + OTP endpoints
- [x] ✅ Content-Security-Policy on the frontend (2026-08-11) — ⚠️ not browser-verified, see §10 #4
- [x] ✅ Token storage decided: httpOnly cookie (localStorage option is moot now) — `proxy.ts` now also does lightweight server-side gating on it (added 2026-08-11, see §10 above)
- [x] ✅ HSTS: disabled pending live-HTTPS confirmation (2026-08-11) — re-enable once TLS is confirmed live
- [ ] ⚠️ `JWT_SECRET` / `SETUP_SECRET_TOKEN` strong and out of the repo — confirm on the live server

---

## 11. Dependency Vulnerability Management (new, 2026-08-11)

Application-code security review (audits of controllers/middleware/business logic — see
`PROGRESS.md`'s session log) and dependency-CVE tracking are two different failure modes that
need two different tools. The former has had several dedicated audit passes; the latter had zero
tooling until this session.

**What's now in place:**
- **`npm audit` in CI** (`.github/workflows/ci.yml`) — runs on every PR/push, blocking at
  `--audit-level=moderate` for both backend and frontend. Both are 0 vulnerabilities at every
  severity as of 2026-08-11, so this is a real gate, not a formality.
- **Dependabot** (`.github/dependabot.yml`) — weekly PRs for both `npm` ecosystems (root + `frontend/`) plus GitHub Actions versions, grouped by minor/patch so routine bumps don't flood the PR list. `next` is excluded from *major*-version auto-PRs (deliberate manual upgrade) but still gets patch/minor PRs.

**Resolved 2026-08-11: Next.js 16.2.4 → 16.3.0.** The 3 known-accepted high-severity advisories
(`postcss` XSS/path-traversal in sourcemap handling, `sharp`/`libvips` image-processing CVEs —
both vendored inside `next`'s own dependency tree) are closed by this upgrade; `npm audit` now
reports 0 vulnerabilities on the frontend at every severity. Verified via `tsc --noEmit`, `eslint`
(same 412 pre-existing warnings, 0 errors, before and after — confirmed no lint regression from
the bump), the frontend unit test suite, and a clean `next build`. **Not verified:** a real browser
smoke-test — this sandbox has no root to install Chromium's shared libs, so Playwright's cached
Chromium binary fails to launch here (same limitation noted elsewhere in `PROGRESS.md`). Do a
manual browser pass (login, dashboard, public `/r/[slug]` booking flow, language switch) before/soon
after this ships to staging or production.

**Backend dependency fixes applied this session:** `npm audit fix` (non-breaking) resolved a
**critical** prototype-pollution CVE in `i18next-fs-backend`, plus `nanoid`/`postcss`/`qs`/
`body-parser` advisories. Backend is 0 vulnerabilities at every severity as of 2026-08-11.

---

## Follow-ups — flagged but not done this session

Everything from the previous round's list is now done except the items that genuinely require a
human with live-server or account access this sandbox cannot obtain. What's left, as of the
second 2026-08-11 pass:

1. **HTTPS/HSTS status still unconfirmed on the live server** (§10 #1/#5) — confirmed
   *unavailable*, not just untried: this sandbox can reach `deploy@your-server-ip` at the TCP/SSH
   level but has no credentialed key for the `deploy` user. HSTS is disabled in code as a safe
   interim measure either way. **Someone with real access to that host needs to confirm Caddy/TLS
   is actually in front of it**, then revert the `hsts: false` override in `src/app.ts`.
2. **The `⚠️`-marked items in §9/§10's checklists** (firewall, DB user privileges, backup
   encryption/offsite copy, `CORS_ORIGIN` value, secrets storage, and now also whether the S3
   object-storage env vars are actually set in production) remain unconfirmed for the same reason
   as #1 — needs a live-server audit pass by someone with actual SSH access.
3. **A real browser pass is owed on two fronts**: the new frontend CSP header (§10 #4 — watch
   devtools console across the public booking flow, dashboard, and the PDF/PNG schedule export for
   violations) and the Next.js 16.3.0 upgrade (§11, carried over — never got a browser smoke-test
   either). This sandbox cannot launch even a cached Playwright Chromium (no root for shared libs)
   — this has been true all session and needs a human with a real browser.
4. **A real staging environment still doesn't exist** (§4.1) — the tooling/docs are ready
   (`docs/STAGING.md`, `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md`, `.github/workflows/staging.yml`), but
   nobody has provisioned the actual second VPS or port-set. That step needs hosting access this
   sandbox doesn't have.
5. **Object storage hasn't been verified against a real bucket** (§3) — `S3Provider.ts`'s logic is
   covered by tests against a mocked S3 client only. Set the real `S3_*` env vars in production and
   confirm an upload actually lands in the bucket and is publicly fetchable.
6. **Uptime monitoring / Sentry error tracking need real accounts** (§9) — the app is wired to use
   them via env vars and no-ops cleanly without, but nobody has created the actual Sentry project
   or UptimeRobot/BetterStack monitor yet. See `docs/MONITORING.md` for the exact manual steps.
7. **KVKK legal artifacts, not code**: the privacy-notice content is deliberately generic
   placeholder text (§7) pending a KVKK danışmanı's review; the veri işleme sözleşmesi (data
   processing agreement) template and VERBİS registration are still unaddressed.

**Process note for future multi-agent sessions in this sandbox** (see `PROGRESS.md` for the full
account): isolated agent worktrees kept getting created from a stale ~130-commit-behind base
rather than the current branch tip — caught and fixed via a fast-forward merge at the start of
each individual agent's own work, or at coordinator-merge time when an agent didn't catch it
itself. One agent also silently left ~56 minutes of real, uncommitted work behind and reported
success anyway when its background verification steps didn't finish — always verify a subagent's
"done" claim by checking its actual worktree/branch state directly, not just its summary.

---

*Generated as an operational reference. Revisit each section as the product and tenant base grow.*
