'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UtensilsCrossed, LogOut, RefreshCw, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/provider';
import { useAuthStore } from '@/store/useAuthStore';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { playOrderChime, ensureAudioContext } from '@/lib/orderChime';
import OrderCard from '@/components/orders/OrderCard';
import OrderPrintPortal, { PrintJob, PrintTemplateKind } from '@/components/orders/print/OrderPrintPortal';
import { useOrderStream } from '@/lib/orders/stream';
import { BOARD_STATUSES, OrderStatus, StaffOrder } from '@/lib/orders/types';
import { nextStatusFor, cancelStatusFor } from '@/lib/orders/statusRules';

// Full-screen standalone route for KITCHEN staff — outside AdminLayout/
// dashboard chrome (docs/packaging/online-ordering-plan.md §1e). Replaces the
// earlier "coming soon" placeholder with the real order-station board: SSE
// ticket feed, one-tap status advance, reject/cancel with reason, and
// printing (kitchen ticket / courier slip / customer receipt — see
// components/orders/print/). See useOrderStream.ts for why this can't use
// the native EventSource API against GET /api/orders/stream.
export default function OrderStationPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, logout, isAuthenticated } = useAuthStore();
  const [isMounted, setIsMounted] = useState(false);

  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [tick, setTick] = useState(0);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StaffOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [notPickedUpTarget, setNotPickedUpTarget] = useState<StaffOrder | null>(null);
  const [notPickedUpSubmitting, setNotPickedUpSubmitting] = useState(false);
  // Only used for the ⚠ no-show badge threshold; a failed fetch just means no
  // badges, never a broken board.
  const [noShowWarnThreshold, setNoShowWarnThreshold] = useState<number>(0);

  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isMounted, isAuthenticated, router]);

  // Unlocks the Web Audio API on the very first tap/click anywhere on the
  // page — browsers block audio playback until a user gesture happens, so
  // without this the first genuine new-order chime could be silently dropped.
  useEffect(() => {
    const unlock = () => ensureAudioContext();
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Re-render every 30s so each card's "Xm ago" label stays fresh without a
  // per-card timer.
  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const mergeOrder = useCallback((order: StaffOrder) => {
    setOrders((prev) => {
      const isActive = (BOARD_STATUSES as OrderStatus[]).includes(order.status);
      const exists = prev.some((o) => o.id === order.id);
      if (!isActive) {
        // Reached a terminal status (possibly from another device) — drop it
        // off this board.
        return exists ? prev.filter((o) => o.id !== order.id) : prev;
      }
      if (exists) return prev.map((o) => (o.id === order.id ? order : o));
      return [order, ...prev];
    });
  }, []);

  const fetchBoard = useCallback(async (isRetry = false) => {
    try {
      if (!isRetry) setLoading(true);
      const res = await api.get('/orders', { params: { status: BOARD_STATUSES.join(',') } });
      setOrders(res.data.data as StaffOrder[]);
    } catch (err) {
      console.error('[order-station] failed to load board', err);
      if (!isRetry) {
        toast.error(t('orderStation.loadFailed'));
        setTimeout(() => fetchBoard(true), 2000);
      }
    } finally {
      if (!isRetry) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isMounted || !isAuthenticated) return;
    fetchBoard();
    api
      .get('/orders/order-settings')
      .then((res) => setNoShowWarnThreshold(Number(res.data?.data?.noShowWarnThreshold) || 0))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, isAuthenticated]);

  const handleStreamEvent = useCallback((evt: { type: 'created' | 'status_changed'; order: StaffOrder }) => {
    mergeOrder(evt.order);
    if (evt.type === 'created' && !mutedRef.current) {
      playOrderChime();
    }
  }, [mergeOrder]);

  useOrderStream(handleStreamEvent, isMounted && isAuthenticated, setConnected);

  const columns = useMemo(() => {
    const grouped: Record<OrderStatus, StaffOrder[]> = {
      NEW: [], ACCEPTED: [], PREPARING: [], READY: [], OUT_FOR_DELIVERY: [], COMPLETED: [], CANCELLED: [], REJECTED: [], NOT_PICKED_UP: [],
    };
    for (const order of orders) {
      if ((BOARD_STATUSES as OrderStatus[]).includes(order.status)) {
        grouped[order.status].push(order);
      }
    }
    (Object.keys(grouped) as OrderStatus[]).forEach((status) => {
      grouped[status].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
    return grouped;
    // tick is intentionally not a real dependency of the grouping itself —
    // it's here so elapsed-time-driven overdue styling recomputes on the
    // same 30s cadence as the card labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, tick]);

  const handleAdvance = async (order: StaffOrder) => {
    const next = nextStatusFor(order);
    if (!next) return;
    const wasNew = order.status === 'NEW';
    try {
      const res = await api.patch(`/orders/${order.id}/status`, { status: next });
      const updated = res.data.data as StaffOrder;
      mergeOrder(updated);
      toast.success(t('orderStation.statusUpdated').replace('{number}', String(updated.orderNumber)).replace('{status}', t(`publicOrder.status.${next}`)));

      // "Kitchen has committed to making this" moment — auto-print per
      // docs/packaging/online-ordering-plan.md §1f: kitchen ticket for every
      // accepted order, plus the courier slip when it's a delivery order.
      if (wasNew && next === 'ACCEPTED') {
        const templates: PrintTemplateKind[] = ['kitchen'];
        if (updated.fulfillmentType === 'DELIVERY') templates.push('courier');
        setPrintJob({ order: updated, templates });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('orderStation.statusUpdateFailed'));
    }
  };

  const openCancelDialog = (order: StaffOrder) => {
    setCancelTarget(order);
    setCancelReason('');
  };

  const submitCancel = async () => {
    if (!cancelTarget) return;
    const status = cancelStatusFor(cancelTarget);
    setCancelSubmitting(true);
    try {
      const res = await api.patch(`/orders/${cancelTarget.id}/status`, { status, reason: cancelReason || undefined });
      mergeOrder(res.data.data as StaffOrder);
      setCancelTarget(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('orderStation.statusUpdateFailed'));
    } finally {
      setCancelSubmitting(false);
    }
  };

  // "The customer never came for it." Terminal, and it bumps the customer's
  // noShowCount server-side, so it goes through a confirm step — but no reason
  // is asked for: the status itself is the reason.
  const submitNotPickedUp = async () => {
    if (!notPickedUpTarget) return;
    setNotPickedUpSubmitting(true);
    try {
      const res = await api.patch(`/orders/${notPickedUpTarget.id}/status`, { status: 'NOT_PICKED_UP' });
      mergeOrder(res.data.data as StaffOrder);
      setNotPickedUpTarget(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || t('orderStation.statusUpdateFailed'));
    } finally {
      setNotPickedUpSubmitting(false);
    }
  };

  const handlePrint = (order: StaffOrder, kind: PrintTemplateKind) => {
    setPrintJob({ order, templates: [kind] });
  };

  if (!isMounted || !isAuthenticated) return null;

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  const columnDefs: { status: OrderStatus; accent: string }[] = [
    { status: 'NEW', accent: 'border-t-blue-500' },
    { status: 'ACCEPTED', accent: 'border-t-amber-500' },
    { status: 'PREPARING', accent: 'border-t-orange-500' },
    { status: 'READY', accent: 'border-t-emerald-500' },
    { status: 'OUT_FOR_DELIVERY', accent: 'border-t-purple-500' },
  ];

  return (
    <>
    <div className="flex h-[100dvh] flex-col bg-slate-100 print:hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 bg-slate-950 px-4 py-3 text-white shadow-lg">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-black uppercase tracking-tight">{t('orderStation.title')}</h1>
            {user && (
              <p className="truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {user.firstName} {user.lastName}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'hidden items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black uppercase tracking-wide sm:flex',
              connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
            )}
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 animate-pulse" />}
            {connected ? t('orderStation.connectionLive') : t('orderStation.connectionReconnecting')}
          </span>

          <Button
            onClick={() => setMuted((m) => !m)}
            variant="ghost"
            title={muted ? t('orderStation.soundOffTitle') : t('orderStation.soundOnTitle')}
            className="h-10 w-10 p-0 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>

          <Button
            onClick={() => fetchBoard()}
            variant="ghost"
            title={t('orderStation.refreshBtn')}
            className="h-10 w-10 p-0 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>

          <Button
            onClick={handleLogout}
            variant="ghost"
            title={t('orderStation.logout')}
            className="h-10 w-10 p-0 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex flex-1 min-h-0 gap-2 overflow-x-auto p-2">
        {columnDefs.map(({ status, accent }) => {
          const items = columns[status];
          return (
            <div key={status} className={cn('flex h-full w-[280px] shrink-0 flex-col rounded-lg border-t-4 bg-white/60 shadow-sm', accent)}>
              <div className="flex shrink-0 items-center justify-between px-3 py-2">
                <span className="text-xs font-black uppercase tracking-wide text-slate-700">{t(`orderStation.columns.${status}`)}</span>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-700">{items.length}</span>
              </div>
              <div className="flex-1 min-h-0 space-y-2 overflow-y-auto px-2 pb-2">
                {items.length === 0 ? (
                  <div className="mt-4 text-center text-[11px] font-bold uppercase tracking-wide text-slate-300">
                    {t('orderStation.emptyColumn')}
                  </div>
                ) : (
                  items.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      tick={tick}
                      noShowWarnThreshold={noShowWarnThreshold}
                      onAdvance={handleAdvance}
                      onCancel={openCancelDialog}
                      onNotPickedUp={setNotPickedUpTarget}
                      onPrint={handlePrint}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reject/Cancel reason dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {cancelTarget &&
                (cancelStatusFor(cancelTarget) === 'REJECTED'
                  ? t('orderStation.cancelDialog.rejectTitle').replace('{number}', String(cancelTarget.orderNumber))
                  : t('orderStation.cancelDialog.cancelTitle').replace('{number}', String(cancelTarget.orderNumber)))}
            </DialogTitle>
            <DialogDescription>{t('orderStation.cancelDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('orderStation.cancelDialog.reasonLabel')}
            </Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t('orderStation.cancelDialog.reasonPlaceholder')}
              className="min-h-[80px] text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              {t('orderStation.cancelDialog.closeBtn')}
            </Button>
            <Button
              onClick={submitCancel}
              disabled={cancelSubmitting}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {t('orderStation.cancelDialog.confirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Not-picked-up confirmation (no reason field — see submitNotPickedUp) */}
      <Dialog open={!!notPickedUpTarget} onOpenChange={(open) => !open && setNotPickedUpTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {notPickedUpTarget &&
                t('orderStation.notPickedUpDialog.title').replace('{number}', String(notPickedUpTarget.orderNumber))}
            </DialogTitle>
            <DialogDescription>{t('orderStation.notPickedUpDialog.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotPickedUpTarget(null)}>
              {t('orderStation.cancelDialog.closeBtn')}
            </Button>
            <Button
              onClick={submitNotPickedUp}
              disabled={notPickedUpSubmitting}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {t('orderStation.notPickedUpDialog.confirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    {/* Deliberately a sibling of the print:hidden board above, not nested
        inside it — Tailwind's print:hidden sets display:none on that whole
        subtree in @media print, which would take the print portal down with
        it if it were a descendant. */}
    <OrderPrintPortal job={printJob} onDone={() => setPrintJob(null)} />
    </>
  );
}
