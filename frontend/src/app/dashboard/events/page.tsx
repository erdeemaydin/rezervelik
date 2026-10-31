'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Users, CalendarDays, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/i18n/provider';

const STAGES = ['LEAD', 'VISIT', 'QUOTE', 'CONTRACT', 'CONFIRMED', 'COMPLETED', 'CANCELED'];
const EVENT_TYPES = ['WEDDING', 'ENGAGEMENT', 'HENNA', 'CORPORATE'];

const STAGE_COLORS: Record<string, string> = {
  LEAD: 'bg-slate-100 text-slate-700',
  VISIT: 'bg-sky-100 text-sky-700',
  QUOTE: 'bg-indigo-100 text-indigo-700',
  CONTRACT: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-teal-100 text-teal-700',
  CANCELED: 'bg-rose-100 text-rose-700',
};

interface EventRow {
  id: string;
  clientName: string;
  eventType: string;
  eventDate: string;
  guestCount: number;
  stage: string;
  quotedTotal: number | null;
  coordinator?: { firstName: string; lastName: string } | null;
  resource?: { identifier: string } | null;
  _count?: { guests: number };
}

export default function EventsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    clientName: '', clientPhone: '', clientEmail: '', eventType: 'WEDDING',
    eventDate: '', slot: '', guestCount: '', stage: 'LEAD', notes: '',
  });

  const load = useCallback(async () => {
    try {
      const res = await api.get('/events');
      setEvents(res.data.data || []);
    } catch {
      toast.error(t('events.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const money = (minor: number | null | undefined) =>
    minor == null ? '—' : `₺${(minor / 100).toLocaleString('tr-TR')}`;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientName || !form.clientPhone || !form.eventDate) {
      toast.error(t('events.missingFields'));
      return;
    }
    try {
      await api.post('/events', form);
      toast.success(t('events.created'));
      setIsOpen(false);
      setForm({ clientName: '', clientPhone: '', clientEmail: '', eventType: 'WEDDING', eventDate: '', slot: '', guestCount: '', stage: 'LEAD', notes: '' });
      load();
    } catch {
      toast.error(t('events.saveError'));
    }
  };

  const selectClass = 'h-10 px-2 text-sm font-bold border border-slate-200 rounded-sm bg-white w-full';

  return (
    <>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{t('events.title')}</h1>
            <p className="text-xs text-slate-400 font-bold uppercase">{t('events.subtitle')}</p>
          </div>
          <Button onClick={() => setIsOpen(true)} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="w-4 h-4 mr-1.5" /> {t('events.new')}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400">{t('common.loading')}</p>
        ) : events.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-md p-10 text-center">
            <p className="text-sm font-bold text-slate-500">{t('events.empty')}</p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map(stage => {
              const col = events.filter(ev => ev.stage === stage);
              return (
                <div key={stage} className="min-w-[240px] w-[240px] flex-shrink-0">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <Badge className={`${STAGE_COLORS[stage]} border-0 text-[10px] font-black uppercase`}>{t(`events.stages.${stage}`)}</Badge>
                    <span className="text-xs font-black text-slate-400">{col.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.map(ev => (
                      <button
                        key={ev.id}
                        onClick={() => router.push(`/dashboard/events/${ev.id}`)}
                        className="w-full text-left bg-white border border-slate-200 rounded-sm p-3 hover:border-slate-400 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-sm truncate">{ev.clientName}</span>
                          <Badge variant="outline" className="text-[8px] px-1 h-4 shrink-0">{t(`events.types.${ev.eventType}`)}</Badge>
                        </div>
                        <div className="mt-2 space-y-1 text-[11px] font-bold text-slate-500">
                          <div className="flex items-center gap-1.5"><CalendarDays className="w-3 h-3" />{ev.eventDate}{ev.resource ? ` · ${ev.resource.identifier}` : ''}</div>
                          <div className="flex items-center gap-1.5"><Users className="w-3 h-3" />{ev.guestCount} · {ev._count?.guests ?? 0} {t('events.guestsShort')}</div>
                          <div className="flex items-center gap-1.5"><Wallet className="w-3 h-3" />{money(ev.quotedTotal)}</div>
                        </div>
                        {ev.coordinator && (
                          <p className="mt-1.5 text-[10px] font-bold text-slate-400 uppercase truncate">{ev.coordinator.firstName} {ev.coordinator.lastName}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="p-0 rounded-md">
          <div className="bg-slate-900 p-4 text-white">
            <DialogHeader><DialogTitle className="text-sm font-bold uppercase tracking-widest">{t('events.new')}</DialogTitle></DialogHeader>
          </div>
          <form onSubmit={handleCreate} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.clientName')}</Label>
              <Input required value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} className="h-10 text-sm font-bold" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.clientPhone')}</Label>
                <Input required value={form.clientPhone} onChange={e => setForm({ ...form, clientPhone: e.target.value })} className="h-10 text-sm font-bold" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.clientEmail')}</Label>
                <Input type="email" value={form.clientEmail} onChange={e => setForm({ ...form, clientEmail: e.target.value })} className="h-10 text-sm font-bold" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.eventType')}</Label>
                <select value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value })} className={selectClass}>
                  {EVENT_TYPES.map(x => <option key={x} value={x}>{t(`events.types.${x}`)}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.stage')}</Label>
                <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })} className={selectClass}>
                  {STAGES.map(x => <option key={x} value={x}>{t(`events.stages.${x}`)}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.date')}</Label>
                <Input required type="date" value={form.eventDate} onChange={e => setForm({ ...form, eventDate: e.target.value })} className="h-10 text-sm font-bold" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.slot')}</Label>
                <Input value={form.slot} onChange={e => setForm({ ...form, slot: e.target.value })} placeholder={t('events.form.slotPlaceholder')} className="h-10 text-sm font-bold" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.guestCount')}</Label>
                <Input type="number" min="0" value={form.guestCount} onChange={e => setForm({ ...form, guestCount: e.target.value })} className="h-10 text-sm font-bold font-mono" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400">{t('events.form.notes')}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="min-h-[60px] text-xs" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} className="text-xs font-bold">{t('common.cancel')}</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-xs font-black uppercase px-6">{t('common.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
