/**
 * A deliberate, expected failure that carries everything the error middleware
 * needs to build a proper localized response: an i18n `code`, an HTTP `status`,
 * and optional `details`. Throw this from controllers/services instead of
 * returning `errorResponse` directly when it's cleaner to bail out of a deep
 * code path — the central error handler (see middlewares/errorHandler.ts) turns
 * it into the standard error envelope.
 *
 *   throw new AppError('errors.invalid_credentials', 401);
 *   throw new AppError('errors.password_policy', 400, { failed: ['uppercase'] });
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: any;
  /** Marks errors we raised on purpose vs. unexpected crashes, so the handler
   *  never leaks internals for a bug but always shows our own messages. */
  public readonly isOperational = true;

  constructor(code: string, status: number = 400, details?: any) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}
