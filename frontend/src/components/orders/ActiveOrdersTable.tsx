'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertTriangle, Ban, Check, ChevronRight, PackageX, RefreshCw, Wifi, WifiOff, X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/apiError';
import { useTranslation } from '@/i18n/provider';
import { useOrderStream } from '@/lib/orders/stream';
import { BOARD_STATUSES, OrderStatus, StaffOrder } from '@/lib/orders/types';
import { nextStatusFor, canMarkNotPickedUp } from '@/lib/orders/statusRules';
import { orderStatusBadgeClass, elapsedSince } from '@/lib/orders/badges';

// The dashboard counterpart to /order-station: same live feed, but a dense
// table for a manager watching the floor rather than a touch board for the
// kitchen. Both read GET /api/orders?status=<active> once and then stay live
// off GET /api/orders/stream (see lib/orders/stream.ts for why the native
// EventSource can't be used).
//
// Everything the row can do is an explicit inline button — a manager confirming
// a queue of new orders shouldn't have to open a menu per row — and every
// transition offered here is one the backend's FORWARD_TRANSITIONS actually
// accepts (lib/orders/statusRules.ts mirrors it), with the server still the
// only authority.

interface ReasonTarget {
  order: StaffOrder;
  status: 'REJECTED' | 'CANCELLED';
}

