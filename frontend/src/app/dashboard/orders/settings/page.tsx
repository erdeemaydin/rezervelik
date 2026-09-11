'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TimeSelect } from '@/components/ui/time-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ArrowLeft, FloppyDisk, Power, Truck, ShoppingBag, Wallet, CreditCard, Gauge, Clock, MapPinArea, Plus, PencilSimple, Trash } from '@phosphor-icons/react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/provider';

// --- Weekly hours (shared shape for OrderSettings.orderHours and
// DeliveryZone.openHours — both are untyped Json? columns; no existing
// per-day-hours UI convention elsewhere in this codebase to match, so this is
// a small, self-contained editor built for this page only). ---
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type DayKey = typeof DAY_KEYS[number];
type DayHours = { closed: boolean; open: string; close: string };
type WeekHours = Record<DayKey, DayHours>;

const defaultDayHours = (): DayHours => ({ closed: false, open: '09:00', close: '22:00' });
const defaultWeekHours = (): WeekHours =>
  Object.fromEntries(DAY_KEYS.map((d) => [d, defaultDayHours()])) as WeekHours;

const parseWeekHours = (raw: unknown): WeekHours => {
  const base = defaultWeekHours();
  if (raw && typeof raw === 'object') {
    for (const d of DAY_KEYS) {
      const v = (raw as any)[d];
      if (v && typeof v === 'object') {
        base[d] = {
          closed: !!v.closed,
          open: typeof v.open === 'string' ? v.open : base[d].open,
          close: typeof v.close === 'string' ? v.close : base[d].close,
        };
      }
    }
  }
  return base;
};

