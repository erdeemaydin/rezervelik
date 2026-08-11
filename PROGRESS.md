# Progress Log

Day-to-day record of substantial work sessions on this project. Newest entry first.

## 2026-08-11 (cont'd) — parallel multi-agent pass on the remaining roadmap items + a live menu-creation bug

Picked up where the previous same-day session left off: item 6 of its priority list ("lower
priority, still open" — object storage, staging tooling, KVKK consent/retention, uptime/error
monitoring, frontend CSP). User asked for subagents on all five; also reported a live bug
("can't add any new item to the menu") that got fixed directly first since it was blocking actual
usage.

**Menu item creation bug (fixed directly, not delegated):** root cause was commit `c1f75fb`
(2026-06-02, unrelated pricing feature) flattening the item-create route from
`POST /categories/:categoryId/items` to `POST /items` without updating either caller —
`menuController.createMenuItem` kept reading `categoryId` from `req.params` (always `undefined` on
the new flat route), and both frontend call sites (`dashboard/menus/page.tsx`,
`menus/wizard/page.tsx`) kept posting to the old nested URL, which 404s outright. This had been
broken since June; every existing test that hit this endpoint was a *negative* test (tenant
isolation / bad-price checks) expecting a 400, so nothing ever caught that the happy path never
worked. Fixed both call sites + the controller, added the missing 201 regression test.

**Five parallel subagents, each in an isolated git worktree** (to avoid concurrent edits
clobbering each other), merged back into `agent/telegram-bot` one at a time as they finished, with
conflicts resolved by hand rather than blind `git merge --no-ff`:

