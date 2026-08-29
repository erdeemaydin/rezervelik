'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Minus, Plus, Check, X, Flame, Leaf, AlertTriangle, Wheat } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';
import type { OrderableMenuItem, CartEntry } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/currency';

const MAX_QUANTITY = 20;
const MAX_NOTE_LENGTH = 140;

/** "Vegan,Gluten-Free" — the MenuItem columns are free-text CSV. */
const splitTags = (value?: string | null): string[] =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export default function ItemCustomizeDialog({
  item,
  theme,
  currency,
  open,
  onOpenChange,
  onAdd,
}: {
  item: OrderableMenuItem | null;
  theme: OrderTheme;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entry: CartEntry) => void;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    // Keyed on `open` too, not just `item` — reopening the SAME menu item
    // (same object reference, since the menu list isn't refetched between
    // opens) after closing wouldn't otherwise re-fire this effect, leaving
    // the previous session's quantity/modifier selections stale.
    if (open && item) {
      setSelected({});
      setQuantity(1);
      setNote('');
    }
  }, [item, open]);

  const modifiers = useMemo(() => item?.modifiers || [], [item]);

  const optionAdjustTotal = useMemo(() => {
    if (!item) return 0;
    let sum = 0;
    for (const mod of modifiers) {
      for (const optId of selected[mod.id] || []) {
        const opt = mod.options.find((o) => o.id === optId);
        if (opt) sum += opt.priceAdjust;
      }
    }
    return sum;
  }, [item, modifiers, selected]);

  const unitPrice = (item?.price || 0) + optionAdjustTotal;

  const isModifierSatisfied = (modId: string): boolean => {
    const mod = modifiers.find((m) => m.id === modId);
    if (!mod) return true;
    const count = (selected[mod.id] || []).length;
    const min = mod.isRequired ? Math.max(1, mod.minChoices) : mod.minChoices;
    return count >= min;
  };

  const allSatisfied = modifiers.every((m) => isModifierSatisfied(m.id));

  const toggleOption = (modId: string, optId: string, maxChoices: number | null) => {
    setSelected((prev) => {
      const current = prev[modId] || [];
      const isSelected = current.includes(optId);
      const max = maxChoices ?? Infinity;

      if (max === 1) {
        // Single-choice modifier behaves like a radio group.
        return { ...prev, [modId]: isSelected ? [] : [optId] };
      }

      if (isSelected) {
        return { ...prev, [modId]: current.filter((id) => id !== optId) };
      }
      if (current.length >= max) return prev; // at cap, ignore extra taps
      return { ...prev, [modId]: [...current, optId] };
    });
  };

  /** Mirrors the backend's modifier rules (min/max/required) in the words a
   *  customer needs before they start tapping. */
  const modifierHint = (mod: OrderableMenuItem['modifiers'][number]): string => {
    const min = mod.isRequired ? Math.max(1, mod.minChoices) : mod.minChoices;
    const max = mod.maxChoices;
    if (max === 1) return t('publicOrder.item.chooseOne');
    if (max != null && min > 0) {
      return t('publicOrder.item.chooseBetween').replace('{{min}}', String(min)).replace('{{max}}', String(max));
    }
    if (max != null) return t('publicOrder.item.chooseUpTo').replace('{{max}}', String(max));
    if (min > 0) return t('publicOrder.item.chooseAtLeast').replace('{{min}}', String(min));
    return t('publicOrder.item.optional');
  };

  const handleAdd = () => {
    if (!item || !allSatisfied) return;

    const optionIds: string[] = [];
    const names: string[] = [];
    for (const mod of modifiers) {
      for (const optId of selected[mod.id] || []) {
        const opt = mod.options.find((o) => o.id === optId);
        if (opt) {
          optionIds.push(opt.id);
          names.push(opt.name);
        }
      }
    }
    const sortedIds = [...optionIds].sort();
    const trimmedNote = note.trim();

    onAdd({
      // The note is part of the identity of a cart line: two "same" pizzas
      // with different instructions must stay two lines, or merging them
      // would quietly drop one of the notes.
      key: `${item.menuItemId}::${sortedIds.join(',')}::${trimmedNote}`,
      menuItemId: item.menuItemId,
      name: item.name,
      imageUrl: item.imageUrl,
      unitPriceEstimate: unitPrice,
      quantity,
      modifierOptionIds: optionIds,
      modifierSummary: names.join(', '),
      note: trimmedNote || undefined,
    });
    onOpenChange(false);
  };

  if (!item) return null;

  const dietary = splitTags(item.dietaryTags);
  const allergens = splitTags(item.allergens);
  const spiceKey = item.spiceLevel > 0 ? `publicOrder.item.spice.${Math.min(3, item.spiceLevel)}` : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          'max-h-[92vh] gap-0 overflow-hidden rounded-t-3xl p-0 sm:mx-auto sm:max-w-lg sm:rounded-b-3xl',
          theme.fontClass
        )}
        style={{ backgroundColor: theme.surface }}
      >
        <div className="flex max-h-[92vh] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="relative">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" aria-hidden className="h-48 w-full object-cover" />
              ) : (
                <div className="h-24 w-full" style={{ background: theme.heroGradient }} />
              )}
              <SheetClose
                render={
                  <button
                    type="button"
                    aria-label={t('publicOrder.nav.close')}
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md backdrop-blur"
                  />
                }
              >
                <X className="h-4 w-4" />
              </SheetClose>
            </div>

            <div className="p-5">
              <SheetTitle className="text-lg font-black leading-tight" style={{ color: theme.text }}>
                {item.name}
              </SheetTitle>
              {item.description && (
                <p className="mt-1.5 text-sm leading-snug" style={{ color: theme.muted }}>
                  {item.description}
                </p>
              )}

              {(dietary.length > 0 || allergens.length > 0 || spiceKey || item.calories != null) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {dietary.map((tag) => (
                    <span
                      key={`d-${tag}`}
                      className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                    >
                      <Leaf className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                  {spiceKey && (
                    <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600">
                      <Flame className="h-3 w-3" />
                      {t(spiceKey)}
                    </span>
                  )}
                  {item.calories != null && (
                    <span
                      className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                      style={{ backgroundColor: theme.primaryTint, color: theme.primary }}
                    >
                      <Wheat className="h-3 w-3" />
                      {t('publicOrder.item.calories').replace('{{n}}', String(item.calories))}
                    </span>
                  )}
                  {allergens.length > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      {t('publicOrder.item.allergensPrefix')} {allergens.join(', ')}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-3 text-base font-black" style={{ color: theme.text }}>
                {formatPrice(item.price)}
              </div>

              {modifiers.length > 0 && (
                <div className="mt-6 space-y-6">
                  {modifiers.map((mod) => {
                    const unsatisfied = !isModifierSatisfied(mod.id);
                    return (
                      <div key={mod.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-bold" style={{ color: theme.text }}>
                            {mod.name}
                          </p>
                          <span
                            className={cn(
                              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                              mod.isRequired ? 'bg-amber-100 text-amber-700' : ''
                            )}
                            style={mod.isRequired ? undefined : { backgroundColor: theme.bg, color: theme.muted }}
                          >
                            {mod.isRequired ? t('publicOrder.item.required') : t('publicOrder.item.optional')}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs" style={{ color: unsatisfied && mod.isRequired ? '#b45309' : theme.muted }}>
                          {modifierHint(mod)}
                        </p>
                        <div className="mt-2.5 space-y-1.5">
                          {mod.options.map((opt) => {
                            const isChecked = (selected[mod.id] || []).includes(opt.id);
                            const disabled = !opt.isAvailable;
                            const single = mod.maxChoices === 1;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleOption(mod.id, opt.id, mod.maxChoices)}
                                role={single ? 'radio' : 'checkbox'}
                                aria-checked={isChecked}
                                className={cn(
                                  'flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-sm transition-colors',
                                  disabled && 'cursor-not-allowed opacity-40'
                                )}
                                style={{
                                  borderColor: isChecked ? theme.primary : theme.border,
                                  backgroundColor: isChecked ? theme.primaryTint : 'transparent',
                                  color: theme.text,
                                }}
                              >
                                <span className="flex min-w-0 items-center gap-2.5">
                                  <span
                                    className={cn(
                                      'flex h-5 w-5 shrink-0 items-center justify-center border',
                                      single ? 'rounded-full' : 'rounded-md'
                                    )}
                                    style={{
                                      borderColor: isChecked ? theme.primary : theme.border,
                                      backgroundColor: isChecked ? theme.primary : 'transparent',
                                    }}
                                  >
                                    {isChecked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                                  </span>
                                  <span className="truncate font-medium">{opt.name}</span>
                                </span>
                                {opt.priceAdjust !== 0 && (
                                  <span className="shrink-0 text-xs font-semibold" style={{ color: theme.muted }}>
                                    {opt.priceAdjust > 0 ? '+' : ''}
                                    {formatPrice(opt.priceAdjust)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6">
                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: theme.muted }}>
                  {t('publicOrder.item.noteLabel')}
                </label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                  placeholder={t('publicOrder.item.notePlaceholder')}
                  className="mt-1.5 min-h-[60px] text-sm"
                />
              </div>
            </div>
          </div>

          <div
            className="flex shrink-0 items-center gap-3 border-t p-4"
            style={{ borderColor: theme.border, backgroundColor: theme.surface }}
          >
            <div
              className="flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-1"
              style={{ borderColor: theme.border }}
            >
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:opacity-70 disabled:opacity-30"
                style={{ color: theme.text }}
                aria-label={t('publicOrder.item.decrease')}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-6 text-center text-sm font-black" style={{ color: theme.text }}>
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                disabled={quantity >= MAX_QUANTITY}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:opacity-70 disabled:opacity-30"
                style={{ color: theme.text }}
                aria-label={t('publicOrder.item.increase')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button
              type="button"
              disabled={!allSatisfied}
              onClick={handleAdd}
              className="h-12 flex-1 text-sm font-bold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              {t('publicOrder.item.addFor').replace('{{price}}', formatPrice(unitPrice * quantity))}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
