'use client'; // Error boundaries must be Client Components.

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Root-level error boundary (Next.js file convention — only used for errors that
// crash the root layout itself, which is rare; most errors are caught by nested
// error.tsx boundaries closer to where they occur). Must define its own <html>/
// <body> since it replaces the root layout when active, so it intentionally
// doesn't use the app's i18n provider/theming — this is a last-resort fallback.
//
// Sentry.captureException() is a safe no-op when NEXT_PUBLIC_SENTRY_DSN is unset
// (see src/instrumentation-client.ts) — no need to gate this call separately.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            padding: '2rem',
          }}
        >
          <h1>Something went wrong / Bir şeyler ters gitti</h1>
          <p>Please refresh the page. / Lütfen sayfayı yenileyin.</p>
        </div>
      </body>
    </html>
  );
}
