export type Locale = 'tr' | 'en';

export const i18n = {
  defaultLocale: 'tr' as Locale,
  locales: ['tr', 'en'] as Locale[],
};

export const dictionaries = {
  tr: () => import('./locales/tr.json').then((module) => module.default),
  en: () => import('./locales/en.json').then((module) => module.default),
};

export const getDictionary = async (locale: Locale) => {
  return dictionaries[locale]?.() ?? dictionaries.tr();
};
