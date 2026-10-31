'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Plus, Trash2, Timer, CalendarRange } from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useTranslation } from '@/i18n/provider';
import { useAuthStore } from '@/store/useAuthStore';
import { useFormat } from '@/store/useFormatStore';
import { getShifts, getAssignments, type Shift, type ShiftAssignment } from '@/lib/api/scheduling';
import { computeWorked, formatHM, workedTone } from '@/lib/workedHours';
import { cn } from '@/lib/utils';

interface TimeEntry {
  id: string;
  userId: string;
  date: string;
  shiftId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number;
  note: string | null;
}

interface SummaryRow {
  userId: string;
  name: string;
  workedHours: number;
  scheduledHours: number;
  estimatedShifts: number;
}

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
}

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const entryKey = (userId: string, date: string, shiftId: string | null) => `${userId}|${date}|${shiftId || ''}`;

// Break-time options: 0..120 minutes at 5-minute steps.
const BREAK_OPTIONS = Array.from({ length: 25 }, (_, i) => i * 5);

export default function TimesheetPanel() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { user } = useAuthStore();
  const { formatDate, formatTime, formatTimeRange, timeOptions } = useFormat();

  const isManager = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [range, setRange] = useState<'week' | 'month'>('week');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [defaultBreak, setDefaultBreak] = useState(0);
  const [loading, setLoading] = useState(true);

  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const targetUserId = isManager ? selectedStaffId : (user?.id || '');

  const [form, setForm] = useState({ date: iso(new Date()), shiftId: '', checkIn: '', checkOut: '', breakMinutes: '0', note: '' });

  const times = useMemo(() => timeOptions(5), [timeOptions]);

  const { from, to } = useMemo(() => {
    const now = new Date();
    if (range === 'week') {
      const s = startOfWeek(now);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return { from: iso(s), to: iso(e) };
    }
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }, [range]);

  const rangeDays = useMemo(() => {
    const out: string[] = [];
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(iso(d));
    return out;
  }, [from, to]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      // Managers pull every staff member's entries so the shift plan can show
      // everyone's worked hours; staff pull only their own.
      const entriesUrl = isManager ? `/time-entries?from=${from}&to=${to}&all=1` : `/time-entries?from=${from}&to=${to}`;
      const [entriesRes, summaryRes, shiftsData, assignData, staffRes, settingsRes] = await Promise.all([
        api.get(entriesUrl),
        api.get(`/time-entries/summary?from=${from}&to=${to}`),
        getShifts(),
        getAssignments({ startDate: from, endDate: to }),
        isManager ? api.get('/staff') : Promise.resolve(null),
        api.get('/settings'),
      ]);
      setEntries(entriesRes.data.data);
      setSummary(summaryRes.data.data.summary);
      setShifts(shiftsData);
      setAssignments(assignData);
      if (staffRes) setStaffList(staffRes.data.data || []);
      const db = settingsRes.data.data?.defaultBreakMinutes ?? 0;
      setDefaultBreak(db);
    } catch {
      toast.error(t('timesheet.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [from, to, t, isManager]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Default the break dropdown to the restaurant's configured default once loaded.
  useEffect(() => {
    setForm(f => (f.breakMinutes === '0' && defaultBreak > 0 ? { ...f, breakMinutes: String(defaultBreak) } : f));
  }, [defaultBreak]);

  const entryMap = useMemo(() => {
    const m = new Map<string, TimeEntry>();
    for (const e of entries) m.set(entryKey(e.userId, e.date, e.shiftId), e);
    return m;
  }, [entries]);

  const dayAssignments = useMemo(
    () => assignments.filter(a => a.userId === targetUserId && a.date === form.date),
    [assignments, targetUserId, form.date]
  );

  useEffect(() => {
    if (!targetUserId || !form.date) return;
    const dayAssigns = assignments.filter(a => a.userId === targetUserId && a.date === form.date);
    if (dayAssigns.length > 0) {
      const first = dayAssigns[0];
      setForm(f => ({ ...f, shiftId: first.shiftId, checkIn: first.shift?.startTime || '', checkOut: first.shift?.endTime || '' }));
    } else {
      setForm(f => ({ ...f, shiftId: '', checkIn: '', checkOut: '' }));
    }
     
  }, [targetUserId, form.date, assignments]);

  const onShiftChange = (shiftId: string) => {
    const a = assignments.find(x => x.userId === targetUserId && x.date === form.date && x.shiftId === shiftId);
    const sh = a?.shift || shifts.find(s => s.id === shiftId);
    setForm(f => ({ ...f, shiftId, checkIn: sh?.startTime || f.checkIn, checkOut: sh?.endTime || f.checkOut }));
  };

  const saveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isManager && !selectedStaffId) {
      toast.error(t('timesheet.selectStaff'));
      return;
    }
    try {
      await api.put('/time-entries', {
        ...(isManager ? { userId: selectedStaffId } : {}),
        date: form.date,
        shiftId: form.shiftId || null,
        checkIn: form.checkIn || null,
        checkOut: form.checkOut || null,
        breakMinutes: parseInt(form.breakMinutes) || 0,
        note: form.note || null,
      });
      toast.success(t('timesheet.saved'));
      setForm(f => ({ ...f, note: '' }));
      fetchData();
    } catch {
      toast.error(t('timesheet.saveFailed'));
    }
  };

  const removeEntry = async (entry: TimeEntry) => {
    const ok = await confirm({ title: t('timesheet.deleteConfirm'), details: [{ label: t('timesheet.date'), value: formatDate(entry.date) }], tone: 'danger', confirmText: t('tables.deleteBtn') });
    if (!ok) return;
    try {
      await api.delete(`/time-entries/${entry.id}`);
      toast.success(t('timesheet.deleted'));
      fetchData();
    } catch {
      toast.error(t('timesheet.saveFailed'));
    }
  };

  const totalHours = summary.reduce((s, r) => s + r.workedHours, 0);
  const staffName = (s: Staff) => `${s.firstName} ${s.lastName}`;
  const nameById = useMemo(() => new Map(staffList.map(s => [s.id, staffName(s)])), [staffList]);

  // Worked time for a single staff member's assignment on a given day, preferring
  // their real entry and otherwise crediting the scheduled shift (minus break).
  const workedForAssignment = (a: ShiftAssignment) => {
    const entry = entryMap.get(entryKey(a.userId, a.date, a.shiftId));
    const sh = a.shift;
    if (!sh) return { minutes: 0, scheduledMinutes: 0, source: 'SCHEDULED' as const };
    return computeWorked(sh.startTime, sh.endTime, entry, defaultBreak);
  };

  // Assignments (with computed hours) for one cell of the shift-plan overview.
  const planCell = (date: string, shiftId: string) =>
    assignments
      .filter(a => a.date === date && a.shiftId === shiftId)
      .map(a => ({
        id: a.id,
        name: `${a.user?.firstName || ''} ${a.user?.lastName || ''}`.trim() || nameById.get(a.userId) || '',
        ...workedForAssignment(a),
      }));

  // Total worked minutes scheduled/logged across all shifts for one day.
  const dayTotalMinutes = (date: string) =>
    assignments.filter(a => a.date === date).reduce((sum, a) => sum + workedForAssignment(a).minutes, 0);

  const listEntries = useMemo(() => {
    if (!isManager) return entries;
    return selectedStaffId ? entries.filter(e => e.userId === selectedStaffId) : entries;
  }, [entries, isManager, selectedStaffId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">{t('timesheet.title')}</h2>
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
          <CardContent className="p-4 pt-0"><span className="text-3xl font-black text-slate-900">{Math.round(totalHours * 10) / 10}<span className="text-sm text-slate-400 ml-1">{t('timesheet.hours')}</span></span></CardContent>
        </Card>
      </div>

      {/* Shift plan overview — now shows worked/scheduled hours per assignment */}
      <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="p-3 bg-slate-50/50 border-b flex-row items-center justify-between">
          <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-700 flex items-center gap-2"><CalendarRange className="w-4 h-4 text-blue-500" /> {t('timesheet.shiftPlanTitle')}</CardTitle>
          <span className="text-[10px] text-slate-400 font-medium normal-case">{t('timesheet.shiftPlanSubtitle')}</span>
        </CardHeader>
        <CardContent className="p-0 overflow-auto max-h-[380px]">
          {shifts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 uppercase tracking-widest font-bold">{t('timesheet.noShifts')}</div>
          ) : (
            <table className="w-full text-xs border-collapse min-w-[620px]">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-2 border-b sticky left-0 bg-slate-50">{t('timesheet.date')}</th>
                  {shifts.map(s => (
                    <th key={s.id} className="text-left text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 py-2 border-b min-w-[140px]">
                      <div className="font-bold text-slate-700 normal-case tracking-normal">{s.name}</div>
                      <div className="text-[9px] text-slate-400 font-medium normal-case tracking-normal">{formatTimeRange(s.startTime, s.endTime)}</div>
                    </th>
                  ))}
                  <th className="text-right text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-2 border-b bg-slate-50">{t('timesheet.total')}</th>
                </tr>
              </thead>
              <tbody>
                {rangeDays.map(dateStr => {
                  const d = new Date(`${dateStr}T00:00:00`);
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = iso(new Date()) === dateStr;
                  const dayTotal = dayTotalMinutes(dateStr);
                  return (
                    <tr key={dateStr} className={cn('border-b border-slate-100', isToday ? 'bg-blue-50/40' : weekend ? 'bg-slate-50/50' : 'bg-white')}>
                      <td className={cn('px-3 py-1.5 font-medium sticky left-0 whitespace-nowrap', isToday ? 'bg-blue-50 text-blue-700' : weekend ? 'bg-slate-50' : 'bg-white')}>
                        <span className="font-bold">{formatDate(dateStr)}</span>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold ml-1.5">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      </td>
                      {shifts.map(s => {
                        const people = planCell(dateStr, s.id);
                        return (
                          <td key={s.id} className="px-3 py-1.5 align-top">
                            {people.length === 0 ? (
                              <span className="text-slate-300">{t('timesheet.unassigned')}</span>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {people.map(p => {
                                  const tone = p.source === 'ENTRY' ? workedTone(p.minutes, p.scheduledMinutes) : 'ok';
                                  return (
                                    <div key={p.id} className="flex items-center justify-between gap-1.5 bg-slate-100/70 rounded px-1.5 py-0.5">
                                      <span className="text-[10px] font-semibold text-slate-700 truncate">{p.name}</span>
                                      <span className={cn(
                                        'text-[10px] font-black tabular-nums shrink-0',
                                        tone === 'over' ? 'text-red-600' : tone === 'under' ? 'text-amber-600' : p.source === 'ENTRY' ? 'text-emerald-600' : 'text-slate-400'
                                      )} title={p.source === 'ENTRY' ? t('timesheet.fromEntry') : t('timesheet.fromSchedule')}>
                                        {formatHM(p.minutes)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-black text-slate-900 tabular-nums">{dayTotal > 0 ? formatHM(dayTotal) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Per-staff summary — overtime in red, under-scheduled in yellow */}
      {summary.length > 0 && (
        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="p-3 bg-slate-50/50 border-b flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-700">{t('timesheet.summaryTitle')}</CardTitle>
            <div className="flex items-center gap-3 text-[10px] font-semibold normal-case">
              <span className="flex items-center gap-1 text-red-600"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> {t('timesheet.legendOvertime')}</span>
              <span className="flex items-center gap-1 text-amber-600"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> {t('timesheet.legendUndertime')}</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80"><TableRow className="h-9">
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">{t('timesheet.staff')}</TableHead>
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{t('timesheet.scheduled')}</TableHead>
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">{t('timesheet.workedHours')}</TableHead>
                <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right px-4">{t('timesheet.estimated')}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {summary.map(row => {
                  const over = row.workedHours > row.scheduledHours + 0.05;
                  const under = row.workedHours < row.scheduledHours - 0.05;
                  return (
                    <TableRow key={row.userId} className="h-11 border-b border-slate-100">
                      <TableCell className="px-4 font-bold text-slate-800 text-sm">{row.name}</TableCell>
                      <TableCell className="text-right text-slate-500 tabular-nums">{row.scheduledHours} {t('timesheet.hours')}</TableCell>
                      <TableCell className={cn('text-right font-black tabular-nums', over ? 'text-red-600' : under ? 'text-amber-600' : 'text-slate-900')}>
                        {row.workedHours} {t('timesheet.hours')}
                        {over && <span className="ml-1 text-[9px] font-black">▲</span>}
                        {under && <span className="ml-1 text-[9px] font-black">▼</span>}
                      </TableCell>
                      <TableCell className="text-right px-4 text-xs text-slate-400">{row.estimatedShifts > 0 ? t('timesheet.estimatedShifts').replace('{n}', String(row.estimatedShifts)) : '—'}</TableCell>
                    </TableRow>
                  );
                })}
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
            {isManager && (
              <div className="grid gap-1.5 col-span-2 md:col-span-2">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.logFor')}</Label>
                <select required value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm">
                  <option value="">{t('timesheet.selectStaff')}</option>
                  {staffList.map(s => (<option key={s.id} value={s.id}>{staffName(s)}</option>))}
                </select>
              </div>
            )}

            <div className="grid gap-1.5"><Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.date')}</Label><Input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="h-10" /></div>

            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.shift')}</Label>
              <select value={form.shiftId} onChange={e => onShiftChange(e.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm">
                <option value="">{t('timesheet.customShift')}</option>
                {shifts.map(s => {
                  const assigned = dayAssignments.some(a => a.shiftId === s.id);
                  return (<option key={s.id} value={s.id}>{assigned ? '★ ' : ''}{s.name} ({formatTimeRange(s.startTime, s.endTime)})</option>);
                })}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.checkIn')}</Label>
              <select value={form.checkIn} onChange={e => setForm({ ...form, checkIn: e.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm">
                <option value="">—</option>
                {times.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.checkOut')}</Label>
              <select value={form.checkOut} onChange={e => setForm({ ...form, checkOut: e.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm">
                <option value="">—</option>
                {times.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.breakLabel')}</Label>
              <select value={form.breakMinutes} onChange={e => setForm({ ...form, breakMinutes: e.target.value })} className="h-10 rounded-md border border-slate-200 bg-white px-2 text-sm">
                {BREAK_OPTIONS.map(m => <option key={m} value={m}>{m} {t('timesheet.min')}</option>)}
              </select>
            </div>

            <div className="grid gap-1.5 col-span-2 md:col-span-1"><Label className="text-[10px] font-black uppercase text-slate-400">{t('timesheet.note')}</Label><Input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="h-10" /></div>
            <Button type="submit" className="h-10 bg-blue-600 hover:bg-blue-700 font-bold"><Plus className="w-4 h-4 mr-1" /> {t('timesheet.save')}</Button>
          </form>
          {form.shiftId && dayAssignments.some(a => a.shiftId === form.shiftId) && (
            <p className="text-[11px] text-slate-400 font-medium mt-2">{t('timesheet.prefilledFromShift')}</p>
          )}
        </CardContent>
      </Card>

      {/* Entries list */}
      <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="p-3 bg-slate-50/50 border-b"><CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-700">{t('timesheet.myEntries')}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/80"><TableRow className="h-9">
              {isManager && <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">{t('timesheet.staff')}</TableHead>}
              <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">{t('timesheet.date')}</TableHead>
              <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('timesheet.checkIn')}</TableHead>
              <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('timesheet.checkOut')}</TableHead>
              <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('timesheet.breakLabel')}</TableHead>
              <TableHead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('timesheet.note')}</TableHead>
              <TableHead className="text-right px-4"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={isManager ? 7 : 6} className="h-24 text-center text-xs text-slate-400 uppercase tracking-widest font-bold">{t('timesheet.loading')}</TableCell></TableRow>
              ) : listEntries.length === 0 ? (
                <TableRow><TableCell colSpan={isManager ? 7 : 6} className="h-24 text-center text-xs text-slate-400 uppercase tracking-widest font-bold">{t('timesheet.noEntries')}</TableCell></TableRow>
              ) : listEntries.map(entry => (
                <TableRow key={entry.id} className="h-11 border-b border-slate-100">
                  {isManager && <TableCell className="px-4 font-bold text-slate-700 text-sm">{nameById.get(entry.userId) || '—'}</TableCell>}
                  <TableCell className="px-4 font-bold text-slate-800 text-sm">{formatDate(entry.date)}</TableCell>
                  <TableCell className="text-slate-600 tabular-nums">{entry.checkIn ? formatTime(entry.checkIn) : '—'}</TableCell>
                  <TableCell className="text-slate-600 tabular-nums">{entry.checkOut ? formatTime(entry.checkOut) : '—'}</TableCell>
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
  );
}
