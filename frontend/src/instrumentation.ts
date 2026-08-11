// Server-side instrumentation entry point (Next.js file convention — see
// frontend/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// This version of Next.js (16.x) uses `register()` + `onRequestError` here instead
// of the older `sentry.server.config.ts` pattern most @sentry/nextjs guides assume;
// per frontend/AGENTS.md, don't copy an older quickstart verbatim.
//
// Entirely opt-in: with NEXT_PUBLIC_SENTRY_DSN unset (local dev, this sandbox, CI —
// none of which have a real Sentry project) `register()` never calls Sentry.init(),
// and `onRequestError` is a no-op guarded the same way.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0,
    });
  }
}

// Reports server-side rendering/route-handler errors to Sentry. Sentry's own
// captureRequestError() checks internally whether a client was ever initialized,
// so this is safe to export unconditionally — it's a no-op when the DSN is unset.
export const onRequestError = Sentry.captureRequestError;
