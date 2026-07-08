// One place to turn an Axios/API failure into a message we can show a user.
//
// The backend error envelope (see src/utils/response.ts) is always:
//   { success:false, code, error, message, details }
// where `message`/`error` are already localized by the server. We prefer that,
// then fall back through a few shapes, and finally to a caller-supplied default
// so the UI never surfaces a raw "[object Object]" or an empty string.

export interface ApiErrorInfo {
  message: string;
  code?: string;
  details?: any;
  status?: number;
}

export function parseApiError(err: any, fallback: string): ApiErrorInfo {
  const data = err?.response?.data;
  const status = err?.response?.status;

  // Network / no response (e.g. phone can load the site but can't reach the API,
  // or a mixed-content block). Axios sets a code like ERR_NETWORK / ECONNABORTED.
  if (err && !err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || err.message === 'Network Error')) {
    return { message: fallback, code: err.code, status };
  }

  const message =
    (typeof data?.message === 'string' && data.message) ||
    (typeof data?.error === 'string' && data.error) ||
    (typeof data === 'string' && data) ||
    fallback;

  return { message, code: data?.code, details: data?.details, status };
}

/** Shorthand when you only need the string. */
export function getApiErrorMessage(err: any, fallback: string): string {
  return parseApiError(err, fallback).message;
}
