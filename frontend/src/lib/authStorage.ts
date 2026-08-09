// Non-sensitive session bookkeeping the SPA keeps client-side.
//
// The actual session credential (the JWT) is NOT stored here anymore — it
// lives in an httpOnly cookie the browser attaches automatically and
// JavaScript can never read (see src/utils/authCookie.ts on the backend, and
// lib/api.ts's `withCredentials: true`). That closes off the classic
// XSS-reads-localStorage token-theft vector. What's kept here is only the
// cached user profile (email/name/role — not a secret) so the UI can render
// instantly on reload without waiting on a round trip, plus a couple of tiny
// UI-state flags. The backend's cookie check remains the actual source of
// truth: if the cookie is missing/expired, the next API call 401s and the
// axios interceptor clears this cache and redirects to /auth/login.
//
// This module is intentionally framework-agnostic (no React/Zustand imports)
// so other modules can read it without coupling to the store — that coupling
// was fragile under Fast Refresh. Layers, in priority order:
//   1. in-memory cache — always correct for the lifetime of the tab, even when
//      the browser blocks all persistent storage (private mode with quota 0).
//   2. localStorage    — survives reloads/navigations.
import Cookies from 'js-cookie';

const KEYS = {
  restaurantId: 'restaurantId',
  user: 'user',
  // 'true' while a SUPER_ADMIN is impersonating a tenant — drives the
  // "Viewing as X — Return to Admin" banner. Not sensitive; the real
  // impersonation state (the stashed admin token) lives server-side in an
  // httpOnly cookie the SPA never reads.
  impersonating: 'impersonating',
} as const;

type Key = keyof typeof KEYS;

const memory: Partial<Record<Key, string>> = {};

const hasWindow = () => typeof window !== 'undefined';

export function readAuth(key: Key): string | undefined {
  if (memory[key] != null) return memory[key];
  if (!hasWindow()) return undefined;
  try {
    const value = window.localStorage.getItem(KEYS[key]);
    if (value != null) {
      memory[key] = value;
      return value;
    }
  } catch {
    // localStorage unavailable for this tab; nothing further to fall back to.
  }
  return undefined;
}

export function writeAuth(key: Key, value: string): void {
  memory[key] = value;
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(KEYS[key], value);
  } catch {
    // Persistent storage blocked; the in-memory cache still serves this tab.
  }
}

export function clearAuth(): void {
  (Object.keys(KEYS) as Key[]).forEach((k) => {
    delete memory[k];
    if (!hasWindow()) return;
    try {
      window.localStorage.removeItem(KEYS[k]);
    } catch {
      // ignore
    }
  });
  // Clear the legacy pre-httpOnly-migration token cookie, if a browser still
  // has one lying around from before this change shipped — it's inert now
  // (the backend no longer reads it), but no reason to leave it sitting there.
  if (hasWindow()) Cookies.remove('token');
}
