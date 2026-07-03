'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Plus, Trash2, Timer } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useTranslation } from '@/i18n/provider';

interface TimeEntry {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number;
  note: string | null;
}

interface SummaryRow {
  userId: string;
  name: string;
  workedHours: number;
  estimatedShifts: number;
}

// First/last day of the ISO week containing `d`, and of its month.
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function TimesheetPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ date: iso(new Date()), checkIn: '', checkOut: '', breakMinutes: '0', note: '' });

  const { from, to } = (() => {
    const now = new Date();
    if (range === 'week') {
      const s = startOfWeek(now);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return { from: iso(s), to: iso(e) };
    }
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  })();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [entriesRes, summaryRes] = await Promise.all([
        api.get(`/time-entries?from=${from}&to=${to}`),
        api.get(`/time-entries/summary?from=${from}&to=${to}`),
      ]);
      setEntries(entriesRes.data.data);
      setSummary(summaryRes.data.data.summary);
    } catch {
      toast.error(t('timesheet.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [from, to, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/time-entries', {
        date: form.date,
        checkIn: form.checkIn || null,
        checkOut: form.checkOut || null,
        breakMinutes: parseInt(form.breakMinutes) || 0,
        note: form.note || null,
      });
      toast.success(t('timesheet.saved'));
      setForm({ date: iso(new Date()), checkIn: '', checkOut: '', breakMinutes: '0', note: '' });
      fetchData();
    } catch {
      toast.error(t('timesheet.saveFailed'));
    }
  };

  const removeEntry = async (entry: TimeEntry) => {
    const ok = await confirm({ title: t('timesheet.deleteConfirm'), details: [{ label: t('timesheet.date'), value: entry.date }], tone: 'danger', confirmText: t('tables.deleteBtn') });
    if (!ok) return;
    try {
      await api.delete(`/time-entries/${entry.id}`);
      toast.success(t('timesheet.deleted'));
      fetchData();
    } catch {
      toast.error(t('timesheet.saveFailed'));
    }
  };

  const myHours = summary.reduce((s, r) => s + r.workedHours, 0);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('timesheet.title')}</h1>
            <p className="text-sm text-slate-500">{t('timesheet.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 bg-white border rounded-md p-1 shadow-sm">
            <Button size="sm" variant={range === 'week' ? 'default' : 'ghost'} onClick={() => setRange('week')} className="h-8 text-xs font-bold">{t('timesheet.thisWeek')}</Button>
            <Button size="sm" variant={range === 'month' ? 'default' : 'ghost'} onClick={() => setRange('month')} className="h-8 text-xs font-bold">{t('timesheet.thisMonth')}</Button>
          </div>
        </div>

        {/* Worked hours summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2"><CardTitle className="text-sm text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2"><Timer className="w-4 h-4 text-blue-500" /> {t('timesheet.workedHours')}</CardTitle></CardHeader>
            <CardContent className="p-4 pt-0"><span className="text-3xl font-black text-slate-900">{Math.round(myHours * 10) / 10}<span className="text-sm text-slate-400 ml-1">{t('timesheet.hours')}</span></span></CardContent>
          </Card>
        </div>

        {/* Per-staff summary (managers see everyone; staff see themselves) */}
        {summary.length > 0 && (
          <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="p-3 bg-slate-50/50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-700">{t('timesheet.summaryTitle')}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80"><TableRow className="h-9">
                  <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">{t('timesheet.staff')}</TableHead>
                  <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{t('timesheet.workedHours')}</TableHead>
                  <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right px-4">{t('timesheet.estimated')}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {summary.map(row => (
                    <TableRow key={row.userId} className="h-11 border-b border-slate-100">
                      <TableCell className="px-4 font-bold text-slate-800 text-sm">{row.name}</TableCell>
                      <TableCell className="text-right font-black text-slate-900">{row.workedHours} {t('timesheet.hours')}</TableCell>
                      <TableCell className="text-right px-4 text-xs text-slate-400">{row.estimatedShifts > 0 ? t('timesheet.estimatedShifts', ).replace('{n}', String(row.estimatedShifts)) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Add / edit an entry */}
        <Card className="rounded-md border-slate-200 shadow-sm">
          <CardHeader className="p-3 bg-slate-50/50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> {t('timesheet.logTime')}</CardTitle></CardHeader>
          <CardContent className="p-4">
            <form onSubmit={saveEntry} className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
              <div className="grid gap-1.5"><Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.date')}</Label><Input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="h-10" /></div>
              <div className="grid gap-1.5"><Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.checkIn')}</Label><Input type="time" value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })} className="h-10" /></div>
              <div className="grid gap-1.5"><Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.checkOut')}</Label><Input type="time" value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })} className="h-10" /></div>
              <div className="grid gap-1.5"><Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.break')}</Label><Input type="number" min="0" value={form.breakMinutes} onChange={e => setForm({ ...form, breakMinutes: e.target.value })} className="h-10" /></div>
              <div className="grid gap-1.5 col-span-2 md:col-span-1"><Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.note')}</Label><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="h-10" /></div>
              <Button type="submit" className="h-10 bg-blue-600 hover:bg-blue-700 font-bold"><Plus className="w-4 h-4 mr-1" /> {t('timesheet.save')}</Button>
            </form>
          </CardContent>
        </Card>

        {/* Entries list */}
        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80"><TableRow className="h-9">
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">{t('timesheet.date')}</TableHead>
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('timesheet.checkIn')}</TableHead>
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('timesheet.checkOut')}</TableHead>
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('timesheet.break')}</TableHead>
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('timesheet.note')}</TableHead>
                <TableHead className="text-right px-4"></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-xs text-slate-400 uppercase tracking-widest font-bold">{t('timesheet.loading')}</TableCell></TableRow>
                ) : entries.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-xs text-slate-400 uppercase tracking-widest font-bold">{t('timesheet.noEntries')}</TableCell></TableRow>
                ) : entries.map(entry => (
                  <TableRow key={entry.id} className="h-11 border-b border-slate-100">
                    <TableCell className="px-4 font-bold text-slate-800 text-sm">{entry.date}</TableCell>
                    <TableCell className="text-slate-600">{entry.checkIn || '—'}</TableCell>
                    <TableCell className="text-slate-600">{entry.checkOut || '—'}</TableCell>
                    <TableCell className="text-slate-600">{entry.breakMinutes} {t('timesheet.min')}</TableCell>
                    <TableCell className="text-slate-500 text-xs">{entry.note || '—'}</TableCell>
                    <TableCell className="text-right px-4"><Button variant="ghost" size="icon" onClick={() => removeEntry(entry)} className="h-7 w-7 text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
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
