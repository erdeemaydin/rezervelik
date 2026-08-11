import { ErrorRequestHandler } from 'express';
import Sentry from '../config/sentry';
import { errorResponse } from '../utils/response';

// Last-resort Express error middleware (4 args — Express only treats a handler as
// an error handler when it has exactly this signature). Most controllers in this
// codebase catch their own errors and respond directly (see CLAUDE.md / existing
// `catch (error) { return errorResponse(...) }` pattern), so this mainly catches:
//   - synchronous throws in middleware/routes that aren't already try/caught,
//   - errors forwarded explicitly via `next(err)`,
//   - body-parser/JSON-parse failures from express.json(), etc.
// It must be mounted LAST, after all routes, in src/app.ts.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Sentry.captureException() is a safe no-op when SENTRY_DSN is unset (no client
  // was initialized in src/config/sentry.ts), so this call never needs to be gated.
  Sentry.captureException(err);

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);

  // If a response was already partially sent, delegate to Express's default
  // handler instead of trying to send a second one.
  if (res.headersSent) {
    return next(err);
  }

  return errorResponse(res, 'errors.internal_error', 500);
};

export default errorHandler;