- **Object storage** (`src/services/storage/`, S3-compatible or local-disk fallback) — merge
  conflict: the new provider derived the stored file's extension/mimetype from the *client-supplied*
  originalname, which would have reopened a spoofed-upload hole a prior security pass had closed
  (this branch's `uploadController.ts` sniffs real file content instead). Resolved by feeding the
  sniffed result into the provider rather than trusting client input. Also merged a same-endpoint
  add/add test-file conflict by hand, keeping both the security tests (auth-required, content-
  sniffing) from this branch and the new tenant-isolation tests from the storage branch.
- **Staging environment** — mostly docs/tooling (`docs/STAGING.md`,
  `docs/PRE_DEPLOY_SMOKE_CHECKLIST.md`, `.github/workflows/staging.yml`), since no live-server
  access exists in this sandbox to actually provision anything. Merged clean, no conflicts.
- **Uptime/error monitoring** (Sentry, gated behind `SENTRY_DSN`) — merge conflict: this worktree's
  fork point predated `src/middlewares/errorHandler.ts`'s existence entirely, so the agent
  (reasonably, from its vantage point) wrote a new minimal one from scratch. Taking it wholesale
  would have silently reverted the real handler's i18n-aware messages, `AppError` mapping, Prisma
  P2025→404 handling, and `asyncHandler`/`notFoundHandler` — all load-bearing across the existing
  test suite. Resolved by keeping the existing handler and adding `Sentry.captureException()` as
  its first line; similarly kept `server.ts`'s established `import './env'`-first dotenv-order
  pattern (a previously-fixed bug) rather than the agent's inline rewrite.
- **KVKK consent/retention** — by far the largest scope (8 public layout components each needed a
  shared new `ConsentFields.tsx`, a schema migration, a retention worker, a deletion endpoint).
  First completion notification claimed success but had left everything uncommitted — the agent's
  own background test/build verification apparently never finished before it stopped. Caught by
  checking the actual worktree state directly instead of trusting the summary (also found a stray
  `anmeldedaten.txt` scratch file with dummy dev credentials in the worktree — harmless, untracked,
  left alone). **Mistake made and corrected in-session:** the first attempt to get it to finish used
  a fresh `Agent` call instead of `SendMessage` to resume the *same* agent — this spawned a second,
  context-less agent that started operating blind in the wrong directory. Caught within seconds
  (it had only read files, no writes) and stopped before any damage; properly resumed the original
  agent via `SendMessage` instead, which then finished cleanly (271→282 tests passing, 5 real
  commits, pushed). Only merge conflict was an additive one in `.env.example`.
- **Frontend CSP** — this agent stalled silently: over an hour with zero commits and, for its last
  15+ minutes, zero active process and zero diff growth. A status-check nudge via `SendMessage` got
  no response. Rather than write a CSP policy from scratch blind, reviewed what it *had* drafted
  before stalling — a well-reasoned, app-specific policy (correctly identified that `style-src`
  needs `'unsafe-inline'` because per-tenant customization colors are inline `style={{}}` attributes
  nonces can't cover, that `img-src` needs to stay broad pending the object-storage migration, that
  the PayTR payment iframe needs a `frame-src` allowance) rather than a cargo-culted template.
  Independently verified every factual claim it rested on against the actual code before trusting
  it, then finished and merged the work directly.

**Final combined verification** after all five merges: 282/282 backend tests, clean `tsc --noEmit`
on both apps, clean `next build`, `eslint` unchanged at 413 pre-existing warnings (0 errors).

**Standing lessons for future multi-agent sessions in this sandbox:**
- Isolated worktrees created via the `Agent` tool's `isolation: "worktree"` option have, so far,
  consistently started from a stale ~130-commit-behind base rather than the current branch tip —
  not something this session's prompts caused. Always check `git merge-base` against the target
  branch before merging; don't assume a subagent's worktree is current.
- A subagent's "done, verified, pushed" claim is not reliable on its own — this session hit one
  agent that left real work uncommitted despite saying otherwise, and would have hit a second
  silent-stall case if the CSP agent's draft hadn't been salvageable. **Check the actual
  worktree/branch state directly** (`git log`, `git status`, `git diff --stat`) before trusting a
  completion summary, especially before merging.
- To resume a specific subagent with its full context intact, use `SendMessage` to its agent ID —
  a fresh `Agent` call (even one that says "[resuming agent X]" in the prompt) starts a *new*,
  context-less agent instead. Caught this mistake within seconds this session; it could have caused
  real confusion if left running longer.

Consolidated all five agents' documentation notes into `PRODUCTION_ROADMAP.md`/`PROGRESS.md`
myself afterward — deliberately kept every subagent out of those two files during their individual
runs specifically to avoid five-way merge conflicts on the same doc sections.

## 2026-08-11 (cont'd) — worked the PRODUCTION_ROADMAP.md follow-ups list

Picked up the prior session's "Follow-ups — flagged but not done" list in priority order,
re-verifying each claim against current code (not the docs) before acting, per standing practice.

- **HSTS**: confirmed `src/app.ts` still had no `hsts: false` override. Since this sandbox has no
  credentialed access to the live deploy server (tried SSH to `deploy@your-server-ip` per
  `docs/DATABASE_RUNBOOK.md` — host reachable, key rejected, so live-HTTPS status genuinely cannot
  be confirmed from here), applied the roadmap's own prescribed interim fix: `hsts: false` in the
  `helmet()` call, closing the "poisons iOS Safari with a false HTTPS upgrade" failure mode
  regardless of whether TLS is actually live yet. Needs reverting once someone with real server
  access confirms Caddy/TLS is in front of the app.
- **Next.js 16.2.4 → 16.3.0**: read the GitHub release notes (no breaking changes touched this
  app's actual config — no experimental flags in use), bumped the version, and verified `tsc
  --noEmit` clean, `eslint` unchanged at 412 pre-existing warnings/0 errors (diffed against the
  pre-bump tree to confirm), the frontend unit suite green, and a clean `next build`. Closes the 3
  remaining frontend dependency advisories (postcss, sharp/libvips) — `npm audit` now reports 0
  vulnerabilities on the frontend at every severity, matching the backend, so removed the `|| true`
  carve-out on the CI frontend audit step and tightened it to `--audit-level=moderate` to match.
  **Not verified**: a real browser smoke-test — this sandbox has no root to install Chromium's
  shared libs, so even a cached Playwright Chromium binary fails to launch (same limitation as
  prior sessions).
- **`frontend/src/proxy.ts`**: the comment claiming the session token "lives in localStorage...
  this server-side proxy cannot read it" was false since the httpOnly-cookie migration — cookie
  matching ignores port, so this proxy can already read the `token` cookie in both the cross-port
  dev setup and the same-origin production setup behind the reverse proxy. Made the deliberate call
  the prior session flagged as open: added presence-only server-side gating (redirect to
  `/auth/login` if the `token` cookie is missing on `/dashboard/*` or `/system-admin/*`) — not JWT
  validation, which would need `JWT_SECRET` shared into the frontend. The backend's `authMiddleware`
  remains the real enforcement boundary; this only closes the gap where a fully logged-out visitor
  could load the dashboard shell HTML/JS at all before the existing client-side redirect fired.
  Verified with `next build` + `next start` + `curl` (protected paths 307 without a cookie, 200
  with one; public `/r/[slug]` and `/auth/login` unaffected) since a real browser isn't available
  here either.
- **`docs/TESTING_AND_CICD.md`**: same fact-check-every-claim treatment the roadmap doc got last
  session. It still described the test suite running against a throwaway SQLite file — actually
  Postgres everywhere now, and even the filename it cited (`prepare-test-db.ts`) was wrong (it's
  `.mjs`). Corrected the test-pyramid table, the "how the test DB comes from" section, the CI step
  lists (missing the `npm audit` gate added last session), and the local-dev command block.
- **Live-server-only checklist items** (§9/§10's ⚠️ items — firewall, DB user privileges, backup
  encryption/offsite copy, `CORS_ORIGIN` value, secrets storage): confirmed, don't guess. Recorded
  in the roadmap doc that this is now a *tested* fact for any session running in a sandbox like this
  one (SSH reaches the host, no key is provisioned for `deploy`), not just "nobody's checked yet."
- **Not started this session** (explicitly lower-priority per the request that kicked this off):
  object storage for uploads, a staging environment, KVKK consent/retention UI, uptime/error
  monitoring, frontend CSP. Each is substantial enough to be its own scoped session.

**Test DB note for future sessions in this sandbox:** no Docker/Podman available here, but a
Postgres 16 server is already running locally (`pg_lsclusters`) with a `dining_dev` superuser-ish
role that has `CREATEDB`. Hand-created a throwaway `dining_test` database owned by that role and
pointed `TEST_DATABASE_URL` at it — `npm run test:setup-db` doesn't need to spin up its own
container in that case, it just resets + migrates whatever `TEST_DATABASE_URL` points to.

## 2026-08-11 (cont'd) — dependency scanning in CI + PRODUCTION_ROADMAP.md refresh

Prompted by "how do we know we've eliminated all the bugs/security issues before production" —
the honest answer is you can't, from audits alone; different techniques catch different blind
spots. Proved the point immediately: `npm audit` (a tool, not a read-through) found a **critical**
prototype-pollution CVE in `i18next-fs-backend` that three rounds of application-code review never
would have, because it's not application code.

- **Dependency fixes**: `npm audit fix` (non-breaking) on the backend — resolved the critical
  i18next-fs-backend CVE plus nanoid/postcss/qs/body-parser advisories; backend is 0
  vulnerabilities at every severity now. Frontend: fixed the safe subset (`qs`); 3 remaining
  high-severity advisories (postcss XSS/path-traversal, sharp/libvips CVEs) are vendored inside
  `next@16.2.4` itself and only close via `npm audit fix --force` (bumps to 16.3.0) — deliberately
  *not* done unilaterally since `frontend/AGENTS.md` flags this Next.js version as breaking-change
  risk; a version bump deserves its own tested pass, not a side effect of a dependency-fix task.
- **CI + Dependabot**: added an `npm audit` gate to `ci.yml` (backend blocking at `moderate`,
  frontend blocking at `critical` with `high` informational-only pending the Next.js upgrade
  above) and `.github/dependabot.yml` for ongoing weekly scanning of both npm ecosystems + GitHub
  Actions versions.
- **`PRODUCTION_ROADMAP.md` refresh**: turned out to be far staler than expected — it was written
  pre-launch and still framed SQLite→Postgres migration, "zero automated tests," and a broken
  Prisma migration workflow as open blockers, when all three have been done for a while. Bigger
  finding: `docs/DATABASE_RUNBOOK.md` shows **the app is already running in production** (live
  server, pm2, daily automated backups) — a fact the roadmap doc gave no indication of. Went
  section-by-section verifying each claim against current code (not just skimming): marked
  CORS-lockdown/login-rate-limiting/httpOnly-cookie-session as done (all shipped since the doc was
  last touched), confirmed HSTS-over-HTTP is still genuinely unfixed in code (flagged as the
  highest-priority open item if HTTPS isn't live yet — the doc itself calls this "a leading
  suspect for can't sign in from iPhone/iPad Safari"), confirmed multer-uploads/staging-env/KVKK
  UI/uptime-monitoring/frontend-CSP are all still genuinely open by checking the actual code, and
  added a new §11 documenting the audit/Dependabot work above. New "Follow-ups" section at the
  bottom lists what's flagged but not fixed this pass — most notably `frontend/proxy.ts` still has
  a comment asserting the session token lives in localStorage (false since the httpOnly-cookie
  migration; nobody revisited whether server-side route gating is now worth adding) and
  `docs/TESTING_AND_CICD.md` has its own, separate SQLite-staleness problem not addressed here.

**Standing lesson for future sessions:** treat "operational/roadmap" docs (not just code) as
things that drift and need periodic fact-checking against the actual repo state, the same way
code itself gets audited — a stale pre-launch checklist read at face value is actively misleading
once the thing it describes has shipped.

## 2026-08-11 (cont'd) — full-codebase (not diff-scoped) re-audit

Same day as the pass below, but explicitly whole-codebase this time rather
than scoped to what changed since 2026-08-08 — three parallel read-only
forks (security, functional bugs, i18n), then verified and fixed everything
confirmed.

- **Critical: role-grant privilege escalation** (`staffController.ts`).
  `createStaffMember`/`updateStaffMember` wrote `role`/`permissions` straight
  from `req.body` with no whitelist. `User.role` is a plain string column
  (not a Prisma enum), and the router is gated only by
  `requirePermission('manage_staff')` — which a MANAGER can hold, not just
  ADMIN. A MANAGER holding that permission could set their own role to
  `SUPER_ADMIN` directly via `PUT /api/staff/:ownId`, minting a token that
  bypasses tenant scoping entirely (`authMiddleware` skips the tenant check
  for SUPER_ADMIN) and unlocks all of `/api/system/*`. Fixed with
  `isRoleGrantAllowed(newRole, callerRole)`: SUPER_ADMIN is never grantable
  through this endpoint at all; ADMIN is only grantable by a caller who is
  already ADMIN/SUPER_ADMIN (promoting a peer to ADMIN is an existing
  supported flow, kept working); MANAGER/HOST/STAFF remain open to anyone who
  reached the router. Resubmitting a target's own unchanged role (e.g. an
  ADMIN self-editing their phone number) is exempted so it doesn't regress
  the self-edit fix from 2026-08-08. `permissions` is now filtered to a known
  key list instead of storing arbitrary strings verbatim.
- **Cross-tenant IDOR via `tableId`/`categoryId`** (`reservationController.ts`,
  all four write paths: create/update/updateSchedule/updateStatus).
  `findTableConflict` only checked for *overlapping reservations* scoped to
  `restaurantId`+`tableId` — it never confirmed the table itself belonged to
  the tenant. A foreign `tableId` naturally has zero conflicting reservations
  under the caller's own `restaurantId`, so the check always reported "free"
  and the write proceeded, storing another tenant's `BookableResource.id` on
  this tenant's `Reservation` (and leaking that tenant's table via
  `include: { table: true }` on the reservation list). `categoryId` had the
  same gap. Added `verifyTableOwnership`/`verifyCategoryOwnership` to
  `reservationConflict.ts`, called before trusting either id at all four call
  sites — same "ignore/reject untrusted foreign reference" shape already
  established for `serviceId` in `createReservation`.
- **Unhandled concurrent-signup races** (functional-bug fork): `authController
  .register` (public tenant self-registration) and `systemController
  .createTenant` (SysAdmin provisioning) both did check-then-create on
  DB-unique columns (`User.email`, `Restaurant.slug`) with no `P2002`
  handling — the exact race `staffController.createStaffMember` was already
  fixed for, just never carried over to its two siblings. Both now return the
  same friendly "already in use" error instead of a raw 500 on the loser.
- **JWT algorithm pinning**: `verifyOtpChallengeToken` didn't pin
  `algorithms: ['HS256']` like `verifyToken` does. Low real-world risk (this
  app only ever signs HS256, no asymmetric keys anywhere to key-confuse
  against) but fixed for consistency/defense-in-depth.
- **i18n**: re-confirmed "İ" misuse is still clean codebase-wide (not just in
  the diff), and `tr.json` naturalness holds up reading every key end-to-end
  in both dictionaries. Found two more guest-facing pages with zero i18n
  (same shape as the `/pay` pages found in the prior pass) — the waitlist-
  offer accept/decline page (`/r/[slug]/offer/[token]`, reached via SMS/email
  link) and the public QR-code walk-in waitlist join page
  (`/r/[slug]/waitlist`) were both 100% hardcoded English. Wired both through
  `useTranslation`/`LanguageSwitcher` with new `waitlistOffer`/
  `publicWaitlist` i18n namespaces in both locale files; restructured the
  offer page's expiry line from a sentence with an embedded time into its own
  labeled detail row (matching the existing Date/Time/Party Size rows) since
  this i18n system has no string-interpolation support and Turkish's
  locative-suffix-on-a-number ("20:30'da") isn't safely computable from a
  plain concatenation. (`/r/[slug]/invite/[token]` was checked too but is
  deliberately hand-written bilingual TR·EN side-by-side, not an oversight.)

New regression tests: `staff-role-escalation.test.ts`,
`reservation-foreign-table-idor.test.ts`. Full suite (252 tests) green; both
`tsc` clean; frontend `eslint` clean (no new warnings beyond pre-existing
`any`/`<img>` ones); `next build --experimental-build-mode compile` clean.

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
