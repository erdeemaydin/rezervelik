'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, FloppyDisk, Percent, ArrowCounterClockwise, Calendar, Clock, X, ClockCounterClockwise, ArrowUUpLeft, Pencil } from '@phosphor-icons/react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/provider';

interface Item { id: string; name: string; price: number; }
interface Group { key: string; label: string; items: Item[]; }
interface ChangeItem { id: string; name: string | null; price?: number; oldPrice?: number; newPrice?: number; }
interface PriceUpdate {
  id: string;
  updateType: string;
  status: string;
  scheduledFor: string;
  appliedAt: string | null;
  items: ChangeItem[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function BulkPricesPage() {
  const { t, locale } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [currency, setCurrency] = useState('TRY');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [percent, setPercent] = useState('');
  // Per-item new price as typed text. Empty string → keep the old price.
  const [newPrices, setNewPrices] = useState<Record<string, string>>({});
  // Schedule the change for a future time instead of applying immediately.
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  // Pending (not yet applied) scheduled changes, and recently applied ones (for undo).
  const [scheduled, setScheduled] = useState<PriceUpdate[]>([]);
  const [history, setHistory] = useState<PriceUpdate[]>([]);
  // Set while editing a pending scheduled change: saving will cancel this one first.
  const [editingScheduledId, setEditingScheduledId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fmtCurrency = useCallback((n: number) => {
    try {
      return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { style: 'currency', currency }).format(n);
    } catch {
      return `${n} ${currency}`;
    }
  }, [locale, currency]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [menusRes, settingsRes] = await Promise.all([
        api.get('/menus'),
        api.get('/settings'),
      ]);
      setCurrency(settingsRes.data?.data?.currency || 'TRY');

      // Flatten every category (including nested sub-categories) into ordered
      // groups of items, so the whole catalogue is editable in one screen.
      const out: Group[] = [];
      const collect = (cats: any[], path: string) => {
        for (const c of cats || []) {
          const label = path ? `${path} / ${c.name}` : c.name;
          if (c.items?.length) {
            out.push({ key: c.id, label, items: c.items.map((i: any) => ({ id: i.id, name: i.name, price: i.price })) });
          }
          if (c.children?.length) collect(c.children, label);
        }
      };
      for (const menu of menusRes.data?.data || []) {
        collect(menu.categories || [], '');
      }
      setGroups(out);
    } catch (error) {
      toast.error(t('menus.bulkEditor.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchScheduleAndHistory = useCallback(async () => {
    const [scheduledRes, historyRes] = await Promise.allSettled([
      api.get('/menus/prices/scheduled'),
      api.get('/menus/prices/history'),
    ]);
    if (scheduledRes.status === 'fulfilled') setScheduled(scheduledRes.value.data.data);
    if (historyRes.status === 'fulfilled') setHistory(historyRes.value.data.data);
  }, []);

  useEffect(() => { fetchData(); fetchScheduleAndHistory(); }, [fetchData, fetchScheduleAndHistory]);

  const cancelScheduled = async (id: string) => {
    try {
      setCancellingId(id);
      await api.delete(`/menus/prices/scheduled/${id}`);
      toast.success(t('menus.bulkEditor.cancelSuccess'));
      if (editingScheduledId === id) { setEditingScheduledId(null); resetAll(); }
      fetchScheduleAndHistory();
    } catch (error) {
      toast.error(t('menus.bulkEditor.cancelFailed'));
    } finally {
      setCancellingId(null);
    }
  };

  // Loads a pending change's target prices into the editor for tweaking; saving
  // will cancel the original scheduled entry and create a new one in its place.
  const editScheduled = (update: PriceUpdate) => {
    const next: Record<string, string> = {};
    for (const it of update.items) if (it.price !== undefined) next[it.id] = String(it.price);
    setNewPrices(next);
    setEditingScheduledId(update.id);
    setScheduleEnabled(true);
    setScheduledFor(update.scheduledFor.slice(0, 16));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const undoChange = async (id: string) => {
    try {
      setUndoingId(id);
      await api.post(`/menus/prices/undo/${id}`);
      toast.success(t('menus.bulkEditor.undoSuccess'));
      fetchData();
      fetchScheduleAndHistory();
    } catch (error) {
      toast.error(t('menus.bulkEditor.undoFailed'));
    } finally {
      setUndoingId(null);
    }
  };

  const allItems = useMemo(() => groups.flatMap(g => g.items), [groups]);

  // The effective base for an item: the value currently typed (if valid) else the old price.
  const currentValue = (item: Item): number => {
    const raw = newPrices[item.id];
    if (raw === undefined || raw.trim() === '') return item.price;
    const n = parseFloat(raw);
    return isNaN(n) ? item.price : n;
  };

  // Apply the percentage to the OLD price of every item, pre-filling the fields.
  const applyPercent = () => {
    const pct = parseFloat(percent);
    if (isNaN(pct)) { toast.error(t('menus.bulkEditor.enterPercent')); return; }
    const next: Record<string, string> = {};
    for (const item of allItems) {
      next[item.id] = String(round2(item.price * (1 + pct / 100)));
    }
    setNewPrices(next);
  };

  // Round every field UP to the next multiple of `step`, based on its current value.
  const roundUpAll = (step: number) => {
    const next: Record<string, string> = { ...newPrices };
    for (const item of allItems) {
      const base = currentValue(item);
      next[item.id] = String(Math.ceil(base / step) * step);
    }
    setNewPrices(next);
  };

  // Round a single item UP to the next multiple of `step`.
  const roundUpItem = (item: Item, step: number) => {
    const base = currentValue(item);
    setNewPrices(prev => ({ ...prev, [item.id]: String(Math.ceil(base / step) * step) }));
  };

  const resetAll = () => {
    setNewPrices({});
    setPercent('');
    setEditingScheduledId(null);
  };

  // Only items whose typed value is valid and actually differs from the old price.
  const changed = useMemo(() => {
    const list: { id: string; price: number }[] = [];
    for (const item of allItems) {
      const raw = newPrices[item.id];
      if (raw === undefined || raw.trim() === '') continue;
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0) continue;
      if (round2(n) !== round2(item.price)) list.push({ id: item.id, price: round2(n) });
    }
    return list;
  }, [allItems, newPrices]);

  const save = async () => {
    if (changed.length === 0) { toast.info(t('menus.bulkEditor.noChanges')); return; }
    if (scheduleEnabled && !scheduledFor) { toast.error(t('menus.bulkEditor.pickSchedule')); return; }
    try {
      setSaving(true);
      // Editing a pending scheduled change: drop the old one once the replacement is in.
      if (editingScheduledId) {
        await api.delete(`/menus/prices/scheduled/${editingScheduledId}`);
      }
      const body: any = { items: changed };
      if (scheduleEnabled && scheduledFor) {
        body.scheduledFor = new Date(scheduledFor).toISOString();
      }
      await api.post('/menus/prices/set', body);
      if (scheduleEnabled && scheduledFor) {
        toast.success(`${changed.length} ${t('menus.bulkEditor.scheduledSuffix')}`);
      } else {
        toast.success(`${changed.length} ${t('menus.bulkEditor.savedSuffix')}`);
      }
      setNewPrices({});
      setPercent('');
      setScheduleEnabled(false);
      setScheduledFor('');
      setEditingScheduledId(null);
      // A scheduled change hasn't been applied yet, so don't refetch (prices unchanged).
      if (!scheduleEnabled) fetchData();
      fetchScheduleAndHistory();
    } catch (error) {
      toast.error(t('menus.bulkEditor.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-28">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/menus">
            <Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t('menus.bulkEditor.title')}</h1>
            <p className="text-[11px] text-slate-400 font-bold tracking-[0.15em] mt-1">
              {t('menus.bulkEditor.subtitle')} · {t('menus.bulkEditor.currency')}: {currency}
            </p>
          </div>
        </div>

        {/* Bulk tools */}
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardHeader className="p-5 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold tracking-tight">{t('menus.bulkEditor.toolsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] font-semibold text-slate-500">{t('menus.bulkEditor.percentLabel')}</Label>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input type="number" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="10" className="h-10 w-28 pl-8 font-bold" />
                </div>
                <Button onClick={applyPercent} className="h-10 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">{t('menus.bulkEditor.applyPercent')}</Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-[10px] font-semibold text-slate-500">{t('menus.bulkEditor.roundUpLabel')}</Label>
              <div className="flex items-center gap-2">
                {[10, 50, 100].map(step => (
                  <Button key={step} variant="outline" onClick={() => roundUpAll(step)} className="h-10 text-xs font-black border-slate-200">{step}</Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2 ml-auto">
              <Label className="text-[10px] font-semibold text-transparent select-none">.</Label>
              <Button variant="ghost" onClick={resetAll} className="h-10 text-xs font-semibold text-slate-500">
                <ArrowCounterClockwise className="w-3.5 h-3.5 mr-1.5" /> {t('menus.bulkEditor.reset')}
              </Button>
            </div>

            {/* Schedule for later: store the target prices to apply at a future time. */}
            <div className="w-full flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} className="h-4 w-4 accent-blue-600" />
                <span className="text-xs font-semibold text-slate-600">{t('menus.bulkEditor.scheduleForLater')}</span>
              </label>
              {scheduleEnabled && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="h-10 text-xs font-medium w-56" />
                </div>
              )}
              {editingScheduledId && (
                <div className="w-full flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <span className="text-[11px] font-bold text-amber-700">{t('menus.bulkEditor.editingScheduled')}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={resetAll} className="h-7 text-[10px] font-semibold text-amber-700">
                    <X className="w-3 h-3 mr-1" /> {t('menus.bulkEditor.cancelEdit')}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pending scheduled changes: view, cancel, or edit before the worker applies them. */}
        {scheduled.length > 0 && (
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="p-5 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" /> {t('menus.bulkEditor.scheduledTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-50">
              {scheduled.map(update => (
                <div key={update.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700">
                      {new Date(update.scheduledFor).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}
                    </p>
                    <p className="text-[11px] text-slate-400 font-medium truncate">
                      {update.items.length} {t('menus.bulkEditor.itemsSuffix')}
                      {update.items.length > 0 && ` · ${update.items.slice(0, 3).map(i => i.name || '?').join(', ')}${update.items.length > 3 ? '…' : ''}`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => editScheduled(update)} className="h-8 text-[10px] font-semibold border-slate-200">
                    <Pencil className="w-3 h-3 mr-1" /> {t('menus.bulkEditor.editButton')}
                  </Button>
                  <Button
                    variant="outline" size="sm" onClick={() => cancelScheduled(update.id)} disabled={cancellingId === update.id}
                    className="h-8 text-[10px] font-semibold border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <X className="w-3 h-3 mr-1" /> {t('menus.bulkEditor.cancelButton')}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recent changes: history of applied price changes, with undo. */}
        {history.length > 0 && (
          <Card className="rounded-xl border-slate-200 shadow-sm">
            <CardHeader className="p-5 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <ClockCounterClockwise className="w-4 h-4 text-slate-500" /> {t('menus.bulkEditor.historyTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-50">
              {history.map(update => (
                <div key={update.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 flex items-center gap-2">
                      {update.appliedAt ? new Date(update.appliedAt).toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US') : '—'}
                      {update.status === 'UNDONE' && (
                        <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">{t('menus.bulkEditor.undoneBadge')}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-400 font-medium truncate">
                      {update.items.length} {t('menus.bulkEditor.itemsSuffix')}
                      {update.items.length > 0 && ` · ${update.items.slice(0, 3).map(i => i.name || '?').join(', ')}${update.items.length > 3 ? '…' : ''}`}
                    </p>
                  </div>
                  {update.status === 'APPLIED' && (
                    <Button
                      variant="outline" size="sm" onClick={() => undoChange(update.id)} disabled={undoingId === update.id}
                      className="h-8 text-[10px] font-semibold border-slate-200"
                    >
                      <ArrowUUpLeft className="w-3 h-3 mr-1" /> {t('menus.bulkEditor.undoButton')}
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-16 font-bold">{t('menus.bulkEditor.empty')}</p>
        ) : (
          <div className="space-y-6">
            {groups.map(group => (
              <Card key={group.key} className="rounded-xl border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="p-4 bg-slate-50/60 border-b border-slate-100">
                  <CardTitle className="text-xs font-semibold text-slate-600">{group.label}</CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y divide-slate-50">
                  {group.items.map(item => {
                    const raw = newPrices[item.id];
                    const hasNew = raw !== undefined && raw.trim() !== '' && !isNaN(parseFloat(raw)) && round2(parseFloat(raw)) !== round2(item.price);
                    return (
                      <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                        </div>
                        <div className="text-right w-28 shrink-0">
                          <p className="text-[9px] font-semibold text-slate-400">{t('menus.bulkEditor.oldPrice')}</p>
                          <p className={`text-sm font-bold ${hasNew ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{fmtCurrency(item.price)}</p>
                        </div>
                        <div className="w-36 shrink-0">
                          <Label className="text-[9px] font-semibold text-slate-400">{t('menus.bulkEditor.newPrice')}</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={raw ?? ''}
                            placeholder={String(item.price)}
                            onChange={(e) => setNewPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className={`h-10 font-bold ${hasNew ? 'border-emerald-400 bg-emerald-50/40 text-emerald-700' : ''}`}
                          />
                        </div>
                        {/* Per-item round up to next 10/50/100. */}
                        <div className="hidden sm:flex flex-col gap-1 shrink-0">
                          <Label className="text-[9px] font-semibold text-slate-400">{t('menus.bulkEditor.roundUpShort')}</Label>
                          <div className="flex items-center gap-1">
                            {[10, 50, 100].map(step => (
                              <Button key={step} type="button" variant="outline" size="sm" onClick={() => roundUpItem(item, step)} className="h-8 px-2 text-[10px] font-black border-slate-200">{step}</Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 md:left-16 z-40 bg-white/95 backdrop-blur border-t border-slate-200 px-6 py-3 flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500">
          {changed.length > 0
            ? <span className="text-emerald-600">{changed.length} {t('menus.bulkEditor.pendingChanges')}</span>
            : t('menus.bulkEditor.noPending')}
        </p>
        <Button onClick={save} disabled={saving || changed.length === 0} className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-8">
          {saving
            ? t('menus.bulkEditor.saving')
            : <><FloppyDisk className="w-4 h-4 mr-2" /> {scheduleEnabled ? t('menus.bulkEditor.schedule') : t('menus.bulkEditor.save')}</>}
        </Button>
      </div>
    </>
  );
}
