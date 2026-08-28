'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Check } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';
import type { OrderableMenuItem, CartEntry } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { cn } from '@/lib/utils';

const formatTRY = (n: number) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

export default function ItemCustomizeDialog({
  item,
  theme,
  open,
  onOpenChange,
  onAdd,
}: {
  item: OrderableMenuItem | null;
  theme: OrderTheme;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entry: CartEntry) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (item) {
      setSelected({});
      setQuantity(1);
    }
  }, [item]);

  const modifiers = item?.modifiers || [];

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

    onAdd({
      key: `${item.id}::${sortedIds.join(',')}`,
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      unitPriceEstimate: unitPrice,
      quantity,
      modifierOptionIds: optionIds,
      modifierSummary: names.join(', '),
    });
    onOpenChange(false);
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="sm:max-w-md" className="max-h-[85vh] overflow-y-auto p-0 gap-0">
        <div className="p-5">
          <DialogHeader>
            <DialogTitle className={cn('text-lg', theme.fontClass)} style={{ color: theme.text }}>{item.name}</DialogTitle>
            {item.description && (
              <DialogDescription className="text-sm mt-1" style={{ color: theme.muted }}>
                {item.description}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="mt-3 text-base font-semibold" style={{ color: theme.primary }}>
            {formatTRY(item.price)}
          </div>

          {modifiers.length > 0 && (
            <div className="mt-5 space-y-5">
              {modifiers.map((mod) => (
                <div key={mod.id}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-semibold" style={{ color: theme.text }}>{mod.name}</p>
                    <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: theme.muted }}>
                      {mod.isRequired ? t('publicOrder.item.required') : t('publicOrder.item.optional')}
                    </p>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {mod.options.map((opt) => {
                      const isChecked = (selected[mod.id] || []).includes(opt.id);
                      const disabled = !opt.isAvailable;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleOption(mod.id, opt.id, mod.maxChoices)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                            disabled && 'opacity-40 cursor-not-allowed'
                          )}
                          style={{
                            borderColor: isChecked ? theme.primary : theme.border,
                            backgroundColor: isChecked ? `${theme.primary}0d` : 'transparent',
                            color: theme.text,
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                              style={{ borderColor: isChecked ? theme.primary : theme.border, backgroundColor: isChecked ? theme.primary : 'transparent' }}
                            >
                              {isChecked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </span>
                            {opt.name}
                          </span>
                          {opt.priceAdjust !== 0 && (
                            <span style={{ color: theme.muted }}>
                              {opt.priceAdjust > 0 ? '+' : ''}{formatTRY(opt.priceAdjust)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: theme.text }}>{t('publicOrder.item.quantity')}</span>
            <div className="flex items-center gap-3 rounded-full border px-2 py-1" style={{ borderColor: theme.border }}>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:opacity-70"
                style={{ color: theme.text }}
                aria-label={t('publicOrder.item.decrease')}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-5 text-center text-sm font-semibold" style={{ color: theme.text }}>{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:opacity-70"
                style={{ color: theme.text }}
                aria-label={t('publicOrder.item.increase')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t p-4" style={{ borderColor: theme.border }}>
          <Button
            type="button"
            disabled={!allSatisfied}
            onClick={handleAdd}
            className="w-full h-11 text-sm font-bold text-white"
            style={{ backgroundColor: theme.primary }}
          >
            {t('publicOrder.item.addToCart')} · {formatTRY(unitPrice * quantity)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
