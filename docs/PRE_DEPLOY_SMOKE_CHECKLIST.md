# Pre-Deploy Smoke Checklist

Manual checklist, run by hand against **staging** (see `docs/STAGING.md`) before
every merge of `develop` into `main` (per `docs/GIT_WORKFLOW.md`'s "Releasing to
production" step and `PRODUCTION_ROADMAP.md` §4.2). Not automated, not CI — a
person clicks through this in a browser.

**If any box fails, the update does not ship.** Fix on `develop`, redeploy to
staging, re-run this whole list from the top.

> **Not the same thing as `scripts/smoke-test.mjs`.** That script is an automated,
> API-level check run *after* a deploy (staging or production) to confirm the
> process is actually up (`.github/workflows/smoke.yml`). This checklist is a
> *pre-deploy*, UI-level, human check of the actual product flows, run only on
> staging. See `docs/STAGING.md` §5 for the full comparison. Run both — they catch
> different failure classes.

---

## 0. Before you start

- [ ] Staging is running the exact commit at the tip of `develop` you're about to
      release (`git log -1` on the staging checkout matches `git log -1 origin/develop`)
- [ ] Staging's database has a reasonably fresh copy of production data
      (`docs/STAGING.md` §3) — not empty, not months stale
- [ ] You have credentials for a test account in each role: `SUPER_ADMIN`,
      `ADMIN` (or `MANAGER`), `STAFF`

## 1. Auth — log in as each role

- [ ] Log in as `SUPER_ADMIN` → lands on `/system-admin` → tenant list loads
- [ ] Log in as tenant `ADMIN` (or `MANAGER`) → lands on `/dashboard` → sidebar/nav
      renders without errors
- [ ] Log in as `STAFF` → lands on `/dashboard` scoped to their restaurant, with
      staff-appropriate nav (not admin-only sections)
- [ ] Log out from each role cleanly redirects to `/auth/login`

## 2. Reservations — all 3 logic modes

For a tenant configured in each mode (`RestaurantSettings.reservationMode` —
`PROJECT_LOGIC.md` §3; use three different test tenants, or reconfigure one
tenant's settings between checks):

- [ ] **`FIXED_TIME_SLOT`** — create a reservation picking one of the fixed slots;
      it saves and appears on the reservations list/calendar with the correct slot time
- [ ] **`DYNAMIC_DURATION`** — create a reservation; the end time is computed from
      `defaultDurationMinutes` and displayed correctly
- [ ] **`MANUAL_AVAILABILITY`** — toggle a table's status manually, then create/seat
      a reservation against it; table status reflects the change

## 3. Public-facing pages

- [ ] Load the public booking page `/r/[slug]` for a test tenant — hero, branding
      (colors/typography/announcement banner from `customizationController`), and the
      reservation form all render
- [ ] Submit a reservation from the public page as a guest (no login) — succeeds
      and the reservation shows up in the dashboard
- [ ] Load the QR-only menu route `/r/[slug]/menu` — same tenant branding, hero/
      reservation sections hidden, menu items with current prices visible
- [ ] Confirm the public page renders correctly for **each of the 4 layout
      styles** if time allows (`CLASSIC_LIST`, `EDITORIAL_IMAGE`, `ANIMATED`,
      `GARDEN_FRESH`) — at minimum spot-check the one(s) actually in use by real
      tenants

## 4. Staff operations

- [ ] Staff check-in: clock in from the timesheet/time-entry UI — a `TimeEntry`
      is created with a start time
- [ ] Staff check-out: clock out — the entry gets an end time and worked hours
      compute correctly
- [ ] Worked-hours summary (dashboard/staff or timesheet view) reflects the new
      entry

## 5. Pricing

- [ ] Trigger (or wait for) a scheduled price update (`ScheduledPriceUpdate` /
      `priceUpdater` worker) — menu item prices change by the configured
      percentage/fixed amount at the expected time
- [ ] An immediate (non-scheduled) bulk price update applies correctly and is
      reflected on the public menu right away

## 6. Internationalization

- [ ] Switch language TR → EN on the public booking page — UI strings change,
      layout doesn't break
- [ ] Switch language EN → TR — same, round-trips cleanly
- [ ] Switch language in the dashboard (staff-facing) — UI strings change there too

## 7. Sign-off

- [ ] All boxes above checked
- [ ] Any failures found were fixed on `develop`, redeployed to staging, and
      **this checklist re-run from the top** (not just re-checking the failed box)
- [ ] Checklist run by: ______________  Date: ______________  `develop` commit: ______________

Once this passes, proceed with `docs/GIT_WORKFLOW.md`'s release steps (merge
`develop` → `main`, tag, deploy per `docs/SERVER_SETUP.md` §12 /
`docs/DATABASE_RUNBOOK.md` §6), then run the automated post-deploy
`scripts/smoke-test.mjs` against the newly deployed instance.
