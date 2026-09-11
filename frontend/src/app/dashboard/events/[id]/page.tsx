'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Save, Users, Wallet, CheckCircle2, Armchair, Handshake, FileSignature, Mail, Copy, RefreshCw } from 'lucide-react';
import { useTranslation } from '@/i18n/provider';

const STAGES = ['LEAD', 'VISIT', 'QUOTE', 'CONTRACT', 'CONFIRMED', 'COMPLETED', 'CANCELED'];
const EVENT_TYPES = ['WEDDING', 'ENGAGEMENT', 'HENNA', 'CORPORATE'];
const RSVP = ['PENDING', 'YES', 'NO', 'MAYBE'];
const VENDOR_LINK_STATUS = ['PENDING', 'CONFIRMED', 'CANCELED'];

interface Installment { id: string; label: string | null; dueDate: string; amount: number; status: string; }
interface Guest { id: string; name: string; partySize: number; rsvp: string; resourceId: string | null; respondedAt?: string | null; }
interface Resource { id: string; identifier: string; capacity: number; }
interface Staff { id: string; firstName: string; lastName: string; }
interface Pkg { id: string; name: string; price: number; }
interface EventVendorLink { id: string; role: string | null; cost: number | null; status: string; vendor: { id: string; name: string; category: string; phone: string | null }; }
interface VendorRow { id: string; name: string; category: string; }

