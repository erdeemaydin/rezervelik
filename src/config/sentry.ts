import * as Sentry from '@sentry/node';

// Error tracking is entirely opt-in. With SENTRY_DSN unset (the default in local
// dev, this sandbox, and CI — none of which have a real Sentry project) this file
// is a clean no-op: Sentry.init() is never called, and Sentry.captureException()
// calls elsewhere in the app (see src/middlewares/errorHandler.ts and src/server.ts)
// are safe to call unconditionally — the SDK simply does nothing without a client.
//
// To enable: set SENTRY_DSN in the production .env (see docs/MONITORING.md for the
// full manual setup a human needs to do — creating the Sentry project, etc).
const dsn = process.env.SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Keep this a pure error-tracking integration for now; tracing/profiling can be
    // turned on later by raising this once there's a real project to tune it against.
    tracesSampleRate: 0,
  });
}

export default Sentry;
