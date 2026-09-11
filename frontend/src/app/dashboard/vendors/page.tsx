'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Plus, Trash, Handshake, Phone, Envelope, Pencil } from '@phosphor-icons/react';
import { useTranslation } from '@/i18n/provider';

const CATEGORIES = ['PHOTOGRAPHER', 'VIDEOGRAPHER', 'DJ', 'MUSIC', 'FLORIST', 'CATERING', 'DECOR', 'TRANSPORT', 'CAKE', 'OTHER'];

interface Vendor {
  id: string; name: string; category: string;
  contactName: string | null; phone: string | null; email: string | null; notes: string | null;
  _count?: { eventVendors: number };
}

const emptyForm = { name: '', category: 'PHOTOGRAPHER', contactName: '', phone: '', email: '', notes: '' };

export default function VendorsPage() {
  const { t } = useTranslation();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/vendors');
      setVendors(res.data.data || []);
    } catch { toast.error(t('vendors.loadError')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditId(null); setForm(emptyForm); setIsOpen(true); };
  const openEdit = (v: Vendor) => {
    setEditId(v.id);
    setForm({ name: v.name, category: v.category, contactName: v.contactName || '', phone: v.phone || '', email: v.email || '', notes: v.notes || '' });
    setIsOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    try {
      if (editId) await api.put(`/vendors/${editId}`, form);
      else await api.post('/vendors', form);
      toast.success(t('common.saved'));
      setIsOpen(false);
      load();
    } catch { toast.error(t('vendors.saveError')); }
  };

  const del = async (id: string) => {
    if (!confirm(t('vendors.deleteConfirm'))) return;
    try { await api.delete(`/vendors/${id}`); load(); } catch { toast.error(t('vendors.saveError')); }
  };

  const shown = filter ? vendors.filter(v => v.category === filter) : vendors;

  return (
    <>
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2 font-heading"><Handshake className="w-6 h-6" />{t('vendors.title')}</h1>
            <p className="text-xs text-slate-400 font-bold">{t('vendors.subtitle')}</p>
          </div>
          <Button onClick={openCreate} className="bg-slate-900 hover:bg-slate-800"><Plus className="w-4 h-4 mr-1.5" />{t('vendors.add')}</Button>
        </div>

        <div className="flex gap-1.5 flex-wrap">
 <button onClick={() => setFilter('')} className={`text-[10px] font-semibold px-2 py-1 rounded-sm border transition-colors ${filter ===''?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-500 border-border hover:bg-slate-50 hover:border-ring'}`}>{t('vendors.all')}</button>
          {CATEGORIES.map(c => (
 <button key={c} onClick={() => setFilter(c)} className={`text-[10px] font-semibold px-2 py-1 rounded-sm border transition-colors ${filter === c ?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-500 border-border hover:bg-slate-50 hover:border-ring'}`}>{t(`vendors.categories.${c}`)}</button>
          ))}
        </div>

        {loading ? <p className="text-sm text-slate-400">{t('common.loading')}</p> : shown.length === 0 ? (
          <Card><CardContent className="py-10 text-center flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <Handshake className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm text-slate-400">{t('vendors.empty')}</p>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shown.map(v => (
              <Card key={v.id} className="group">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-black text-sm truncate">{v.name}</h3>
                      <span className="text-[10px] font-semibold text-blue-500">{t(`vendors.categories.${v.category}`)}</span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(v)} className="text-slate-300 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => del(v.id)} className="text-slate-300 hover:text-rose-500"><Trash className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  {v.contactName && <p className="text-xs font-bold text-slate-600">{v.contactName}</p>}
                  {v.phone && <p className="text-[11px] text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{v.phone}</p>}
                  {v.email && <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate"><Envelope className="w-3 h-3" />{v.email}</p>}
                  {!!v._count?.eventVendors && <p className="text-[10px] font-bold text-slate-400 pt-1">{v._count.eventVendors} {t('vendors.eventsWord')}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? t('vendors.editTitle') : t('vendors.add')}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-semibold text-slate-400">{t('vendors.name')}</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-10 text-sm font-bold" required />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-semibold text-slate-400">{t('vendors.category')}</Label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="h-10 px-2 text-sm font-bold border border-border rounded-sm bg-white transition-colors outline-none hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
                {CATEGORIES.map(c => <option key={c} value={c}>{t(`vendors.categories.${c}`)}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold text-slate-400">{t('vendors.contactName')}</Label>
                <Input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className="h-10 text-sm font-bold" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold text-slate-400">{t('vendors.phone')}</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-10 text-sm font-bold" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-semibold text-slate-400">{t('vendors.email')}</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="h-10 text-sm font-bold" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-[10px] font-semibold text-slate-400">{t('vendors.notes')}</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="min-h-[52px] text-xs" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800">{t('common.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
