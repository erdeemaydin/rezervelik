'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, CheckCircle2, XCircle, Clock, Hourglass, Undo2 } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/provider';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/store/useAuthStore';

interface PaymentRow {
  id: string; merchantOid: string; provider: string; amount: number; currency: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
  createdAt: string; paidAt: string | null;
  reservation: { customerName: string; customerPhone: string; startTime: string; guestCount: number; status: string } | null;
}

// A deposit is forfeited when it was actually paid and the guest never showed
// up — nothing auto-refunds a no-show, so this is just visibility into money
// the restaurant already kept, not a separate charge/state.
const isForfeited = (p: PaymentRow) => p.status === 'PAID' && p.reservation?.status === 'NO_SHOW';

const money = (minor: number, currency: string) => {
  const v = (minor / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency === 'TL' || currency === 'TRY' ? '₺' : currency + ' '}${v}`;
};

export default function PaymentsPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const currentUser = useAuthStore(state => state.user);
  const canRefund = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER' || currentUser?.role === 'SUPER_ADMIN';
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/payments');
        setPayments(res.data.data);
      } catch {
        toast.error(t('payments.loadFailed'));
      } finally { setLoading(false); }
    })();
  }, []);

  const handleRefund = async (payment: PaymentRow) => {
    const ok = await confirm({
      title: t('payments.refundConfirmTitle'),
      description: t('payments.refundConfirmDesc'),
      details: [
        { label: t('payments.guest'), value: payment.reservation?.customerName || '—' },
        { label: t('payments.amount'), value: money(payment.amount, payment.currency) },
      ],
      confirmText: t('payments.refund'),
      cancelText: t('common.cancel'),
      tone: 'danger',
    });
    if (!ok) return;

    setRefundingId(payment.id);
    try {
      const res = await api.post(`/payments/${payment.id}/refund`);
      setPayments(prev => prev.map(p => p.id === payment.id ? res.data.data : p));
      toast.success(t('payments.refundSuccess'));
    } catch (e: any) {
      toast.error(e?.response?.data?.details?.message || t('payments.refundFailed'));
    } finally {
      setRefundingId(null);
    }
  };

  const stats = useMemo(() => {
    const paid = payments.filter(p => p.status === 'PAID');
    const collected = paid.reduce((s, p) => s + p.amount, 0);
    const pending = payments.filter(p => p.status === 'PENDING').length;
    const forfeited = paid.filter(isForfeited);
    const forfeitedTotal = forfeited.reduce((s, p) => s + p.amount, 0);
    const currency = payments[0]?.currency || 'TL';
    return { collected, currency, count: payments.length, paidCount: paid.length, pending, forfeitedTotal, forfeitedCount: forfeited.length };
  }, [payments]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
      FAILED: 'bg-red-50 text-red-700 border-red-200',
      EXPIRED: 'bg-slate-100 text-slate-500 border-slate-200',
      REFUNDED: 'bg-violet-50 text-violet-700 border-violet-200',
    };
    return <Badge className={`${map[status] || ''} hover:opacity-100 border font-black text-[10px] uppercase`}>{t(`payments.status.${status.toLowerCase()}`) || status}</Badge>;
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'PAID': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'PENDING': return <Hourglass className="w-4 h-4 text-amber-500" />;
      case 'FAILED': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'EXPIRED': return <Clock className="w-4 h-4 text-slate-400" />;
      default: return <CreditCard className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t('payments.title')}</h1>
          <p className="text-xs text-slate-500 font-medium">{t('payments.depositsSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-100 shadow-sm bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-emerald-100 tracking-wider">{t('payments.totalCollected')}</CardDescription>
              <CardTitle className="text-2xl font-bold">{money(stats.collected, stats.currency)}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-[11px] font-bold text-emerald-100">{stats.paidCount} {t('payments.paidDeposits')}</CardContent>
          </Card>
          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t('payments.awaiting')}</CardDescription>
              <CardTitle className="text-2xl font-bold text-slate-800">{stats.pending}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-[11px] font-bold text-slate-400">{t('payments.awaitingHint')}</CardContent>
          </Card>
          <Card className="border-rose-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-rose-400 tracking-wider">{t('payments.forfeited')}</CardDescription>
              <CardTitle className="text-2xl font-bold text-rose-600">{money(stats.forfeitedTotal, stats.currency)}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-[11px] font-bold text-rose-400">{stats.forfeitedCount} {t('payments.forfeitedHint')}</CardContent>
          </Card>
          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t('payments.totalTransactions')}</CardDescription>
              <CardTitle className="text-2xl font-bold text-slate-800">{stats.count}</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-[11px] font-bold text-slate-400">{payments[0]?.provider || '—'}</CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-700">{t('payments.transactions')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-xs font-bold text-slate-500">{t('payments.guest')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t('payments.amount')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t('payments.status.label')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t('payments.reference')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t('payments.date')}</TableHead>
                  {canRefund && <TableHead className="text-xs font-bold text-slate-500 text-right">{t('payments.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={canRefund ? 6 : 5} className="h-32 text-center text-xs font-bold text-slate-400">{t('payments.loading')}</TableCell></TableRow>
                ) : payments.length === 0 ? (
                  <TableRow><TableCell colSpan={canRefund ? 6 : 5} className="h-32 text-center text-xs font-bold text-slate-400">{t('payments.empty')}</TableCell></TableRow>
                ) : payments.map((p) => (
                  <TableRow key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell>
                      <div className="font-semibold text-sm text-slate-800">{p.reservation?.customerName || '—'}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{p.reservation?.customerPhone}</div>
                    </TableCell>
                    <TableCell className="font-black text-slate-900">{money(p.amount, p.currency)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusIcon(p.status)} {statusBadge(p.status)}
                        {isForfeited(p) && (
                          <Badge className="bg-rose-50 text-rose-700 border-rose-200 hover:opacity-100 border font-black text-[10px] uppercase">
                            {t('payments.forfeitedBadge')}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] font-mono text-slate-400">{p.merchantOid}</TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(p.paidAt || p.createdAt).toLocaleString('tr-TR')}</TableCell>
                    {canRefund && (
                      <TableCell className="text-right">
                        {p.status === 'PAID' && (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 px-2 text-[11px] font-bold text-rose-600 border-rose-200 hover:bg-rose-50"
                            disabled={refundingId === p.id}
                            onClick={() => handleRefund(p)}
                          >
                            <Undo2 className="w-3 h-3 mr-1" />
                            {refundingId === p.id ? t('payments.refunding') : t('payments.refund')}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
