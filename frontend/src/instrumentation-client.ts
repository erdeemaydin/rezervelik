// Client-side instrumentation entry point (Next.js file convention — see
// frontend/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md).
// Runs in the browser after the HTML loads and before React hydrates. This is the
// Next.js 15.3+/16 replacement for the older `sentry.client.config.ts` pattern.
//
// NEXT_PUBLIC_SENTRY_DSN is inlined at build time; when it's unset (the default —
// local dev, this sandbox, and CI have no real Sentry project) Sentry.init() is
// never called and the SDK does nothing.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
  });
}
