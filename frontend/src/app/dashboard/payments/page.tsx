'use client';

import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CreditCard, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from "@/i18n/provider";

export default function PaymentsPage() {
  const { t } = useTranslation();
  const mockTransactions = [
    { id: 'TX-8923', customer: 'John Doe', amount: 500, date: '2026-05-15 14:30', status: 'COMPLETED', method: 'Credit Card (Visa)' },
    { id: 'TX-8924', customer: 'Alice Smith', amount: 350, date: '2026-05-15 15:15', status: 'PENDING', method: 'Bank Transfer' },
    { id: 'TX-8925', customer: 'Robert Johnson', amount: 1200, date: '2026-05-15 16:45', status: 'FAILED', method: 'Credit Card (Mastercard)' },
    { id: 'TX-8926', customer: 'Emily Brown', amount: 800, date: '2026-05-15 17:20', status: 'COMPLETED', method: 'Credit Card (Amex)' },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'PENDING': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'FAILED': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200">{t("payments.status.completed")}</Badge>;
      case 'PENDING': return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-amber-200">{t("payments.status.pending")}</Badge>;
      case 'FAILED': return <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border-red-200">{t("payments.status.failed")}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t("payments.title")}</h1>
            <p className="text-xs text-slate-500 font-medium">{t("payments.description")}</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 text-xs font-bold shadow-sm">{t("payments.exportReport")}</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-100 shadow-sm bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-blue-100 tracking-wider">{t("payments.availableBalance")}</CardDescription>
              <CardTitle className="text-2xl font-bold">₺24,500.00</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <Button variant="secondary" size="sm" className="w-full text-xs font-bold mt-2 bg-white/20 hover:bg-white/30 text-white border-0">{t("payments.withdrawFunds")}</Button>
            </CardContent>
          </Card>

          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{t("payments.todayVolume")}</CardDescription>
              <CardTitle className="text-2xl font-bold text-slate-800">₺3,250.00</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs font-medium text-slate-400 mt-2">{t("payments.successfulTransactions")}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{t("payments.pendingDeposits")}</CardDescription>
              <CardTitle className="text-2xl font-bold text-slate-800">₺850.00</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs font-medium text-amber-500 mt-2">{t("payments.pendingReservations")}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-100 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-500" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-700">{t("payments.recentLedger")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-xs font-bold text-slate-500 w-[120px]">{t("payments.table.txId")}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t("payments.table.customer")}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t("payments.table.method")}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t("payments.table.date")}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 text-right">{t("payments.table.amount")}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 text-right w-[100px]">{t("payments.table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockTransactions.map((tx) => (
                  <TableRow key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="font-mono text-xs font-medium text-slate-600">{tx.id}</TableCell>
                    <TableCell className="font-semibold text-sm text-slate-800">{tx.customer}</TableCell>
                    <TableCell className="text-xs text-slate-500">{tx.method}</TableCell>
                    <TableCell className="text-xs text-slate-500">{tx.date}</TableCell>
                    <TableCell className="text-sm font-bold text-slate-900 text-right">₺{tx.amount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {getStatusBadge(tx.status)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