export default function ActiveOrdersTable({
  active,
  formatPrice,
  autoConfirmOrders,
  noShowWarnThreshold,
  onSelectOrder,
}: {
  /** Whether the Active tab is the one on screen. Gates both the initial fetch
   *  and the SSE connection so a manager sitting on the Customers tab isn't
   *  holding an open stream. (Base UI's TabsPanel unmounts a hidden panel by
   *  default, so today this is belt-and-braces — but it's what keeps the
   *  behaviour correct if the panel is ever given `keepMounted`.) */
  active: boolean;
  formatPrice: (price: number) => string;
  /** When the tenant auto-confirms, orders are created ACCEPTED and a Confirm
   *  button would never be the right thing to show. */
  autoConfirmOrders: boolean;
  /** OrderSettings.noShowWarnThreshold; 0 disables the ⚠ badge entirely. */
  noShowWarnThreshold: number;
  onSelectOrder: (order: StaffOrder) => void;
}) {
  const { t } = useTranslation();

  const [orders, setOrders] = useState<StaffOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reasonTarget, setReasonTarget] = useState<ReasonTarget | null>(null);
  const [reason, setReason] = useState('');
  const [reasonSubmitting, setReasonSubmitting] = useState(false);
  const [notPickedUpTarget, setNotPickedUpTarget] = useState<StaffOrder | null>(null);
  const [notPickedUpSubmitting, setNotPickedUpSubmitting] = useState(false);

  const fetchActive = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/orders', { params: { status: BOARD_STATUSES.join(',') } });
      setOrders(res.data.data as StaffOrder[]);
      setLoadedOnce(true);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('orders.errors.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!active || loadedOnce) return;
    fetchActive();
  }, [active, loadedOnce, fetchActive]);

  // "3m ago" stays honest without a timer per row.
  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(interval);
  }, [active]);

  const mergeOrder = useCallback((order: StaffOrder) => {
    setOrders((prev) => {
      const stillActive = (BOARD_STATUSES as OrderStatus[]).includes(order.status);
      const exists = prev.some((o) => o.id === order.id);
      // Reached a terminal status — here, on the kitchen board, or on another
      // manager's screen — so it leaves the active list either way.
      if (!stillActive) return exists ? prev.filter((o) => o.id !== order.id) : prev;
      if (exists) return prev.map((o) => (o.id === order.id ? order : o));
      return [order, ...prev];
    });
  }, []);

  const handleStreamEvent = useCallback(
    (evt: { type: 'created' | 'status_changed'; order: StaffOrder }) => mergeOrder(evt.order),
    [mergeOrder]
  );

  useOrderStream(handleStreamEvent, active, setConnected);

  const rows = useMemo(() => {
    // Newest first: the top of this table is where a manager looks for the
    // order that just came in and needs confirming.
    return [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // `tick` only exists here so the age column re-renders on the 30s cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, tick]);

  const pendingCount = useMemo(() => orders.filter((o) => o.status === 'NEW').length, [orders]);

  /** Every status write goes through here so the 409 contract is handled in
   *  exactly one place: someone else already moved this order, so our copy is
   *  stale — refetch rather than retrying a transition that is no longer legal. */
  const patchStatus = async (order: StaffOrder, status: OrderStatus, statusReason?: string) => {
    setBusyId(order.id);
    try {
      const res = await api.patch(`/orders/${order.id}/status`, {
        status,
        ...(statusReason ? { reason: statusReason } : {}),
      });
      const updated = res.data.data as StaffOrder;
      mergeOrder(updated);
      toast.success(
        t('orders.active.statusUpdated')
          .replace('{number}', String(updated.orderNumber))
          .replace('{status}', t(`orders.status.${updated.status}`))
      );
      return true;
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(t('orders.active.conflict'));
        fetchActive();
        return false;
      }
      toast.error(getApiErrorMessage(err, t('orders.active.statusUpdateFailed')));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openReasonDialog = (order: StaffOrder, status: 'REJECTED' | 'CANCELLED') => {
    setReason('');
    setReasonTarget({ order, status });
  };

  const submitReason = async () => {
    if (!reasonTarget) return;
    setReasonSubmitting(true);
    const ok = await patchStatus(reasonTarget.order, reasonTarget.status, reason.trim() || undefined);
    setReasonSubmitting(false);
    if (ok) setReasonTarget(null);
  };

  const submitNotPickedUp = async () => {
    if (!notPickedUpTarget) return;
    setNotPickedUpSubmitting(true);
    const ok = await patchStatus(notPickedUpTarget, 'NOT_PICKED_UP');
    setNotPickedUpSubmitting(false);
    if (ok) setNotPickedUpTarget(null);
  };

  const advanceLabel = (target: OrderStatus) => t(`orders.active.advanceTo.${target}`);

  const renderActions = (order: StaffOrder) => {
    const busy = busyId === order.id;
    const next = nextStatusFor(order);
    const isNew = order.status === 'NEW';

    return (
      // Actions live inside the clickable row, so every button swallows the
      // click — otherwise confirming an order would also pop the detail dialog.
      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {isNew ? (
          <>
            {/* With auto-confirm on, nothing should ever sit in NEW; if one
                does (settings flipped mid-service) confirming it by hand is
                misleading, so only the reject path is offered. */}
            {!autoConfirmOrders && next && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => patchStatus(order, next)}
                className="h-7 bg-blue-600 px-2.5 text-[10px] font-black uppercase text-white shadow-none hover:bg-blue-700"
              >
                <Check className="mr-1 h-3 w-3" /> {t('orders.active.confirmBtn')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => openReasonDialog(order, 'REJECTED')}
              className="h-7 border-rose-200 bg-white px-2.5 text-[10px] font-black uppercase text-rose-600 shadow-none hover:bg-rose-50"
            >
              <X className="mr-1 h-3 w-3" /> {t('orders.active.rejectBtn')}
            </Button>
          </>
        ) : (
          <>
            {next && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => patchStatus(order, next)}
                className="h-7 bg-slate-900 px-2.5 text-[10px] font-black uppercase text-white shadow-none hover:bg-slate-700"
              >
                {advanceLabel(next)} <ChevronRight className="ml-0.5 h-3 w-3" />
              </Button>
            )}
            {canMarkNotPickedUp(order) && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setNotPickedUpTarget(order)}
                className="h-7 border-orange-200 bg-white px-2.5 text-[10px] font-black uppercase text-orange-600 shadow-none hover:bg-orange-50"
              >
                <PackageX className="mr-1 h-3 w-3" /> {t('orders.active.notPickedUpBtn')}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => openReasonDialog(order, 'CANCELLED')}
              className="h-7 border-slate-200 bg-white px-2.5 text-[10px] font-black uppercase text-slate-500 shadow-none hover:bg-slate-50"
            >
              {t('orders.active.cancelBtn')}
            </Button>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <Card className="rounded-md border-slate-200 bg-white shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-700">
              {t('orders.active.heading')}
            </span>
            <Badge variant="outline" className="border-slate-200 bg-white text-[9px] font-black text-slate-600 shadow-none">
              {String(orders.length)}
            </Badge>
            {pendingCount > 0 && (
              <Badge className="border-0 bg-amber-100 text-[9px] font-black uppercase text-amber-700 shadow-none">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {String(pendingCount)} {t('orders.active.awaitingSuffix')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-wide',
                connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              )}
            >
              {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 animate-pulse" />}
              {connected ? t('orders.active.liveConnected') : t('orders.active.reconnecting')}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchActive}
              className="h-7 border-slate-200 bg-white px-2.5 text-[10px] font-black uppercase text-slate-500 shadow-none"
            >
              <RefreshCw className={cn('mr-1 h-3 w-3', loading && 'animate-spin')} /> {t('orders.active.refreshBtn')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="h-10 border-b border-slate-200 hover:bg-transparent">
                <TableHead className="px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">{t('orders.table.orderNumber')}</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('orders.table.customer')}</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('orders.table.fulfillment')}</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('orders.table.status')}</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500">{t('orders.table.total')}</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500">{t('orders.active.ageColumn')}</TableHead>
                <TableHead className="px-6 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">{t('orders.table.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !loadedOnce ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-xs font-black uppercase tracking-widest text-slate-300">
                    {t('orders.table.loading')}
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-xs font-black uppercase tracking-widest text-slate-300">
                    {t('orders.active.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((o) => {
                  const noShows = o.customer?.noShowCount ?? 0;
                  const flagNoShows = noShowWarnThreshold > 0 && noShows >= noShowWarnThreshold;
                  return (
                    <TableRow
                      key={o.id}
                      onClick={() => onSelectOrder(o)}
                      className={cn(
                        'h-16 cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50/70',
                        // An unconfirmed order is the one thing on this table
                        // that is actively costing the restaurant time.
                        o.status === 'NEW' && 'border-l-4 border-l-amber-400 bg-amber-50/40 hover:bg-amber-50/70'
                      )}
                    >
                      <TableCell className="px-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900">#{o.orderNumber}</span>
                          {o.status === 'NEW' && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-amber-600">
                              {t('orders.active.needsConfirmation')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-slate-800">{o.customer?.name || '—'}</span>
                          <span className="font-mono text-[10px] text-slate-400">{o.customer?.phone || ''}</span>
                          {(flagNoShows || o.customerBanned) && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              {flagNoShows && (
                                <Badge className="border-0 bg-amber-100 px-1.5 py-0 text-[9px] font-black uppercase text-amber-700 shadow-none">
                                  <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                                  {String(noShows)} {t('orders.active.noShowsSuffix')}
                                </Badge>
                              )}
                              {o.customerBanned && (
                                <Badge className="border-0 bg-rose-100 px-1.5 py-0 text-[9px] font-black uppercase text-rose-700 shadow-none">
                                  <Ban className="mr-0.5 h-2.5 w-2.5" />
                                  {t('orders.active.bannedBadge')}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-slate-200 bg-white text-[9px] font-black uppercase text-slate-600 shadow-none">
                          {t(`orders.fulfillment.${o.fulfillmentType}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('rounded-sm border-0 px-2 py-0.5 text-[9px] font-black uppercase shadow-none', orderStatusBadgeClass(o.status))}>
                          {t(`orders.status.${o.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm font-black text-slate-800">{formatPrice(o.total)}</TableCell>
                      <TableCell className="text-right text-[10px] font-bold text-slate-500">{elapsedSince(o.createdAt, t)}</TableCell>
                      <TableCell className="px-6">{renderActions(o)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reject / cancel reason */}
      <Dialog open={!!reasonTarget} onOpenChange={(open) => { if (!open) setReasonTarget(null); }}>
        <DialogContent maxWidth="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              {reasonTarget &&
                t(reasonTarget.status === 'REJECTED' ? 'orders.active.rejectDialog.title' : 'orders.active.cancelDialog.title')
                  .replace('{number}', String(reasonTarget.order.orderNumber))}
            </DialogTitle>
            <DialogDescription className="text-xs">{t('orders.active.rejectDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('orders.active.rejectDialog.reasonLabel')}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('orders.active.rejectDialog.reasonPlaceholder')}
              className="min-h-[80px] text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReasonTarget(null)}>{t('orders.active.rejectDialog.closeBtn')}</Button>
            <Button onClick={submitReason} disabled={reasonSubmitting} className="bg-rose-600 text-white hover:bg-rose-700">
              {t('orders.active.rejectDialog.confirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Not picked up — terminal, and it increments the customer's no-show
          count server-side, so it always asks first. No reason field: the
          status is the reason. */}
      <Dialog open={!!notPickedUpTarget} onOpenChange={(open) => { if (!open) setNotPickedUpTarget(null); }}>
        <DialogContent maxWidth="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black">
              {notPickedUpTarget &&
                t('orders.active.notPickedUpDialog.title').replace('{number}', String(notPickedUpTarget.orderNumber))}
            </DialogTitle>
            <DialogDescription className="text-xs">{t('orders.active.notPickedUpDialog.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotPickedUpTarget(null)}>{t('orders.active.rejectDialog.closeBtn')}</Button>
            <Button onClick={submitNotPickedUp} disabled={notPickedUpSubmitting} className="bg-orange-600 text-white hover:bg-orange-700">
              {t('orders.active.notPickedUpDialog.confirmBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
