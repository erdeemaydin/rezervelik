// Brand-token resolver for the single, consistent online-ordering checkout UI
// (r/[slug]/order). Per docs/packaging/online-ordering-plan.md §1h's
// 2026-08-28 correction: unlike r/[slug]/menu or r/[slug]/book, the ordering
// flow is NOT one of the 8 structural layout components — it's one
// well-designed flow that pulls the tenant's brand tokens (color, typography,
// logo) from FrontendCustomization and applies them, the way a Shopify
// checkout stays visually consistent while re-skinning colors/logo per
// merchant. This intentionally does not replicate each of the 8 layout
// files' full palette (dark lounge themes, editorial imagery, etc.) — those
// suit a marketing/menu page, not a trustworthy multi-step checkout, where a
// light, legible surface matters more than thematic drama.

import type { CSSProperties } from 'react';

export interface CustomizationLike {
  typography?: string | null;
  colorPalette?: string | null;
  primaryColor?: string | null;
}

export interface OrderTheme {
  fontClass: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primaryContrast: string;
  cssVars: CSSProperties;
}

interface PaletteBase {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
}

// Light, checkout-appropriate variants of each colorPalette enum value
// (FrontendCustomization.colorPalette: OBSIDIAN/PEARL/EARTH, plus CRIMSON/SAGE
// used by some layout components) — a gentle tonal nod to the tenant's
// brand family, not a full re-theme.
const PALETTES: Record<string, PaletteBase> = {
  OBSIDIAN: { bg: '#f8fafc', surface: '#ffffff', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', primary: '#0f172a' },
  PEARL: { bg: '#f6f8fa', surface: '#ffffff', border: '#e5e9ee', text: '#1f2937', muted: '#5b6472', primary: '#1e3a8a' },
  EARTH: { bg: '#fdfbf6', surface: '#ffffff', border: '#e7e0d4', text: '#292524', muted: '#78716c', primary: '#5c4033' },
  CRIMSON: { bg: '#fffaf9', surface: '#ffffff', border: '#f3d9d6', text: '#450a0a', muted: '#8a6a68', primary: '#7f1d1d' },
  SAGE: { bg: '#f6f8f4', surface: '#ffffff', border: '#dfe6d9', text: '#1f2a1c', muted: '#5c6b56', primary: '#4b6a4f' },
};

const DEFAULT_PRIMARY = '#0f172a'; // FrontendCustomization.primaryColor's own schema default

export function getOrderTheme(customization?: CustomizationLike | null): OrderTheme {
  const typography = customization?.typography || 'SANS';
  const fontClass = typography === 'SERIF' ? 'font-serif' : typography === 'MONO' ? 'font-mono' : 'font-sans';

  const paletteKey = customization?.colorPalette && PALETTES[customization.colorPalette] ? customization.colorPalette : 'OBSIDIAN';
  const base = PALETTES[paletteKey];

  // Same "is this still the untouched default?" check the 8 layout
  // components use before preferring a tenant's custom primaryColor.
  const rawPrimary = customization?.primaryColor;
  const primary = rawPrimary && rawPrimary !== DEFAULT_PRIMARY ? rawPrimary : base.primary;

  return {
    fontClass,
    bg: base.bg,
    surface: base.surface,
    border: base.border,
    text: base.text,
    muted: base.muted,
    primary,
    primaryContrast: '#ffffff',
    cssVars: {
      '--order-primary': primary,
      '--order-primary-hover': primary + 'e6',
      '--order-bg': base.bg,
      '--order-surface': base.surface,
      '--order-border': base.border,
      '--order-text': base.text,
      '--order-muted': base.muted,
    } as CSSProperties,
  };
}
