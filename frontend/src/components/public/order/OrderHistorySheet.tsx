'use client';

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, PackageOpen } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';
import { fetchMyOrders, type OrderRecord } from '@/lib/orderApi';
import type { OrderTheme } from '@/lib/orderTheme';
import PhoneIdentify from './PhoneIdentify';

const formatTRY = (n: number) => n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });

export default function OrderHistorySheet({
  theme,
  restaurantId,
  open,
  onOpenChange,
  authed,
  onIdentified,
}: {
  theme: OrderTheme;
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authed: boolean;
  onIdentified: (customer: { id: string; name: string; phone: string }) => void;
}) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<OrderRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !authed) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await fetchMyOrders(restaurantId);
        if (!cancelled) setOrders(data);
      } catch {
        if (!cancelled) setOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authed, restaurantId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" style={{ backgroundColor: theme.bg }}>
        <SheetHeader>
          <SheetTitle style={{ color: theme.text }} className={theme.fontClass}>{t('publicOrder.history.title')}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {!authed ? (
            <PhoneIdentify restaurantId={restaurantId} theme={theme} onIdentified={onIdentified} />
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.muted }} />
            </div>
          ) : !orders || orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: theme.muted }}>
              <PackageOpen className="h-8 w-8" />
              <p className="text-sm">{t('publicOrder.history.empty')}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {orders.map((order) => (
                <div key={order.id} className="rounded-xl border p-3" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: theme.text }}>#{order.orderNumber}</span>
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: `${theme.primary}14`, color: theme.primary }}>
                      {t(`publicOrder.status.${order.status}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: theme.muted }}>
                    {new Date(order.createdAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: theme.muted }}>
                    {order.items.map((it) => `${it.quantity}× ${it.nameSnapshot}`).join(', ')}
                  </p>
                  <p className="mt-1.5 text-sm font-bold" style={{ color: theme.text }}>{formatTRY(order.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
