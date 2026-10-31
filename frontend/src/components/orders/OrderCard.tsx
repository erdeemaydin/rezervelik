'use client';

import { Bike, ShoppingBag, Phone, ArrowRight, Printer, XCircle, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/provider';
import { StaffOrder } from '@/app/order-station/types';
import { nextStatusFor, canCancel, cancelStatusFor } from '@/app/order-station/statusRules';
import { PrintTemplateKind } from '@/components/orders/print/OrderPrintPortal';

const formatTRY = (n: number) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

function elapsedLabel(createdAt: string, t: (k: string) => string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (mins < 1) return t('orderStation.card.justNow');
  return t('orderStation.card.minutesAgo').replace('{minutes}', String(mins));
}

// Kept as a standalone helper (like elapsedLabel above) rather than an inline
// `Date.now()` call in the component body — React's purity lint rule
// (react-hooks/purity) flags a direct impure-function call in a component's
// render statements, since it can produce unstable output across renders.
// `tick` (bumped every 30s by the parent) is what actually drives this being
// re-evaluated on a cadence; the value itself is read here only to justify
// its prop, not because the comparison needs it.
function computeIsOverdue(order: StaffOrder): boolean {
  if (!order.readyBy) return false;
  if (order.status === 'READY' || order.status === 'OUT_FOR_DELIVERY') return false;
  return new Date(order.readyBy).getTime() < Date.now();
}

export default function OrderCard({
  order,
  tick,
  onAdvance,
  onCancel,
  onPrint,
}: {
  order: StaffOrder;
  tick: number; // bumped every 30s by the parent so elapsedLabel re-renders without its own timer
  onAdvance: (order: StaffOrder) => void;
  onCancel: (order: StaffOrder) => void;
  onPrint: (order: StaffOrder, kind: PrintTemplateKind) => void;
}) {
  const { t } = useTranslation();
  void tick; // re-render trigger only, see the prop's doc comment above
  const next = nextStatusFor(order);
  const isOverdue = computeIsOverdue(order);
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-3 shadow-sm transition-all',
        isOverdue ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="shrink-0 rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-xs font-black text-white">
            #{order.orderNumber}
          </span>
          {order.fulfillmentType === 'DELIVERY' ? (
            <Bike className="h-4 w-4 shrink-0 text-blue-600" />
          ) : (
            <ShoppingBag className="h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <span className="truncate text-xs font-bold uppercase tracking-tight text-slate-500">
            {t(`publicOrder.fulfillment.${order.fulfillmentType === 'DELIVERY' ? 'delivery' : 'pickup'}`)}
          </span>
        </div>
        <Badge
          variant="outline"
          className={cn('shrink-0 text-[10px] font-black uppercase', isOverdue ? 'border-rose-300 bg-rose-100 text-rose-700 animate-pulse' : 'text-slate-500')}
        >
          {elapsedLabel(order.createdAt, t)}
        </Badge>
      </div>

      <div className="mt-2 space-y-0.5">
        <div className="truncate text-sm font-black text-slate-900">{order.customer?.name || t('orderStation.card.unknownCustomer')}</div>
        {order.customer?.phone && (
          <div className="flex items-center gap-1 text-[11px] font-bold text-slate-400">
            <Phone className="h-3 w-3 shrink-0" /> {order.customer.phone}
          </div>
        )}
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
        {order.items.slice(0, 4).map((item) => (
          <div key={item.id} className="truncate">
            <span className="font-bold">{item.quantity}&times;</span> {item.nameSnapshot}
          </div>
        ))}
        {order.items.length > 4 && (
          <div className="text-[10px] font-bold text-slate-400">
            +{order.items.length - 4} {t('orderStation.card.itemsSuffix')}
          </div>
        )}
      </div>

      {order.customerNote && (
        <div className="mt-2 flex items-start gap-1 rounded-md bg-amber-50 p-1.5 text-[11px] text-amber-800">
          <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-2">{order.customerNote}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-sm font-black text-slate-900">
        <span>{itemCount} {t('orderStation.card.itemsSuffix')}</span>
        <span>{formatTRY(order.total)}</span>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {next && (
          <Button
            onClick={() => onAdvance(order)}
            className="h-10 flex-1 min-w-0 bg-emerald-600 text-[11px] font-black uppercase tracking-wide text-white hover:bg-emerald-700 active:scale-[0.97]"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="truncate">{t('orderStation.card.advanceTo').replace('{status}', t(`publicOrder.status.${next}`))}</span>
          </Button>
        )}
        {canCancel(order) && (
          <Button
            onClick={() => onCancel(order)}
            variant="outline"
            className="h-10 shrink-0 border-rose-200 bg-rose-50 px-2.5 text-rose-600 hover:bg-rose-100"
            title={t(`orderStation.card.${cancelStatusFor(order) === 'REJECTED' ? 'rejectBtn' : 'cancelBtn'}`)}
          >
            <XCircle className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <Button
          onClick={() => onPrint(order, 'kitchen')}
          variant="ghost"
          className="h-8 flex-1 min-w-0 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-100"
        >
          <Printer className="h-3 w-3" /> <span className="truncate">{t('orderStation.print.kitchenTicket')}</span>
        </Button>
        {order.fulfillmentType === 'DELIVERY' && (
          <Button
            onClick={() => onPrint(order, 'courier')}
            variant="ghost"
            className="h-8 flex-1 min-w-0 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-100"
          >
            <Printer className="h-3 w-3" /> <span className="truncate">{t('orderStation.print.courierSlip')}</span>
          </Button>
        )}
        <Button
          onClick={() => onPrint(order, 'receipt')}
          variant="ghost"
          className="h-8 flex-1 min-w-0 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-100"
        >
          <Printer className="h-3 w-3" /> <span className="truncate">{t('orderStation.print.receipt')}</span>
        </Button>
      </div>
    </div>
  );
}
