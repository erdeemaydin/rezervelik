import { create } from 'zustand';
import { normalizeTheme } from '@/lib/themes';
import { readAuth } from '@/lib/authStorage';

// Single source of truth for the active dashboard color theme — the value of the
// `data-admin-theme` attribute the layouts render. Both the persistent layout
// (AdminLayout / SystemAdminLayout) and the settings pages (live preview + save)
// read/write this ONE value, so the theme can no longer desync the way the old
// imperative `querySelectorAll('[data-admin-theme]').setAttribute(...)` writes
// did: React owns the attribute through the layout's render, and everything else
// just moves this store. A settings save that updates the store is instantly
// reflected everywhere without waiting for the layout to refetch.

// Seed from whichever cache exists so a hard refresh paints the right theme on the
// very first frame (no default/blue flash). Tenant surface caches the whole
// settings blob per restaurant; the system-admin surface caches just its theme id.
const readInitialTheme = (): string => {
  if (typeof window === 'undefined') return 'default';
  try {
    const rid = readAuth('restaurantId');
    if (rid) {
      const cached = JSON.parse(localStorage.getItem(`tenantSettingsCache:${rid}`) || 'null');
      if (cached?.dashboardTheme) return normalizeTheme(cached.dashboardTheme);
    }
    const sys = localStorage.getItem('systemDashboardTheme');
    if (sys) return normalizeTheme(sys);
  } catch { /* fall through to default */ }
  return 'default';
};

interface AdminThemeState {
  theme: string;
  setTheme: (theme: string | null | undefined) => void;
}

export const useAdminThemeStore = create<AdminThemeState>((set) => ({
  theme: readInitialTheme(),
  setTheme: (theme) => set({ theme: normalizeTheme(theme) }),
}));

// The tenant dashboard's saved theme, read from the per-restaurant settings cache.
// Used to restore the real theme when leaving the settings page after a preview.
export const readCachedTenantTheme = (): string => {
  if (typeof window === 'undefined') return 'default';
  try {
    const rid = readAuth('restaurantId');
    if (!rid) return 'default';
    const cached = JSON.parse(localStorage.getItem(`tenantSettingsCache:${rid}`) || 'null');
    return normalizeTheme(cached?.dashboardTheme);
  } catch {
    return 'default';
  }
};
