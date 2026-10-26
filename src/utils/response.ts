import { Response } from 'express';
import i18next from '../config/i18n';

// Translate with the request's fixed-language translator (set in app.ts) so the
// message matches the caller's Accept-Language, not whatever global state some
// other concurrent request left behind. Falls back to the shared instance if the
// localization middleware didn't run (e.g. in a unit test hitting a helper).
const translator = (res: Response) => (res.req as any)?.t || i18next.t.bind(i18next);

export const successResponse = (res: Response, data: any, messageKey?: string, status: number = 200) => {
  const message = messageKey ? translator(res)(messageKey) : undefined;
  return res.status(status).json({
    success: true,
    data,
    message,
  });
};

/**
 * Standard error envelope for the whole API. Every failure — returned here or
 * thrown as an AppError and caught by the error middleware — is shaped the same
 * way so the frontend can rely on one contract:
 *
 *   {
 *     success: false,
 *     code:    "errors.unauthorized",         // stable machine key (never translated)
 *     error:   "Invalid email or password",   // human message, localized via Accept-Language
 *     message: "Invalid email or password",   // alias of `error` for clients reading .message
 *     details: { ... }                        // optional context (field errors, failed rules…)
 *   }
 *
 * `errorKey` is an i18next key (e.g. `errors.invalid_credentials`). We keep it on
 * the wire as `code` so clients can branch on the failure without string-matching
 * a translated sentence.
 */
export const errorResponse = (res: Response, errorKey: string, status: number = 400, details?: any) => {
  const message = translator(res)(errorKey);
  return res.status(status).json({
    success: false,
    code: errorKey,
    error: message,
    message,
    details,
  });
};