function WeeklyHoursEditor({ value, onChange }: { value: WeekHours; onChange: (v: WeekHours) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {DAY_KEYS.map((d) => (
        <div key={d} className="flex items-center gap-3 rounded-md border border-border bg-slate-50/50 p-2">
          <span className="w-24 shrink-0 text-[10px] font-semibold text-slate-500">{t(`orders.settings.hours.days.${d}`)}</span>
          <Switch
            checked={!value[d].closed}
            onCheckedChange={(checked) => onChange({ ...value, [d]: { ...value[d], closed: !checked } })}
          />
          {value[d].closed ? (
            <span className="text-[10px] font-bold text-slate-400">{t('orders.settings.hours.closed')}</span>
          ) : (
            <div className="flex items-center gap-2 flex-1">
              <TimeSelect value={value[d].open} onChange={(v) => onChange({ ...value, [d]: { ...value[d], open: v } })} className="h-8 text-xs font-bold flex-1" />
              <span className="text-[10px] text-slate-300 font-black">–</span>
              <TimeSelect value={value[d].close} onChange={(v) => onChange({ ...value, [d]: { ...value[d], close: v } })} className="h-8 text-xs font-bold flex-1" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface OrderSettingsForm {
  onlineOrderingOpen: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  cashOnDeliveryEnabled: boolean;
  onlineCardEnabled: boolean;
  maxConcurrentOrders: string; // '' = unlimited
  prepTimeMinutes: string;
  orderHours: WeekHours;
}

interface DeliveryZone {
  id: string;
  name: string;
  matchType: 'RADIUS' | 'AREA';
  radiusMeters: number | null;
  deliveryFee: number;
  minOrderAmount: number;
  isActive: boolean;
  openHours: unknown;
}

export default function OrderSettingsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const confirm = useConfirm();

  // --- General order settings ---
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrderSettingsForm>({
    onlineOrderingOpen: true,
    deliveryEnabled: true,
    pickupEnabled: true,
    cashOnDeliveryEnabled: true,
    onlineCardEnabled: false,
    maxConcurrentOrders: '',
    prepTimeMinutes: '20',
    orderHours: defaultWeekHours(),
  });

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/orders/order-settings');
      const s = res.data.data;
      setForm({
        onlineOrderingOpen: s.onlineOrderingOpen ?? true,
        deliveryEnabled: s.deliveryEnabled ?? true,
        pickupEnabled: s.pickupEnabled ?? true,
        cashOnDeliveryEnabled: s.cashOnDeliveryEnabled ?? true,
        onlineCardEnabled: s.onlineCardEnabled ?? false,
        maxConcurrentOrders: s.maxConcurrentOrders != null ? String(s.maxConcurrentOrders) : '',
        prepTimeMinutes: s.prepTimeMinutes != null ? String(s.prepTimeMinutes) : '20',
        orderHours: parseWeekHours(s.orderHours),
      });
    } catch (err) {
      toast.error(t('orders.settings.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      // onlineCardEnabled is intentionally omitted here — see the disabled
      // toggle below. There's no payment-gateway integration yet (Phase 2 of
      // docs/packaging/online-ordering-plan.md), so this page never sends a
      // value for it and the backend leaves whatever it already had
      // untouched (undefined fields are no-ops in orderController.updateOrderSettings).
      await api.put('/orders/order-settings', {
        onlineOrderingOpen: form.onlineOrderingOpen,
        deliveryEnabled: form.deliveryEnabled,
        pickupEnabled: form.pickupEnabled,
        cashOnDeliveryEnabled: form.cashOnDeliveryEnabled,
        maxConcurrentOrders: form.maxConcurrentOrders === '' ? null : Number(form.maxConcurrentOrders),
        // `|| 20` would silently discard a legitimate 0 (the field allows
        // min="0" to disable the buffer) since 0 is falsy — only fall back
        // to 20 when the field is genuinely empty/non-numeric.
        prepTimeMinutes: form.prepTimeMinutes !== '' && !Number.isNaN(Number(form.prepTimeMinutes)) ? Number(form.prepTimeMinutes) : 20,
        orderHours: form.orderHours,
      });
      toast.success(t('orders.settings.saved'));
    } catch (err) {
      toast.error(t('orders.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  // --- Delivery zones ---
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editZoneId, setEditZoneId] = useState<string | null>(null);
  const [savingZone, setSavingZone] = useState(false);
  const [zoneForm, setZoneForm] = useState({
    name: '', matchType: 'RADIUS' as 'RADIUS' | 'AREA', radiusMeters: '1500',
    deliveryFee: '0', minOrderAmount: '0', isActive: true, openHours: defaultWeekHours(),
  });

  const fetchZones = useCallback(async () => {
    try {
      setLoadingZones(true);
      const res = await api.get('/orders/delivery-zones');
      setZones(res.data.data);
    } catch (err) {
      toast.error(t('orders.settings.zones.toast.loadFailed'));
    } finally {
      setLoadingZones(false);
    }
  }, [t]);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const openCreateZone = () => {
    setEditZoneId(null);
    setZoneForm({ name: '', matchType: 'RADIUS', radiusMeters: '1500', deliveryFee: '0', minOrderAmount: '0', isActive: true, openHours: defaultWeekHours() });
    setZoneDialogOpen(true);
  };

  const openEditZone = (z: DeliveryZone) => {
    setEditZoneId(z.id);
    setZoneForm({
      name: z.name,
      matchType: z.matchType,
      radiusMeters: z.radiusMeters != null ? String(z.radiusMeters) : '1500',
      deliveryFee: String(z.deliveryFee),
      minOrderAmount: String(z.minOrderAmount),
      isActive: z.isActive,
      openHours: parseWeekHours(z.openHours),
    });
    setZoneDialogOpen(true);
  };

  const handleZoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingZone) return;
    setSavingZone(true);
    try {
      const payload = {
        name: zoneForm.name,
        matchType: zoneForm.matchType,
        radiusMeters: zoneForm.matchType === 'RADIUS' ? Number(zoneForm.radiusMeters) || 0 : undefined,
        deliveryFee: Number(zoneForm.deliveryFee) || 0,
        minOrderAmount: Number(zoneForm.minOrderAmount) || 0,
        isActive: zoneForm.isActive,
        openHours: zoneForm.openHours,
      };
      if (editZoneId) {
        await api.put(`/orders/delivery-zones/${editZoneId}`, payload);
        toast.success(t('orders.settings.zones.toast.updated'));
      } else {
        await api.post('/orders/delivery-zones', payload);
        toast.success(t('orders.settings.zones.toast.created'));
      }
      setZoneDialogOpen(false);
      fetchZones();
    } catch (err) {
      toast.error(t('orders.settings.zones.toast.saveFailed'));
    } finally {
      setSavingZone(false);
    }
  };

  const toggleZoneActive = async (z: DeliveryZone, isActive: boolean) => {
    // Optimistic — matches the immediate-feedback expectation of a list toggle.
    setZones((prev) => prev.map((zone) => (zone.id === z.id ? { ...zone, isActive } : zone)));
    try {
      await api.put(`/orders/delivery-zones/${z.id}`, { isActive });
    } catch (err) {
      toast.error(t('orders.settings.zones.toast.saveFailed'));
      fetchZones();
    }
  };

  const handleDeleteZone = async (z: DeliveryZone) => {
    const ok = await confirm({
      title: t('orders.settings.zones.confirm.deleteTitle'),
      details: [{ label: t('orders.settings.zones.dialog.name'), value: z.name }],
      tone: 'danger',
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
    });
    if (!ok) return;
    try {
      await api.delete(`/orders/delivery-zones/${z.id}`);
      toast.success(t('orders.settings.zones.toast.deleted'));
      fetchZones();
    } catch (err) {
      toast.error(t('orders.settings.zones.toast.deleteFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/orders')} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t('orders.settings.title')}</h1>
          <p className="text-[10px] text-slate-400 font-semibold tracking-[0.2em] mt-1 italic">{t('orders.settings.subtitle')}</p>
        </div>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="bg-slate-100/50">
          <TabsTrigger value="general" className="text-xs font-bold">{t('orders.settings.tabs.general')}</TabsTrigger>
          <TabsTrigger value="zones" className="text-xs font-bold"><MapPinArea className="w-3.5 h-3.5 mr-1.5" /> {t('orders.settings.tabs.zones')}</TabsTrigger>
        </TabsList>

        {/* ---- GENERAL ---- */}
        <TabsContent value="general" className="mt-4 space-y-4">
          {/* Kill switch — the most important control on this page, deliberately
              the loudest element (per the task brief: "make this visually
              prominent, it's the turn-ordering-off-right-now control"). */}
          <Card className={cn('rounded-md border-2 shadow-sm overflow-hidden transition-colors', form.onlineOrderingOpen ? 'border-emerald-300 bg-emerald-50/50' : 'border-red-300 bg-red-50/50')}>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={cn('w-11 h-11 rounded-full flex items-center justify-center shrink-0', form.onlineOrderingOpen ? 'bg-emerald-500' : 'bg-red-500')}>
                  <Power className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight text-slate-800">{t('orders.settings.killSwitch.title')}</span>
 <Badge className={cn('text-[9px] font-semibold px-2 border-0', form.onlineOrderingOpen ?'bg-emerald-500 text-white':'bg-red-500 text-white')}>
                      {form.onlineOrderingOpen ? t('orders.settings.killSwitch.statusOpen') : t('orders.settings.killSwitch.statusClosed')}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1 max-w-md">
                    {form.onlineOrderingOpen ? t('orders.settings.killSwitch.descOpen') : t('orders.settings.killSwitch.descClosed')}
                  </p>
                </div>
              </div>
              <Switch checked={form.onlineOrderingOpen} onCheckedChange={(c) => setForm((f) => ({ ...f, onlineOrderingOpen: c }))} className="scale-125" />
            </CardContent>
          </Card>

          <Card className="rounded-md border-border shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-border">
              <span className="text-xs font-semibold text-slate-700">{t('orders.settings.fulfillment.title')}</span>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between p-3 border border-border rounded-md bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="text-xs font-black text-slate-700">{t('orders.settings.fulfillment.delivery')}</div>
                    <div className="text-[10px] text-slate-400 font-bold">{t('orders.settings.fulfillment.deliveryDesc')}</div>
                  </div>
                </div>
                <Switch checked={form.deliveryEnabled} onCheckedChange={(c) => setForm((f) => ({ ...f, deliveryEnabled: c }))} />
              </div>
              <div className="flex items-center justify-between p-3 border border-border rounded-md bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <ShoppingBag className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="text-xs font-black text-slate-700">{t('orders.settings.fulfillment.pickup')}</div>
                    <div className="text-[10px] text-slate-400 font-bold">{t('orders.settings.fulfillment.pickupDesc')}</div>
                  </div>
                </div>
                <Switch checked={form.pickupEnabled} onCheckedChange={(c) => setForm((f) => ({ ...f, pickupEnabled: c }))} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md border-border shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-border">
              <span className="text-xs font-semibold text-slate-700">{t('orders.settings.payment.title')}</span>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between p-3 border border-border rounded-md bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <Wallet className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="text-xs font-black text-slate-700">{t('orders.settings.payment.cod')}</div>
                    <div className="text-[10px] text-slate-400 font-bold">{t('orders.settings.payment.codDesc')}</div>
                  </div>
                </div>
                <Switch checked={form.cashOnDeliveryEnabled} onCheckedChange={(c) => setForm((f) => ({ ...f, cashOnDeliveryEnabled: c }))} />
              </div>
              {/* Online card is Phase 2 (marketplace sub-merchant payment gateway,
                  see docs/packaging/online-ordering-plan.md) — nothing processes
                  a card today. OrderSettings.onlineCardEnabled and
                  customerOrderController both technically allow flipping this on
                  right now, which would let a customer choose ONLINE_CARD at
                  checkout and get an order stuck UNPAID forever with no way to
                  actually collect payment. Locking the toggle off here (rather
                  than hiding it) documents the capability exists but isn't
                  wired up yet, and the settings PUT never sends this field so
                  it can't be silently flipped on through this page either. */}
              <div className="flex items-center justify-between p-3 border border-border rounded-md bg-slate-50/50 opacity-70">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-500">{t('orders.settings.payment.card')}</span>
                      <Badge variant="outline" className="text-[8px] font-semibold border-amber-200 bg-amber-50 text-amber-700">{t('orders.settings.payment.comingSoon')}</Badge>
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold max-w-sm">{t('orders.settings.payment.cardHint')}</div>
                  </div>
                </div>
                <Switch checked={false} disabled />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md border-border shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-border">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-2"><Gauge className="w-4 h-4 text-blue-500" /> {t('orders.settings.capacity.title')}</span>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold text-slate-400">{t('orders.settings.capacity.maxConcurrent')}</Label>
                <Input type="number" min="0" placeholder={t('orders.settings.capacity.maxConcurrentHint')} value={form.maxConcurrentOrders} onChange={(e) => setForm((f) => ({ ...f, maxConcurrentOrders: e.target.value }))} className="h-10 text-sm font-bold border-border rounded-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold text-slate-400">{t('orders.settings.capacity.prepTime')}</Label>
                <Input type="number" min="0" value={form.prepTimeMinutes} onChange={(e) => setForm((f) => ({ ...f, prepTimeMinutes: e.target.value }))} className="h-10 text-sm font-bold border-border rounded-sm" />
                <span className="text-[9px] text-slate-400 font-bold">{t('orders.settings.capacity.prepTimeHint')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md border-border shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-border">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500" /> {t('orders.settings.hours.title')}</span>
              <p className="text-[10px] text-slate-400 font-bold mt-1">{t('orders.settings.hours.desc')}</p>
            </CardHeader>
            <CardContent className="p-4">
              <WeeklyHoursEditor value={form.orderHours} onChange={(v) => setForm((f) => ({ ...f, orderHours: v }))} />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={saving || loading} className="h-11 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-8 rounded-sm shadow-lg shadow-blue-600/20 disabled:opacity-60">
              <FloppyDisk className="w-4 h-4 mr-2" /> {saving ? t('common.loading') : t('orders.settings.saveBtn')}
            </Button>
          </div>
        </TabsContent>

        {/* ---- DELIVERY ZONES ---- */}
        <TabsContent value="zones" className="mt-4">
          <Card className="rounded-md border-border shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-border flex flex-row items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">{t('orders.settings.zones.title')}</span>
              <Button size="sm" onClick={openCreateZone} className="bg-blue-600 hover:bg-blue-700 text-white rounded-sm h-9 px-4 font-semibold text-[10px] shadow-md shadow-blue-600/20">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> {t('orders.settings.zones.addBtn')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="h-9 border-b border-border">
                    <TableHead className="text-[9px] font-semibold text-slate-400 px-6">{t('orders.settings.zones.table.name')}</TableHead>
                    <TableHead className="text-[9px] font-semibold text-slate-400">{t('orders.settings.zones.table.matchType')}</TableHead>
                    <TableHead className="text-[9px] font-semibold text-slate-400 text-right">{t('orders.settings.zones.table.fee')}</TableHead>
                    <TableHead className="text-[9px] font-semibold text-slate-400 text-right">{t('orders.settings.zones.table.minOrder')}</TableHead>
                    <TableHead className="text-[9px] font-semibold text-slate-400 text-center">{t('orders.settings.zones.table.active')}</TableHead>
                    <TableHead className="text-[9px] font-semibold text-slate-400 text-right px-6">{t('orders.settings.zones.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingZones ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center text-[10px] font-semibold text-slate-400">{t('orders.settings.zones.table.loading')}</TableCell></TableRow>
                  ) : zones.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center text-[10px] font-semibold text-slate-400">{t('orders.settings.zones.table.noZones')}</TableCell></TableRow>
                  ) : zones.map((z) => (
                    <TableRow key={z.id} className="h-14 hover:bg-slate-50/50 border-b border-border transition-colors">
                      <TableCell className="px-6 py-3 font-black text-slate-900 text-sm">{z.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] font-semibold border-border bg-white text-slate-600">{t(`orders.settings.zones.matchType.${z.matchType}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-700 text-xs">{z.deliveryFee}</TableCell>
                      <TableCell className="text-right font-bold text-slate-700 text-xs">{z.minOrderAmount}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={z.isActive} onCheckedChange={(c) => toggleZoneActive(z, c)} />
                      </TableCell>
                      <TableCell className="px-6 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditZone(z)} className="h-7 w-7 text-slate-300 hover:text-blue-600"><PencilSimple className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteZone(z)} className="h-7 w-7 text-slate-300 hover:text-red-600"><Trash className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- ZONE DIALOG ---- */}
      <Dialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen}>
        <DialogContent maxWidth="sm:max-w-lg" className="p-0 rounded-md border-0 shadow-2xl">
          <form onSubmit={handleZoneSubmit}>
            <div className="bg-slate-900 p-4 text-white">
              <DialogHeader>
                <DialogTitle className="text-sm font-bold">
                  {editZoneId ? t('orders.settings.zones.dialog.editTitle') : t('orders.settings.zones.dialog.createTitle')}
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="p-6 space-y-4 bg-white max-h-[65vh] overflow-y-auto">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold text-slate-400 ml-1">{t('orders.settings.zones.dialog.name')}</Label>
                <Input required value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder={t('orders.settings.zones.dialog.namePlaceholder')} className="h-10 text-sm font-bold border-border rounded-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-semibold text-slate-400 ml-1">{t('orders.settings.zones.dialog.matchType')}</Label>
                  <Select value={zoneForm.matchType} onValueChange={(v) => { if (v) setZoneForm({ ...zoneForm, matchType: v as 'RADIUS' | 'AREA' }); }}>
                    <SelectTrigger className="h-10 text-sm font-bold rounded-sm border-border focus:ring-0 shadow-none">
                      <SelectValue>{t(`orders.settings.zones.matchType.${zoneForm.matchType}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RADIUS" className="text-xs">{t('orders.settings.zones.matchType.RADIUS')}</SelectItem>
                      <SelectItem value="AREA" className="text-xs">{t('orders.settings.zones.matchType.AREA')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {zoneForm.matchType === 'RADIUS' && (
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-semibold text-slate-400 ml-1">{t('orders.settings.zones.dialog.radiusMeters')}</Label>
                    <Input type="number" min="0" value={zoneForm.radiusMeters} onChange={(e) => setZoneForm({ ...zoneForm, radiusMeters: e.target.value })} className="h-10 text-sm font-bold border-border rounded-sm font-mono" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-semibold text-slate-400 ml-1">{t('orders.settings.zones.dialog.deliveryFee')}</Label>
                  <Input type="number" min="0" step="0.01" required value={zoneForm.deliveryFee} onChange={(e) => setZoneForm({ ...zoneForm, deliveryFee: e.target.value })} className="h-10 text-sm font-bold border-border rounded-sm font-mono" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-semibold text-slate-400 ml-1">{t('orders.settings.zones.dialog.minOrderAmount')}</Label>
                  <Input type="number" min="0" step="0.01" value={zoneForm.minOrderAmount} onChange={(e) => setZoneForm({ ...zoneForm, minOrderAmount: e.target.value })} className="h-10 text-sm font-bold border-border rounded-sm font-mono" />
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-border rounded-sm">
                <Switch checked={zoneForm.isActive} onCheckedChange={(c) => setZoneForm({ ...zoneForm, isActive: c })} />
                <Label className="text-xs font-bold text-slate-700">{t('orders.settings.zones.dialog.active')}</Label>
              </div>
              <div className="pt-2 border-t border-border">
                <Label className="text-[10px] font-semibold text-slate-400 ml-1 mb-2 block">{t('orders.settings.hours.title')}</Label>
                <WeeklyHoursEditor value={zoneForm.openHours} onChange={(v) => setZoneForm({ ...zoneForm, openHours: v })} />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-border flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setZoneDialogOpen(false)} disabled={savingZone} className="h-9 text-xs font-bold text-slate-400">{t('common.cancel')}</Button>
              <Button type="submit" disabled={savingZone} className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-semibold px-6 rounded-sm disabled:opacity-60">{t('orders.settings.zones.dialog.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
