// Admin dashboard color themes.
//
// Each theme is applied by setting `data-admin-theme="<id>"` on the layout root
// (AdminLayout / SystemAdminLayout). The actual CSS custom properties and the
// remap of the app's hardcoded `blue-*` utility classes to the theme accent live
// in `frontend/src/app/globals.css`, keyed by that attribute. This file only
// holds the picker metadata (label + swatches) so the settings UIs can render a
// preview without duplicating the whole palette.
//
// IMPORTANT: the set of ids here must stay in sync with:
//   - the `[data-admin-theme="…"]` blocks in globals.css
//   - the ALLOWED_THEMES whitelist in src/controllers/settingsController.ts
//     and src/controllers/systemController.ts (backend validation)

export interface AdminTheme {
  id: string;
  /** i18n key for the human-readable name, under `themes.*`. */
  labelKey: string;
  /** Preview swatches for the picker card. */
  swatch: {
    sidebar: string;
    accent: string;
    bg: string;
  };
}

export const ADMIN_THEMES: AdminTheme[] = [
  {
    id: 'default',
    labelKey: 'themes.default',
    swatch: { sidebar: '#0f172a', accent: '#2563eb', bg: '#f8fafc' },
  },
  {
    id: 'terracotta',
    labelKey: 'themes.terracotta',
    swatch: { sidebar: '#292524', accent: '#c2410c', bg: '#faf7f2' },
  },
  {
    id: 'forest',
    labelKey: 'themes.forest',
    swatch: { sidebar: '#1c1917', accent: '#15803d', bg: '#f5f5f4' },
  },
  {
    id: 'burgundy',
    labelKey: 'themes.burgundy',
    swatch: { sidebar: '#1c1917', accent: '#9f1239', bg: '#f7f5f4' },
  },
  {
    id: 'amber',
    labelKey: 'themes.amber',
    swatch: { sidebar: '#1c1917', accent: '#b45309', bg: '#faf9f7' },
  },
];

export const THEME_IDS = ADMIN_THEMES.map((t) => t.id);

/** Coerce any stored value to a valid theme id, falling back to 'default'. */
export const normalizeTheme = (value?: string | null): string =>
  value && THEME_IDS.includes(value) ? value : 'default';
