# Monitoring — Uptime & Error Tracking

`docs/planning/PRODUCTION_ROADMAP.md` (Phase 2) flags **uptime monitoring** (UptimeRobot/BetterStack)
and **error tracking** (Sentry) as open items. This doc covers both: what the app
*already does* to be ready for them, and the **manual, account-based steps a human
still has to do** — none of this can be done from a sandboxed coding environment
because it requires creating real accounts/projects on third-party services and
holding credentials for them.

## 1. What's already wired up (done in this repo)

### Error tracking — Sentry SDKs, gated behind env vars

Both apps integrate the Sentry SDK, but **entirely opt-in**: with the DSN env var
unset, `Sentry.init()` is never called and every `Sentry.captureException(...)` call
elsewhere in the code is a safe no-op (the underlying SDK checks for an initialized
client internally and does nothing if there isn't one). This is why local dev, CI,
and this sandbox — none of which have a real Sentry project — build, boot, and test
cleanly with no DSN configured.

**Backend** (`@sentry/node`):
- `src/config/sentry.ts` — calls `Sentry.init({ dsn: process.env.SENTRY_DSN, ... })`
  only if `SENTRY_DSN` is set. Exported as the app's single Sentry instance.
- `src/server.ts` — imports `src/config/sentry.ts` before anything else, and adds
  process-level `unhandledRejection` / `uncaughtException` handlers that report to
  Sentry and log to console. These catch errors that happen outside any HTTP request
  (e.g. in `src/workers/priceUpdater.ts`'s timers) that would never reach Express's
  error-handling middleware.
- `src/middlewares/errorHandler.ts` — a new last-resort Express error middleware
  (4-arg signature), mounted **last** in `src/app.ts` after every route. It reports
  to Sentry, logs, and returns the existing `errorResponse()` JSON shape. Most
  controllers in this codebase already catch their own errors and respond directly
  (see the `catch (error) { return errorResponse(...) }` pattern throughout
  `src/controllers/`), so this middleware is a safety net for what those don't
  cover: synchronous throws in middleware/routes, body-parser failures (malformed
  JSON), and anything explicitly forwarded via `next(err)`.

**Frontend** (`@sentry/nextjs`):

This Next.js version (16.2.4) is newer than what most Sentry Next.js setup guides
assume — see `frontend/AGENTS.md`'s warning to check
`frontend/node_modules/next/dist/docs/` before wiring anything up. Concretely: Next
15.3+ replaced the older `sentry.client.config.ts` / `sentry.server.config.ts` /
`sentry.edge.config.ts` convention with two first-class file conventions,
`instrumentation.ts` and `instrumentation-client.ts` (docs:
`01-app/03-api-reference/03-file-conventions/instrumentation{,-client}.md`), so
that's what this integration uses instead of the older wizard-generated files:

- `frontend/src/instrumentation-client.ts` — runs in the browser, before React
  hydrates. Calls `Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ... })`
  only if the DSN is set.
- `frontend/src/instrumentation.ts` — server-side. Its `register()` function calls
  `Sentry.init(...)` (same DSN — `NEXT_PUBLIC_*` vars are readable at runtime in
  Node.js server code, not just inlined client-side) when running in the Node.js
  runtime and a DSN is present. It also exports `onRequestError =
  Sentry.captureRequestError`, which Next.js calls automatically on server-side
  rendering/route-handler errors (this hook's underlying implementation is
  inherently a no-op without an initialized Sentry client, so it's safe to export
  unconditionally).
- `frontend/src/app/global-error.tsx` — a new root error boundary (Next.js file
  convention) that reports uncaught React render errors to Sentry via
  `Sentry.captureException()` in a `useEffect`, then shows a minimal bilingual
  fallback. It intentionally doesn't use the app's i18n provider/theming, since
  `global-error.tsx` replaces the entire root layout (including `<html>`/`<body>`)
  when it's active — this is Next's documented constraint, not an oversight.

No `next.config.ts` changes were made — the Sentry Next.js webpack plugin (source
map upload on build, via `withSentryConfig`) needs a `SENTRY_AUTH_TOKEN` plus a real
org/project slug, none of which exist yet. Skipping it means production builds
won't get de-minified stack traces in Sentry until that's added later; basic error
capture (this doc's scope) doesn't need it.

### Health endpoint — already fit for purpose

`GET /health` (`src/app.ts`) already exists and was evaluated against what an
external uptime monitor needs:

```
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

- Fast — no DB query, no auth, no tenant middleware.
- Matches what `scripts/smoke-test.mjs` and `docs/engineering/TESTING_AND_CICD.md` §6 already
  expect (`{ status: "ok" }`), so it doubles as the post-deploy smoke check's first
  assertion.
- Deliberately **not** DB-backed: a transient DB blip would otherwise flap an
  uptime monitor for something that isn't "the app is down," and the smoke test
  already exercises a real DB-backed endpoint (`/api/auth/login`,
  `/api/settings`) as a separate, more specific check. If a deeper "is the DB
  reachable" check is wanted later, add it as a distinct endpoint (e.g.
  `/health/db`) rather than changing what `/health` returns — that keeps the
  existing smoke-test/docs contract intact.

**No code changes were needed here** — it was already fit for purpose.

## 2. What a human still has to do (cannot be done from this sandbox)

These all require creating accounts / projects on third-party services and holding
real credentials — outside what a sandboxed coding agent can or should do.

### 2.1 Uptime monitoring (UptimeRobot or BetterStack)

1. Create a free account at [uptimerobot.com](https://uptimerobot.com) or
   [betteruptime.com](https://betteruptime.com) (BetterStack).
2. Add a new HTTP(S) monitor:
   - URL: `https://YOUR_DOMAIN/health` (the live production domain from
     `docs/operations/SERVER_SETUP.md`).
   - Method: `GET`.
   - Expected: HTTP 200, optionally assert the response body contains
     `"status":"ok"`.
   - Check interval: 1–5 minutes (both services support this on the free tier).
3. Configure alert contacts (email, SMS, Slack/Discord webhook — whatever the team
   actually monitors) so a failed check pages someone.
4. Optional: also monitor `https://YOUR_DOMAIN/` (the frontend) as a second monitor,
   since `/health` only proves the backend process is up, not that Nginx/Next.js
   are serving the site.

Nothing in the app needs to change for this — `/health` is already suitable
(see §1).

### 2.2 Error tracking (Sentry)

1. Create a free account/org at [sentry.io](https://sentry.io) (or self-host, if
   preferred).
2. Create **two** Sentry projects (or one project used for both, if you'd rather
   keep it simple) — one for the Node.js backend, one for the Next.js frontend.
   Each gives you a DSN (`https://<key>@o<org>.ingest.<region>.sentry.io/<project>`).
3. On the production server (see `docs/operations/SERVER_SETUP.md` §6.3/§6.4 for where these
   `.env` files live — repo root `.env` for the backend, `frontend/.env` for the
   frontend, both under `~/dining-reservation` on the deploy box), set:
   ```
   # repo root .env
   SENTRY_DSN="https://<backend-key>@o<org>.ingest.<region>.sentry.io/<backend-project>"

   # frontend/.env
   NEXT_PUBLIC_SENTRY_DSN="https://<frontend-key>@o<org>.ingest.<region>.sentry.io/<frontend-project>"
   ```
4. Rebuild and restart:
   ```
   npm run build && pm2 reload dining-api          # backend — reads SENTRY_DSN at boot
   cd frontend && npm run build && cd .. && pm2 reload dining-web   # frontend — NEXT_PUBLIC_* is baked in at build time
   ```
   The frontend DSN is a `NEXT_PUBLIC_*` var, so it must be set **before** `npm run
   build`, not just before starting the server — see `frontend/.env.example`.
5. Trigger a test error (e.g. temporarily add a route that throws, hit it, then
   remove it) and confirm the event lands in the Sentry dashboard for each project.
6. Optional, once there's a real org/project: add source map upload via
   `withSentryConfig` in `frontend/next.config.ts` and a `SENTRY_AUTH_TOKEN`, so
   frontend stack traces in Sentry are de-minified. Not required for basic error
   capture — this repo intentionally skipped it (see §1) since it needs a token
   that doesn't exist yet.

### 2.3 Not verifiable from this sandbox

The following were **not** and **could not** be verified here, and should be
confirmed manually once real credentials exist:
- An actual error event arriving in a real Sentry project's dashboard (backend or
  frontend) — verified instead by confirming the SDK initializes without throwing
  when a DSN-shaped value is set, and is a true no-op (no `Sentry.init()` call at
  all) when unset.
- An actual UptimeRobot/BetterStack check going green against the live domain —
  there's no live deployment or public domain reachable from this sandbox; verified
  instead by confirming `/health` responds fast, with no auth and no DB dependency,
  against a locally-run instance.
