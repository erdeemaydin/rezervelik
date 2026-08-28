'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, RotateCcw, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';
import { fetchMyOrders, type OrderRecord } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { formatMoney } from '@/lib/currency';

const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED'];
const POLL_MS = 15000;

export default function OrderPlacedView({
  theme,
  currency,
  restaurantId,
  order,
  onOrderAgain,
  onViewHistory,
}: {
  theme: OrderTheme;
  currency: string;
  restaurantId: string;
  order: OrderRecord;
  onOrderAgain: () => void;
  onViewHistory: () => void;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const [current, setCurrent] = useState<OrderRecord>(order);

  useEffect(() => {
    if (TERMINAL_STATUSES.includes(current.status)) return;
    const interval = setInterval(async () => {
      try {
        const orders = await fetchMyOrders(restaurantId);
        const match = orders.find((o) => o.id === order.id);
        if (match) setCurrent(match);
      } catch {
        // Silent — a missed poll tick just tries again next interval.
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [current.status, restaurantId, order.id]);

  const statusLabel = t(`publicOrder.status.${current.status}`);

  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: `${theme.primary}14`, color: theme.primary }}>
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-black" style={{ color: theme.text }}>{t('publicOrder.placed.title')}</h2>
      <p className="mt-1 text-sm" style={{ color: theme.muted }}>
        {t('publicOrder.placed.orderNumberPrefix')} #{current.orderNumber}
      </p>

      <div className="mt-6 w-full max-w-sm rounded-xl border p-4 text-left" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wide" style={{ color: theme.muted }}>{t('publicOrder.placed.statusLabel')}</span>
          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: `${theme.primary}14`, color: theme.primary }}>
            {statusLabel}
          </span>
        </div>
        {current.readyBy && (
          <div className="mt-3 flex items-center gap-2 text-sm" style={{ color: theme.muted }}>
            <Clock className="h-4 w-4" />
            {t('publicOrder.placed.readyByPrefix')} {new Date(current.readyBy).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between text-sm font-bold" style={{ color: theme.text }}>
          <span>{t('publicOrder.quote.total')}</span>
          <span>{formatPrice(current.total)}</span>
        </div>
      </div>

      <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
        <Button type="button" onClick={onViewHistory} variant="outline" className="h-11 w-full text-sm font-semibold">
          <History className="h-4 w-4" /> {t('publicOrder.placed.viewHistoryButton')}
        </Button>
        <Button type="button" onClick={onOrderAgain} className="h-11 w-full text-sm font-bold text-white" style={{ backgroundColor: theme.primary }}>
          <RotateCcw className="h-4 w-4" /> {t('publicOrder.placed.orderAgainButton')}
        </Button>
      </div>
    </div>
  );
}