export default function EventDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(null);

  const [guestForm, setGuestForm] = useState({ name: '', partySize: '1', rsvp: 'PENDING' });
  const [instForm, setInstForm] = useState({ label: '', dueDate: '', amount: '' });
  const [planTotal, setPlanTotal] = useState('');

  // Relational picker option lists (Phase 4c).
  const [resources, setResources] = useState<Resource[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [directory, setDirectory] = useState<VendorRow[]>([]);
  const [vendorPick, setVendorPick] = useState('');

  const money = (minor: number | null | undefined) => (minor == null ? '—' : `₺${(minor / 100).toLocaleString('tr-TR')}`);
  const selectClass = 'h-10 px-2 text-sm font-bold border border-slate-200 rounded-sm bg-white';

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/events/${id}`);
      const ev = res.data.data;
      setEvent(ev);
      setForm({
        clientName: ev.clientName, clientPhone: ev.clientPhone, clientEmail: ev.clientEmail || '',
        eventType: ev.eventType, eventDate: ev.eventDate, slot: ev.slot || '',
        guestCount: String(ev.guestCount), stage: ev.stage, notes: ev.notes || '',
        quotedTotal: ev.quotedTotal != null ? String(ev.quotedTotal / 100) : '',
        coordinatorId: ev.coordinatorId || '', resourceId: ev.resourceId || '', packageId: ev.packageId || '',
        contractUrl: ev.contractUrl || '',
        venueName: ev.venueName || '', venueAddress: ev.venueAddress || '', invitationMessage: ev.invitationMessage || '',
      });
      setPlanTotal(ev.paymentPlan?.totalAmount != null ? String(ev.paymentPlan.totalAmount / 100) : '');
    } catch {
      toast.error(t('events.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  // Fetch the picker option lists once. Menu items are flattened out of the
  // nested category tree to serve as the per-person package options.
  const loadOptions = useCallback(async () => {
    try {
      const [r, s, m, v] = await Promise.all([
        api.get('/tables'), api.get('/staff'), api.get('/menus'), api.get('/vendors'),
      ]);
      setResources((r.data.data || []).map((x: any) => ({ id: x.id, identifier: x.identifier, capacity: x.capacity })));
      setStaff((s.data.data || []).map((x: any) => ({ id: x.id, firstName: x.firstName, lastName: x.lastName })));
      const items: Pkg[] = [];
      const walk = (cats: any[]) => (cats || []).forEach((c) => {
        (c.items || []).forEach((it: any) => items.push({ id: it.id, name: it.name, price: it.price }));
        if (c.children) walk(c.children);
      });
      (m.data.data || []).forEach((menu: any) => walk(menu.categories));
      setPackages(items);
      setDirectory((v.data.data || []).map((x: any) => ({ id: x.id, name: x.name, category: x.category })));
    } catch { /* pickers are optional; ignore load errors */ }
  }, []);

  useEffect(() => { if (id) { load(); loadOptions(); } }, [id, load, loadOptions]);

  const saveEvent = async () => {
    try {
      await api.put(`/events/${id}`, {
        ...form,
        guestCount: form.guestCount === '' ? 0 : parseInt(form.guestCount),
        quotedTotal: form.quotedTotal === '' ? null : Math.round(parseFloat(form.quotedTotal) * 100),
        coordinatorId: form.coordinatorId || 'none',
        resourceId: form.resourceId || 'none',
        packageId: form.packageId || 'none',
      });
      toast.success(t('common.saved'));
      load();
    } catch { toast.error(t('events.saveError')); }
  };

  const setStage = async (stage: string) => {
    setForm((f: any) => ({ ...f, stage }));
    try { await api.put(`/events/${id}`, { stage }); toast.success(t('events.stageUpdated')); load(); }
    catch { toast.error(t('events.saveError')); }
  };

  // --- Guests + seating ---
  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestForm.name) return;
    try {
      await api.post(`/events/${id}/guests`, guestForm);
      setGuestForm({ name: '', partySize: '1', rsvp: 'PENDING' });
      load();
    } catch { toast.error(t('events.saveError')); }
  };
  const patchGuest = async (guestId: string, data: any) => {
    try { await api.put(`/events/guests/${guestId}`, data); load(); } catch { toast.error(t('events.saveError')); }
  };
  const delGuest = async (guestId: string) => {
    try { await api.delete(`/events/guests/${guestId}`); load(); } catch { toast.error(t('events.saveError')); }
  };

  // --- Payment plan ---
  const savePlanTotal = async () => {
    try {
      await api.put(`/events/${id}/payment-plan`, { totalAmount: planTotal === '' ? 0 : Math.round(parseFloat(planTotal) * 100) });
      toast.success(t('common.saved')); load();
    } catch { toast.error(t('events.saveError')); }
  };
  const addInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instForm.dueDate || instForm.amount === '') return;
    try {
      await api.post(`/events/${id}/installments`, { label: instForm.label, dueDate: instForm.dueDate, amount: Math.round(parseFloat(instForm.amount) * 100) });
      setInstForm({ label: '', dueDate: '', amount: '' });
      load();
    } catch { toast.error(t('events.saveError')); }
  };
  const toggleInstallmentPaid = async (inst: Installment) => {
    try { await api.put(`/events/installments/${inst.id}`, { status: inst.status === 'PAID' ? 'PENDING' : 'PAID' }); load(); }
    catch { toast.error(t('events.saveError')); }
  };
  const delInstallment = async (instId: string) => {
    try { await api.delete(`/events/installments/${instId}`); load(); } catch { toast.error(t('events.saveError')); }
  };

  // --- Vendors ---
  const addVendor = async () => {
    if (!vendorPick) return;
    try { await api.post(`/events/${id}/vendors`, { vendorId: vendorPick }); setVendorPick(''); load(); }
    catch (err: any) { toast.error(err?.response?.data?.details?.message || t('events.saveError')); }
  };
  const patchVendor = async (linkId: string, data: any) => {
    try { await api.put(`/events/vendors/${linkId}`, data); load(); } catch { toast.error(t('events.saveError')); }
  };
  const delVendor = async (linkId: string) => {
    try { await api.delete(`/events/vendors/${linkId}`); load(); } catch { toast.error(t('events.saveError')); }
  };

  // --- Contract ---
  const markSigned = async () => {
    try {
      await api.put(`/events/${id}`, { contractUrl: form.contractUrl, contractSignedAt: event?.contractSignedAt ? null : new Date().toISOString() });
      toast.success(t('common.saved')); load();
    } catch { toast.error(t('events.saveError')); }
  };
  const markProposalSent = async () => {
    try {
      await api.put(`/events/${id}`, { proposalSentAt: event?.proposalSentAt ? null : new Date().toISOString() });
      toast.success(t('common.saved')); load();
    } catch { toast.error(t('events.saveError')); }
  };

  // --- Invitation ---
  const invitationUrl = (token: string) =>
    `${window.location.origin}/r/${event?.restaurant?.slug || 'e'}/invite/${token}`;
  const generateInvitation = async (regenerate = false) => {
    try {
      const res = await api.post(`/events/${id}/invitation`, { regenerate });
      const token = res.data.data.publicToken;
      await navigator.clipboard.writeText(invitationUrl(token)).catch(() => {});
      setEvent((e: any) => ({ ...e, publicToken: token, restaurant: e?.restaurant }));
      toast.success(t('events.linkCopied'));
      load();
    } catch { toast.error(t('events.saveError')); }
  };
  const copyInvitation = async () => {
    if (!event?.publicToken) return;
    await navigator.clipboard.writeText(invitationUrl(event.publicToken)).catch(() => {});
    toast.success(t('events.linkCopied'));
  };

  if (loading || !form) {
    return <><div className="p-6 text-sm text-slate-400">{t('common.loading')}</div></>;
  }

  const installments: Installment[] = event?.paymentPlan?.installments || [];
  const guests: Guest[] = event?.guests || [];
  const vendors: EventVendorLink[] = event?.vendors || [];
  const paidSum = installments.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0);
  const rsvpYes = guests.filter(g => g.rsvp === 'YES').reduce((s, g) => s + g.partySize, 0);
  const seatedIds = new Set(guests.filter(g => g.resourceId).map(g => g.id));
  const unseated = guests.filter(g => !g.resourceId);
  const selectedPkg = packages.find(p => p.id === form.packageId);
  const guestCountNum = parseInt(form.guestCount || '0') || 0;
  const quotePreview = selectedPkg && guestCountNum > 0 ? Math.round(selectedPkg.price * 100) * guestCountNum : null;

  return (
    <>
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
        <button onClick={() => router.push('/dashboard/events')} className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> {t('events.backToBoard')}
        </button>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{form.clientName}</h1>
            <p className="text-xs text-slate-400 font-bold">{t(`events.types.${form.eventType}`)} · {form.eventDate}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {STAGES.map(s => (
              <button key={s} onClick={() => setStage(s)}
 className={`text-[10px] font-semibold px-2 py-1 rounded-sm border ${form.stage === s ?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                {t(`events.stages.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Core details */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-semibold">{t('events.detailsTitle')}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('events.form.clientName')}><Input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })} className="h-10 text-sm font-bold" /></Field>
            <Field label={t('events.form.clientPhone')}><Input value={form.clientPhone} onChange={e => setForm({ ...form, clientPhone: e.target.value })} className="h-10 text-sm font-bold" /></Field>
            <Field label={t('events.form.clientEmail')}><Input value={form.clientEmail} onChange={e => setForm({ ...form, clientEmail: e.target.value })} className="h-10 text-sm font-bold" /></Field>
            <Field label={t('events.form.eventType')}>
              <select value={form.eventType} onChange={e => setForm({ ...form, eventType: e.target.value })} className={selectClass}>
                {EVENT_TYPES.map(x => <option key={x} value={x}>{t(`events.types.${x}`)}</option>)}
              </select>
            </Field>
            <Field label={t('events.form.date')}><Input type="date" value={form.eventDate} onChange={e => setForm({ ...form, eventDate: e.target.value })} className="h-10 text-sm font-bold" /></Field>
            <Field label={t('events.form.slot')}><Input value={form.slot} onChange={e => setForm({ ...form, slot: e.target.value })} className="h-10 text-sm font-bold" /></Field>
            <Field label={t('events.form.guestCount')}><Input type="number" min="0" value={form.guestCount} onChange={e => setForm({ ...form, guestCount: e.target.value })} className="h-10 text-sm font-bold font-mono" /></Field>

            {/* Relational pickers — names only, never raw IDs. */}
            <Field label={t('events.form.coordinator')}>
              <select value={form.coordinatorId} onChange={e => setForm({ ...form, coordinatorId: e.target.value })} className={selectClass}>
                <option value="">{t('events.none')}</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
              </select>
            </Field>
            <Field label={t('events.form.hall')}>
              <select value={form.resourceId} onChange={e => setForm({ ...form, resourceId: e.target.value })} className={selectClass}>
                <option value="">{t('events.none')}</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.identifier} · {r.capacity}</option>)}
              </select>
            </Field>
            <Field label={t('events.form.package')}>
              <select value={form.packageId} onChange={e => setForm({ ...form, packageId: e.target.value })} className={selectClass}>
                <option value="">{t('events.none')}</option>
                {packages.map(p => <option key={p.id} value={p.id}>{p.name} · ₺{p.price.toLocaleString('tr-TR')}</option>)}
              </select>
            </Field>
            <Field label={t('events.form.quotedTotal')}>
              <Input type="number" min="0" step="0.01" value={form.quotedTotal} onChange={e => setForm({ ...form, quotedTotal: e.target.value })} className="h-10 text-sm font-bold font-mono" />
              {quotePreview != null && (
                <span className="text-[10px] font-bold text-slate-400">{t('events.quotePreview')}: {money(quotePreview)} ({t('events.pricePerPerson')})</span>
              )}
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('events.form.notes')}><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="min-h-[60px] text-xs" /></Field>
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button onClick={saveEvent} className="bg-slate-900 hover:bg-slate-800"><Save className="w-4 h-4 mr-1.5" />{t('common.save')}</Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Guests */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" />{t('events.guestsTitle')}
                <Badge variant="outline" className="ml-auto text-[10px]">{t('events.rsvpConfirmed')}: {rsvpYes}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <form onSubmit={addGuest} className="flex gap-2">
                <Input value={guestForm.name} onChange={e => setGuestForm({ ...guestForm, name: e.target.value })} placeholder={t('events.form.guestName')} className="h-9 text-sm font-bold" />
                <Input type="number" min="1" value={guestForm.partySize} onChange={e => setGuestForm({ ...guestForm, partySize: e.target.value })} className="h-9 w-16 text-sm font-bold font-mono" />
                <Button type="submit" size="sm" className="h-9 shrink-0"><Plus className="w-4 h-4" /></Button>
              </form>
              <div className="space-y-1.5">
                {guests.length === 0 && <p className="text-xs text-slate-400">{t('events.noGuests')}</p>}
                {guests.map(g => (
                  <div key={g.id} className="flex items-center gap-2 border border-slate-100 rounded-sm px-2 py-1.5">
                    <span className="font-bold text-sm truncate flex-1">
                      {g.name}
                      {g.respondedAt && <span title={t('events.selfResponded')} className="ml-1 text-emerald-500">•</span>}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">×{g.partySize}</span>
                    <select value={g.rsvp} onChange={e => patchGuest(g.id, { rsvp: e.target.value })} className="h-7 text-[10px] font-bold border border-slate-200 rounded-sm bg-white">
                      {RSVP.map(r => <option key={r} value={r}>{t(`events.rsvp.${r}`)}</option>)}
                    </select>
                    <button onClick={() => delGuest(g.id)} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Payment plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="w-4 h-4" />{t('events.paymentTitle')}
                <span className="ml-auto text-[11px] font-bold text-emerald-600">{money(paidSum)} / {money(event?.paymentPlan?.totalAmount)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end">
                <Field label={t('events.planTotal')}><Input type="number" min="0" step="0.01" value={planTotal} onChange={e => setPlanTotal(e.target.value)} className="h-9 text-sm font-bold font-mono" /></Field>
                <Button onClick={savePlanTotal} size="sm" variant="outline" className="h-9">{t('common.save')}</Button>
              </div>
              <form onSubmit={addInstallment} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                <Input value={instForm.label} onChange={e => setInstForm({ ...instForm, label: e.target.value })} placeholder={t('events.installmentLabel')} className="h-9 text-sm font-bold" />
                <Input type="date" value={instForm.dueDate} onChange={e => setInstForm({ ...instForm, dueDate: e.target.value })} className="h-9 text-sm font-bold" />
                <Input type="number" min="0" step="0.01" value={instForm.amount} onChange={e => setInstForm({ ...instForm, amount: e.target.value })} placeholder="₺" className="h-9 w-24 text-sm font-bold font-mono" />
                <Button type="submit" size="sm" className="col-span-3 h-8"><Plus className="w-3.5 h-3.5 mr-1" />{t('events.addInstallment')}</Button>
              </form>
              <div className="space-y-1.5">
                {installments.length === 0 && <p className="text-xs text-slate-400">{t('events.noInstallments')}</p>}
                {installments.map(inst => (
                  <div key={inst.id} className="flex items-center gap-2 border border-slate-100 rounded-sm px-2 py-1.5">
                    <button onClick={() => toggleInstallmentPaid(inst)} title={t('events.markPaid')}>
                      <CheckCircle2 className={`w-4 h-4 ${inst.status === 'PAID' ? 'text-emerald-500' : 'text-slate-300'}`} />
                    </button>
                    <span className="font-bold text-sm truncate flex-1">{inst.label || t('events.installment')}</span>
                    <span className="text-[10px] font-bold text-slate-400">{inst.dueDate}</span>
                    <span className="text-sm font-black font-mono">{money(inst.amount)}</span>
                    <button onClick={() => delInstallment(inst.id)} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Seating (assign guests to halls/tables) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Armchair className="w-4 h-4" />{t('events.seatingTitle')}
              <Badge variant="outline" className="ml-auto text-[10px]">{seatedIds.size}/{guests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {guests.length === 0 && <p className="text-xs text-slate-400">{t('events.noGuests')}</p>}
            {guests.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {/* Unseated bucket */}
                <SeatingGroup title={t('events.unseated')} count={unseated.reduce((s, g) => s + g.partySize, 0)}>
                  {unseated.map(g => (
                    <SeatRow key={g.id} guest={g} resources={resources} onAssign={rid => patchGuest(g.id, { resourceId: rid || 'none' })} label={t('events.assignSeat')} noneLabel={t('events.none')} />
                  ))}
                  {unseated.length === 0 && <p className="text-[11px] text-slate-300">—</p>}
                </SeatingGroup>
                {/* One card per resource that has seated guests */}
                {resources.filter(r => guests.some(g => g.resourceId === r.id)).map(r => {
                  const seated = guests.filter(g => g.resourceId === r.id);
                  const used = seated.reduce((s, g) => s + g.partySize, 0);
                  const over = used > r.capacity;
                  return (
                    <SeatingGroup key={r.id} title={r.identifier} count={used} capacity={r.capacity} over={over}>
                      {seated.map(g => (
                        <SeatRow key={g.id} guest={g} resources={resources} onAssign={rid => patchGuest(g.id, { resourceId: rid || 'none' })} label={t('events.assignSeat')} noneLabel={t('events.none')} />
                      ))}
                    </SeatingGroup>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vendors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Handshake className="w-4 h-4" />{t('events.vendorsTitle')}
              <button onClick={() => router.push('/dashboard/vendors')} className="ml-auto text-[10px] font-bold text-blue-500 hover:underline">{t('events.manageVendors')}</button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <select value={vendorPick} onChange={e => setVendorPick(e.target.value)} className={`${selectClass} flex-1`}>
                <option value="">{t('events.selectVendor')}</option>
                {directory.filter(d => !vendors.some(v => v.vendor.id === d.id)).map(d => (
                  <option key={d.id} value={d.id}>{d.name} · {t(`vendors.categories.${d.category}`)}</option>
                ))}
              </select>
              <Button onClick={addVendor} size="sm" className="h-10 shrink-0" disabled={!vendorPick}><Plus className="w-4 h-4 mr-1" />{t('events.addVendor')}</Button>
            </div>
            <div className="space-y-1.5">
              {vendors.length === 0 && <p className="text-xs text-slate-400">{t('events.noVendors')}</p>}
              {vendors.map(v => (
                <div key={v.id} className="flex items-center gap-2 border border-slate-100 rounded-sm px-2 py-1.5 flex-wrap">
                  <span className="font-bold text-sm truncate flex-1 min-w-[120px]">{v.vendor.name}
                    <span className="ml-1.5 text-[10px] font-bold text-slate-400">{t(`vendors.categories.${v.vendor.category}`)}</span>
                  </span>
                  <Input defaultValue={v.role || ''} onBlur={e => e.target.value !== (v.role || '') && patchVendor(v.id, { role: e.target.value })} placeholder={t('events.vendorRole')} className="h-8 w-28 text-xs font-bold" />
                  <Input type="number" min="0" step="0.01" defaultValue={v.cost != null ? String(v.cost / 100) : ''} onBlur={e => patchVendor(v.id, { cost: e.target.value === '' ? null : Math.round(parseFloat(e.target.value) * 100) })} placeholder="₺" className="h-8 w-20 text-xs font-bold font-mono" />
                  <select value={v.status} onChange={e => patchVendor(v.id, { status: e.target.value })} className="h-8 text-[10px] font-bold border border-slate-200 rounded-sm bg-white">
                    {VENDOR_LINK_STATUS.map(s => <option key={s} value={s}>{t(`events.vendorStatuses.${s}`)}</option>)}
                  </select>
                  <button onClick={() => delVendor(v.id)} className="text-slate-300 hover:text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contract / proposal */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><FileSignature className="w-4 h-4" />{t('events.contractTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label={t('events.contractUrl')}>
                <Input value={form.contractUrl} onChange={e => setForm({ ...form, contractUrl: e.target.value })} placeholder="https://…" className="h-9 text-sm font-bold" />
              </Field>
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={markSigned} size="sm" variant={event?.contractSignedAt ? 'default' : 'outline'} className="h-9">
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  {event?.contractSignedAt ? `${t('events.signed')} · ${new Date(event.contractSignedAt).toLocaleDateString()}` : t('events.markSigned')}
                </Button>
                <Button onClick={markProposalSent} size="sm" variant={event?.proposalSentAt ? 'default' : 'outline'} className="h-9">
                  {event?.proposalSentAt ? `${t('events.proposalSent')} · ${new Date(event.proposalSentAt).toLocaleDateString()}` : t('events.markProposalSent')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Invitation microsite */}
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Mail className="w-4 h-4" />{t('events.invitationTitle')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-[11px] text-slate-400 font-bold">{t('events.invitationHint')}</p>
              <Field label={t('events.form.venueName')}><Input value={form.venueName} onChange={e => setForm({ ...form, venueName: e.target.value })} className="h-9 text-sm font-bold" /></Field>
              <Field label={t('events.form.venueAddress')}><Input value={form.venueAddress} onChange={e => setForm({ ...form, venueAddress: e.target.value })} className="h-9 text-sm font-bold" /></Field>
              <Field label={t('events.form.invitationMessage')}><Textarea value={form.invitationMessage} onChange={e => setForm({ ...form, invitationMessage: e.target.value })} className="min-h-[52px] text-xs" /></Field>
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={saveEvent} size="sm" variant="outline" className="h-9"><Save className="w-4 h-4 mr-1.5" />{t('common.save')}</Button>
                {event?.publicToken ? (
                  <>
                    <Button onClick={copyInvitation} size="sm" className="h-9"><Copy className="w-4 h-4 mr-1.5" />{t('events.copyLink')}</Button>
                    <Button onClick={() => generateInvitation(true)} size="sm" variant="ghost" className="h-9" title={t('events.regenerate')}><RefreshCw className="w-4 h-4" /></Button>
                  </>
                ) : (
                  <Button onClick={() => generateInvitation(false)} size="sm" className="h-9"><Mail className="w-4 h-4 mr-1.5" />{t('events.generateLink')}</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[10px] font-semibold text-slate-400">{label}</Label>
      {children}
    </div>
  );
}

function SeatingGroup({ title, count, capacity, over, children }: { title: string; count: number; capacity?: number; over?: boolean; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-md p-2.5 space-y-1.5 bg-slate-50/50">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold truncate">{title}</span>
        <span className={`text-[10px] font-black font-mono ${over ? 'text-rose-500' : 'text-slate-400'}`}>{count}{capacity != null ? `/${capacity}` : ''}</span>
      </div>
      {children}
    </div>
  );
}

function SeatRow({ guest, resources, onAssign, label, noneLabel }: { guest: Guest; resources: Resource[]; onAssign: (rid: string) => void; label: string; noneLabel: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-bold truncate flex-1">{guest.name} <span className="text-[10px] text-slate-400">×{guest.partySize}</span></span>
      <select value={guest.resourceId || ''} onChange={e => onAssign(e.target.value)} title={label} className="h-7 max-w-[110px] text-[10px] font-bold border border-slate-200 rounded-sm bg-white">
        <option value="">{noneLabel}</option>
        {resources.map(r => <option key={r.id} value={r.id}>{r.identifier}</option>)}
      </select>
    </div>
  );
}
