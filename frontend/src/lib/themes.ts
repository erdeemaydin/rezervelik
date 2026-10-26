// Admin dashboard skins (AdminLTE-style).
//
// Each skin is applied by setting `data-admin-theme="<id>"` on the layout root
// (AdminLayout / SystemAdminLayout). The actual CSS custom properties and the
// remap of the app's hardcoded `blue-*` utility classes to the skin accent live
// in `frontend/src/app/globals.css`, keyed by that attribute. This file only
// holds the picker metadata (label + preview colors) so the settings UIs can
// render a miniature layout preview without duplicating the whole palette.
// Keep the preview colors in sync with the matching globals.css block.
//
// IMPORTANT: the set of ids here must stay in sync with:
//   - the `[data-admin-theme="…"]` blocks in globals.css
//   - the ALLOWED_THEMES whitelist in src/controllers/settingsController.ts
//     and src/controllers/systemController.ts (backend validation)

export interface AdminTheme {
  id: string;
  /** i18n key for the human-readable name, under `themes.*`. */
  labelKey: string;
  /** Preview colors for the picker's miniature layout. */
  swatch: {
    sidebar: string;
    brand: string;
    header: string;
    accent: string;
    bg: string;
  };
}

export const ADMIN_THEMES: AdminTheme[] = [
  {
    id: 'default',
    labelKey: 'themes.default',
    swatch: { sidebar: '#222d32', brand: '#195a91', header: '#1f6fb2', accent: '#3c8dbc', bg: '#ecf0f5' },
  },
  {
    id: 'terracotta',
    labelKey: 'themes.terracotta',
    swatch: { sidebar: '#2a211e', brand: '#9a3412', header: '#c2410c', accent: '#ea6a3a', bg: '#ecf0f5' },
  },
  {
    id: 'forest',
    labelKey: 'themes.forest',
    swatch: { sidebar: '#0f3b2a', brand: '#065f46', header: '#047857', accent: '#34d399', bg: '#ecf0f5' },
  },
  {
    id: 'burgundy',
    labelKey: 'themes.burgundy',
    swatch: { sidebar: '#4c0d24', brand: '#7a0e2c', header: '#9f1239', accent: '#fb7185', bg: '#ecf0f5' },
  },
  {
    id: 'amber',
    labelKey: 'themes.amber',
    swatch: { sidebar: '#1f1d1a', brand: '#d68910', header: '#f39c12', accent: '#f59e0b', bg: '#ecf0f5' },
  },
];

export const THEME_IDS = ADMIN_THEMES.map((t) => t.id);

/** Coerce any stored value to a valid theme id, falling back to 'default'. */
export const normalizeTheme = (value?: string | null): string =>
  value && THEME_IDS.includes(value) ? value : 'default';
