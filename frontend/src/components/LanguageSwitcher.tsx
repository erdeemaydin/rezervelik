'use client';

import { useTranslation } from '@/i18n/provider';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// `triggerClassName` lets a host surface restyle the trigger — e.g. the admin
// top navbar, where the default muted-gray icon would be illegible on the
// skin color.
export function LanguageSwitcher({ triggerClassName }: { triggerClassName?: string } = {}) {
  const { locale, setLocale, t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("flex items-center justify-center h-8 w-8 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors", triggerClassName)}>
        <Globe className="h-4 w-4" />
        <span className="sr-only">{t('systemAdmin.language') || 'Language'}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32 bg-card rounded-md shadow-lg border border-border">
        <DropdownMenuItem 
          className={`text-xs cursor-pointer ${locale === 'tr' ? 'bg-muted font-bold' : ''}`}
          onClick={() => setLocale('tr', true)}
        >
          Türkçe
        </DropdownMenuItem>
        <DropdownMenuItem 
          className={`text-xs cursor-pointer ${locale === 'en' ? 'bg-muted font-bold' : ''}`}
          onClick={() => setLocale('en', true)}
        >
          English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
