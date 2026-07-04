// Single source of truth for the auth token/session on the client.
//
// The backend authenticates purely from the `Authorization: Bearer` header
// (see src/middlewares/auth.ts): the token is never sent as a cookie, and the
// cookie we used before was JS-set (not httpOnly), so it gave no XSS/CSRF
// advantage over localStorage — the conventional storage for a Bearer-token
// SPA. localStorage is also far more reliable than JS cookies on iOS Safari,
// which silently drops them in Private Browsing / with "Block All Cookies".
//
// This module is intentionally framework-agnostic (no React/Zustand imports) so
// the axios interceptor can read the token without coupling to the store — that
// coupling was fragile under Fast Refresh. Layers, in priority order:
//   1. in-memory cache  — always correct for the lifetime of the tab, even when
//      the browser blocks all persistent storage (private mode with quota 0).
//   2. localStorage     — survives reloads/navigations.
//   3. legacy cookie    — read once so pre-migration sessions aren't logged out.
import Cookies from 'js-cookie';

const KEYS = {
  token: 'token',
  restaurantId: 'restaurantId',
  user: 'user',
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
    // localStorage unavailable — fall through to the legacy cookie.
  }
  return Cookies.get(KEYS[key]);
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
    Cookies.remove(KEYS[k]); // also clear any legacy cookie left from before the migration
  });
}
