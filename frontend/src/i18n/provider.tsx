'use client';

import React, { createContext, useContext, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

import tr from './locales/tr.json';
import en from './locales/en.json';

type Translations = Record<string, any>;

const dictionaries: Record<string, Translations> = {
  tr,
  en,
};

interface I18nContextProps {
  t: (key: string) => string;
  locale: string;
  // `explicit` marks a deliberate user choice (e.g. the LanguageSwitcher) so it
  // can win over the tenant's default language. Programmatic calls that merely
  // apply a default (AdminLayout) must leave it false.
  setLocale: (locale: string, explicit?: boolean) => void;
}

const I18nContext = createContext<I18nContextProps>({
  t: (key) => key,
  locale: 'tr',
  setLocale: () => {},
});

export const I18nProvider = ({ 
  children
}: { 
  children: React.ReactNode; 
}) => {
  const [locale, setLocaleState] = useState('tr');
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    const savedLocale = Cookies.get('NEXT_LOCALE') || 'tr';
    setLocaleState(savedLocale);
    setMounted(true);
  }, []);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const setLocale = (newLocale: string, explicit = false) => {
    Cookies.set('NEXT_LOCALE', newLocale, { path: '/', expires: 365 });
    // Remember that the user picked a language themselves. The proxy auto-sets
    // NEXT_LOCALE from Accept-Language, so that cookie alone can't tell an
    // explicit choice apart from a negotiated default — this marker can.
    if (explicit) {
      Cookies.set('NEXT_LOCALE_EXPLICIT', '1', { path: '/', expires: 365 });
    }
    setLocaleState(newLocale);
    startTransition(() => {
      router.refresh();
    });
  };

  const t = (key: string) => {
    const keys = key.split('.');
    let value: any = dictionaries[locale] || dictionaries['tr'];
    
    for (const k of keys) {
      if (value === undefined || value === null) break;
      value = value[k];
    }
    
    return typeof value === 'string' ? value : key;
  };

  return (
    <I18nContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => useContext(I18nContext);
