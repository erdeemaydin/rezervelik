'use client';

// Live order tracking. Two things separate this from a status label:
//
//  * `NEW` is not a step on the track — with `autoConfirmOrders` off (A4) the
//    order sits there until a human at the restaurant accepts or rejects it,
//    so it gets its own "waiting to be confirmed" state rather than a dot the
//    customer might read as "on its way".
//  * the remaining journey differs between delivery and pickup, so the
//    timeline comes from orderStatusFlow rather than being hardcoded here.

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, RotateCcw, History, Hourglass, XCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/provider';
import { fetchMyOrders, type OrderRecord } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import { formatMoney } from '@/lib/currency';
import { isTerminalOrderStatus, isUnhappyOrderStatus, orderTimelineIndex, orderTimelineSteps } from '@/lib/orderStatusFlow';
import { cn } from '@/lib/utils';

const POLL_MS = 20000;

export default function OrderPlacedView({
  theme,
  currency,
  restaurantId,
  restaurantName,
  order,
  onOrderAgain,
  onViewHistory,
}: {
  theme: OrderTheme;
  currency: string;
  restaurantId: string;
  restaurantName: string;
  order: OrderRecord;
  onOrderAgain: () => void;
  onViewHistory: () => void;
}) {
  const { t, locale } = useTranslation();
  const formatPrice = (n: number) => formatMoney(n, currency, locale);
  const [current, setCurrent] = useState<OrderRecord>(order);

  useEffect(() => {
    if (isTerminalOrderStatus(current.status)) return;
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

  const pending = current.status === 'NEW';
  const unhappy = isUnhappyOrderStatus(current.status);
  const steps = orderTimelineSteps(current.fulfillmentType);
  const activeIndex = orderTimelineIndex(current.status, current.fulfillmentType);
  const timeFormat = locale === 'tr' ? 'tr-TR' : 'en-US';
  const cardStyle = { backgroundColor: theme.surface, boxShadow: theme.shadow };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="flex flex-col items-center text-center">
        <div
          className={cn('mb-4 flex h-16 w-16 items-center justify-center rounded-full', pending && 'animate-pulse')}
          style={
            unhappy
              ? { backgroundColor: '#fef2f2', color: '#dc2626' }
              : { backgroundColor: theme.primaryTint, color: theme.primary }
          }
        >
          {unhappy ? (
            <XCircle className="h-8 w-8" />
          ) : pending ? (
            <Hourglass className="h-8 w-8" />
          ) : (
            <CheckCircle2 className="h-8 w-8" />
          )}
        </div>
        <h2 className="text-xl font-black" style={{ color: theme.text }}>
          {unhappy
            ? t(`publicOrder.placed.terminal.${current.status}.title`)
            : pending
              ? t('publicOrder.placed.pendingTitle')
              : t('publicOrder.placed.title')}
        </h2>
        <p className="mt-1 text-sm" style={{ color: theme.muted }}>
          {t('publicOrder.placed.orderNumberPrefix')} #{current.orderNumber}
        </p>
      </div>

      {pending && (
        <div className="mt-5 rounded-2xl border-2 p-4 text-center" style={{ borderColor: theme.primary, backgroundColor: theme.primaryTint }}>
          <p className="flex items-center justify-center gap-2 text-sm font-black" style={{ color: theme.primary }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('publicOrder.placed.pendingBanner').replace('{{restaurant}}', restaurantName)}
          </p>
          <p className="mt-1.5 text-xs leading-snug" style={{ color: theme.text }}>
            {t('publicOrder.placed.pendingDescription')}
          </p>
        </div>
      )}

      {unhappy && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
          {t(`publicOrder.placed.terminal.${current.status}.description`)}
        </div>
      )}

      {!pending && !unhappy && (
        <div className="mt-5 rounded-2xl p-4" style={cardStyle}>
          <h3 className="mb-3 text-xs font-black uppercase tracking-wide" style={{ color: theme.muted }}>
            {t('publicOrder.placed.timelineTitle')}
          </h3>
          <ol className="space-y-0">
            {steps.map((step, index) => {
              const done = index < activeIndex;
              const isCurrent = index === activeIndex;
              const reached = done || isCurrent;
              const isLast = index === steps.length - 1;
              return (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: reached ? theme.primary : theme.border,
                        color: theme.primaryContrast,
                        boxShadow: isCurrent ? `0 0 0 4px ${theme.primaryTint}` : undefined,
                      }}
                    >
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    {!isLast && <span className="h-8 w-0.5" style={{ backgroundColor: done ? theme.primary : theme.border }} />}
                  </div>
                  <div className={cn('pb-2', isLast && 'pb-0')}>
                    <p className="text-sm font-bold leading-6" style={{ color: reached ? theme.text : theme.muted }}>
                      {t(`publicOrder.status.${step}`)}
                    </p>
                    {isCurrent && (
                      <p className="text-xs" style={{ color: theme.muted }}>
                        {t('publicOrder.placed.currentStep')}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <div className="mt-4 rounded-2xl p-4" style={cardStyle}>
        {!pending && current.readyBy && (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2" style={{ color: theme.muted }}>
              <Clock className="h-4 w-4" />
              {current.fulfillmentType === 'DELIVERY' ? t('publicOrder.placed.etaPrefix') : t('publicOrder.placed.readyByPrefix')}
            </span>
            <span className="font-bold" style={{ color: theme.text }}>
              {new Date(current.readyBy).toLocaleTimeString(timeFormat, { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between text-sm font-black" style={{ color: theme.text }}>
          <span>{t('publicOrder.quote.total')}</span>
          <span>{formatPrice(current.total)}</span>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: theme.muted }}>
          {isTerminalOrderStatus(current.status) ? t('publicOrder.placed.trackingStopped') : t('publicOrder.placed.trackingLive')}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Button type="button" onClick={onViewHistory} variant="outline" className="h-11 w-full text-sm font-semibold">
          <History className="h-4 w-4" /> {t('publicOrder.placed.viewHistoryButton')}
        </Button>
        <Button
          type="button"
          onClick={onOrderAgain}
          className="h-11 w-full text-sm font-bold text-white"
          style={{ backgroundColor: theme.primary }}
        >
          <RotateCcw className="h-4 w-4" /> {t('publicOrder.placed.orderAgainButton')}
        </Button>
      </div>
    </div>
  );
}
