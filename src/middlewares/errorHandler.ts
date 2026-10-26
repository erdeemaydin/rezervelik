import { Request, Response, NextFunction } from 'express';
import i18next from '../config/i18n';
import { AppError } from '../utils/AppError';
import Sentry from '../config/sentry';

/**
 * 404 handler — mounted after all routes. Ensures an unknown path returns the
 * standard JSON error envelope (see utils/response.ts) instead of Express's
 * default HTML "Cannot GET /..." page, which the frontend can't parse.
 */
export const notFoundHandler = (req: Request, res: Response) => {
  const message = (req as any).t ? (req as any).t('errors.route_not_found') : i18next.t('errors.route_not_found');
  return res.status(404).json({
    success: false,
    code: 'errors.route_not_found',
    error: message,
    message,
    details: { method: req.method, path: req.originalUrl },
  });
};

/**
 * Central error handler — the last `app.use`. Any error thrown or passed to
 * `next(err)` from anywhere in the request lifecycle lands here and is turned
 * into the standard error envelope, localized to the request's language.
 *
 *  - `AppError` → its own code/status/details are used (our deliberate failures).
 *  - Prisma "record not found" (P2025) → a clean 404 instead of a 500 stack.
 *  - Malformed JSON body (express.json SyntaxError) → 400 validation error.
 *  - Anything else → a generic 500 that never leaks the raw message/stack to the
 *    client (it's logged server-side instead), so we don't expose internals.
 *
 * Express identifies an error handler purely by its 4-arg signature, so `next`
 * must stay in the list even though it's unused.
 *
 * Every error that reaches here is also reported to Sentry (see
 * src/config/sentry.ts) — a safe no-op when SENTRY_DSN is unset, so this never
 * needs its own gating.
 */
export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  Sentry.captureException(err);

  // Per-request translator (set in app.ts from Accept-Language); fall back to the
  // shared instance so this still works if i18n middleware didn't run.
  const t = (req as any).t || i18next.t.bind(i18next);

  const send = (code: string, status: number, details?: any) =>
    res.status(status).json({ success: false, code, error: t(code), message: t(code), details });

  if (err instanceof AppError) {
    return send(err.code, err.status, err.details);
  }

  // Body-parser threw on invalid JSON.
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return send('errors.invalid_json', 400);
  }

  // Common Prisma error: operating on a row that doesn't exist.
  if (err?.code === 'P2025') {
    return send('errors.not_found', 404);
  }

  // Unknown/unexpected — this is a bug. Log the real thing, tell the client nothing.
  console.error('[ErrorHandler] Unhandled error:', err?.message, err?.stack);
  return send('errors.internal_error', 500);
};

/**
 * Wraps an async route handler so a rejected promise is forwarded to the error
 * middleware instead of becoming an unhandled rejection. Lets controllers throw
 * (including AppError) without wrapping every one in try/catch.
 *
 *   router.get('/x', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler =
  <T extends (req: Request, res: Response, next: NextFunction) => any>(fn: T) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
