import i18next from 'i18next';
import en from '../locales/en.json';
import tr from '../locales/tr.json';

export const SUPPORTED_LANGUAGES = ['en', 'tr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Resources are bundled inline (instead of the async fs-backend) so i18n is
// ready *synchronously* the moment this module is imported. The previous
// fs-backend setup loaded translation files asynchronously and wasn't awaited
// before the server started listening, so the first request(s) after boot could
// respond with the raw i18n key (e.g. "errors.route_not_found") instead of a
// real message. The dictionaries are small — bundling them is simpler and
// race-free.
i18next.init({
  fallbackLng: 'en',
  lng: 'en',
  resources: {
    en: { translation: en },
    tr: { translation: tr },
  },
  interpolation: {
    escapeValue: false,
  },
});

/**
 * Normalize a raw `Accept-Language` header (e.g. "tr-TR,tr;q=0.9,en;q=0.8") to
 * one of our supported languages, defaulting to English.
 */
export const resolveLanguage = (header?: string): SupportedLanguage => {
  if (!header) return 'en';
  const primary = header.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(primary) ? (primary as SupportedLanguage) : 'en';
};

export default i18next;
