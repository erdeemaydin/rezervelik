'use client';

import React, { createContext, useContext, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';

type Translations = Record<string, any>;

interface I18nContextProps {
  t: (key: string) => string;
  locale: string;
  setLocale: (locale: string) => void;
}

const I18nContext = createContext<I18nContextProps>({
  t: (key) => key,
  locale: 'tr',
  setLocale: () => {},
});

export const I18nProvider = ({ 
  children, 
  initialLocale, 
  dictionary 
}: { 
  children: React.ReactNode; 
  initialLocale: string; 
  dictionary: Translations;
}) => {
  const [locale, setLocaleState] = useState(initialLocale);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const setLocale = (newLocale: string) => {
    Cookies.set('NEXT_LOCALE', newLocale, { path: '/', expires: 365 });
    setLocaleState(newLocale);
    startTransition(() => {
      router.refresh();
    });
  };

  const t = (key: string) => {
    const keys = key.split('.');
    let value: any = dictionary;
    
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
