'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MagnifyingGlass, ArrowElbowDownLeft } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/provider';

export interface CommandPaletteItem {
  name: string;
  href: string;
  icon: any;
  section: string;
}

interface CommandPaletteProps {
  items: CommandPaletteItem[];
}

// A flat two-level sidebar (section -> item) across 20+ routes has no way to
// jump directly to a route without knowing which section it's filed under —
// exactly the problem a few sections being ambiguously named or grouped
// creates. Cmd/Ctrl+K opens a searchable jump list over every route the
// current user can actually reach (the caller passes an already
// permission/feature-filtered list, same one the sidebar renders).
export function CommandPalette({ items }: CommandPaletteProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Dialog mounts its content async; wait a tick for the input to exist.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item =>
      item.name.toLowerCase().includes(q) || item.section.toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results.length, query]);

  const go = (item: CommandPaletteItem) => {
    setOpen(false);
    router.push(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) go(item);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        maxWidth="sm:max-w-xl"
        className="p-0 border-0 shadow-2xl overflow-hidden top-[20%] translate-y-0"
      >
        <DialogTitle className="sr-only">{t('commandPalette.title')}</DialogTitle>
        <div className="flex items-center gap-3 px-4 border-b border-slate-100">
          <MagnifyingGlass className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('commandPalette.placeholder')}
            className="w-full h-14 text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-block text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400 font-medium">{t('commandPalette.noResults')}</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.href}
                type="button"
                onClick={() => go(item)}
                onMouseEnter={() => setActiveIndex(i)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  i === activeIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                <item.icon className="w-4 h-4 shrink-0 text-slate-400" />
                <span className="flex-1 text-sm font-bold truncate">{item.name}</span>
                <span className="text-[10px] font-semibold text-slate-400 shrink-0">{item.section}</span>
                {i === activeIndex && <ArrowElbowDownLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
