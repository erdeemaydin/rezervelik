'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
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
import {
  ArrowLeft, Save, Power, Truck, ShoppingBag, Wallet, CreditCard, Gauge, Clock3,
  MapPinned, Plus, Edit2, Trash2, BadgeCheck, Ruler, Search, Loader2, MapPin, X, ListChecks,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/provider';
import type { LatLngValue } from '@/components/maps/LeafletMap';

// Leaflet touches `document` at import time — it can never be part of a server
// render, hence ssr:false (same contract as the customer-side AddressPicker).
const LeafletMap = dynamic(() => import('@/components/maps/LeafletMap'), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" />,
});

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
        <div key={d} className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50/50 p-2">
          <span className="w-24 shrink-0 text-[10px] font-black uppercase text-slate-500">{t(`orders.settings.hours.days.${d}`)}</span>
          <Switch
            checked={!value[d].closed}
            onCheckedChange={(checked) => onChange({ ...value, [d]: { ...value[d], closed: !checked } })}
          />
          {value[d].closed ? (
            <span className="text-[10px] font-bold text-slate-400 uppercase">{t('orders.settings.hours.closed')}</span>
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

// --- Restaurant location search (Nominatim / OpenStreetMap) ---
// A dashboard-styled sibling of components/maps/AddressPicker: same key-less
// geocoder and the same etiquette (debounced, one language hint per call), but
// it can't reuse that component because AddressPicker is themed with an
// `OrderTheme` from the customer ordering flow, which the dashboard has no
// equivalent of.
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const SEARCH_DEBOUNCE_MS = 600;
const MIN_QUERY_LENGTH = 3;

interface NominatimPlace { place_id: number; lat: string; lon: string; display_name: string }

function LocationSearch({ locale, onPick }: { locale: string; onPick: (v: LatLngValue & { label: string }) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]); setSearched(false); setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const url = `${NOMINATIM}/search?format=json&addressdetails=1&limit=5`
          + `&accept-language=${encodeURIComponent(locale)}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('search failed');
        const data = (await res.json()) as NominatimPlace[];
        setResults(Array.isArray(data) ? data : []);
        setSearched(true);
      } catch {
        // Geocoding is a convenience — the pin can always be dropped by hand.
        if (!controller.signal.aborted) { setResults([]); setSearched(true); }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [query, locale]);

  const handlePick = (place: NominatimPlace) => {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    setResults([]); setSearched(false); setQuery('');
    onPick({ lat, lng, label: place.display_name });
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('orders.settings.delivery.searchPlaceholder')}
        className="h-10 pl-10 pr-9 text-sm font-bold border-slate-200 rounded-sm"
      />
      {(searching || query) && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {searching
            ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            : <button type="button" onClick={() => setQuery('')} aria-label={t('orders.settings.delivery.clearSearch')} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
        </span>
      )}
      {results.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.map((place) => (
            <li key={place.place_id}>
              <button type="button" onClick={() => handlePick(place)} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50">
                <MapPin className="mt-0.5 w-3.5 h-3.5 shrink-0 text-blue-500" />
                <span className="min-w-0">{place.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && !searching && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH && (
        <p className="mt-1 text-[10px] font-bold text-slate-400">{t('orders.settings.delivery.noResults')}</p>
      )}
    </div>
  );
}

interface OrderSettingsForm {
  onlineOrderingOpen: boolean;
  autoConfirmOrders: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  cashOnDeliveryEnabled: boolean;
  onlineCardEnabled: boolean;
  maxConcurrentOrders: string; // '' = unlimited
  noShowWarnThreshold: string;
  maxDeliveryKm: string; // '' = no cap; stored as maxDeliveryMeters
  prepTimeMinutes: string;
  orderHours: WeekHours;
}

interface RestaurantLocationForm {
  latitude: number | null;
  longitude: number | null;
  addressText: string;
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
  const { t, locale } = useTranslation();
  const confirm = useConfirm();

  // --- General order settings ---
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<OrderSettingsForm>({
    onlineOrderingOpen: true,
    autoConfirmOrders: false,
    deliveryEnabled: true,
    pickupEnabled: true,
    cashOnDeliveryEnabled: true,
    onlineCardEnabled: false,
    maxConcurrentOrders: '',
    noShowWarnThreshold: '2',
    maxDeliveryKm: '',
    prepTimeMinutes: '20',
    orderHours: defaultWeekHours(),
  });

  // The restaurant pin lives on Restaurant, not OrderSettings, so it saves
  // through its own endpoint — kept in a separate state slice (plus the
  // last-loaded snapshot) so the save can skip that second request entirely
  // when the tenant only touched the settings form.
  const [location, setLocation] = useState<RestaurantLocationForm>({ latitude: null, longitude: null, addressText: '' });
  const [loadedLocation, setLoadedLocation] = useState<RestaurantLocationForm>({ latitude: null, longitude: null, addressText: '' });

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/orders/order-settings');
      const s = res.data.data;
      setForm({
        onlineOrderingOpen: s.onlineOrderingOpen ?? true,
        autoConfirmOrders: s.autoConfirmOrders ?? false,
        deliveryEnabled: s.deliveryEnabled ?? true,
        pickupEnabled: s.pickupEnabled ?? true,
        cashOnDeliveryEnabled: s.cashOnDeliveryEnabled ?? true,
        onlineCardEnabled: s.onlineCardEnabled ?? false,
        maxConcurrentOrders: s.maxConcurrentOrders != null ? String(s.maxConcurrentOrders) : '',
        noShowWarnThreshold: s.noShowWarnThreshold != null ? String(s.noShowWarnThreshold) : '2',
        // Stored in metres, edited in kilometres — the unit a restaurant
        // actually thinks about its delivery radius in.
        maxDeliveryKm: s.maxDeliveryMeters != null ? String(s.maxDeliveryMeters / 1000) : '',
        prepTimeMinutes: s.prepTimeMinutes != null ? String(s.prepTimeMinutes) : '20',
        orderHours: parseWeekHours(s.orderHours),
      });
      const loc = s.restaurantLocation || {};
      const next: RestaurantLocationForm = {
        latitude: typeof loc.latitude === 'number' ? loc.latitude : null,
        longitude: typeof loc.longitude === 'number' ? loc.longitude : null,
        addressText: loc.addressText ?? '',
      };
      setLocation(next);
      setLoadedLocation(next);
    } catch (err) {
      toast.error(t('orders.settings.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const pin = useMemo<LatLngValue | null>(
    () => (location.latitude != null && location.longitude != null ? { lat: location.latitude, lng: location.longitude } : null),
    [location.latitude, location.longitude]
  );

  const locationChanged =
    location.latitude !== loadedLocation.latitude
    || location.longitude !== loadedLocation.longitude
    || location.addressText.trim() !== (loadedLocation.addressText || '').trim();

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
        // Always the real boolean from the form: an omitted field is a no-op
        // server-side, which would make "turn auto-confirm off" unsaveable.
        autoConfirmOrders: form.autoConfirmOrders,
        deliveryEnabled: form.deliveryEnabled,
        pickupEnabled: form.pickupEnabled,
        cashOnDeliveryEnabled: form.cashOnDeliveryEnabled,
        maxConcurrentOrders: form.maxConcurrentOrders === '' ? null : Number(form.maxConcurrentOrders),
        noShowWarnThreshold: form.noShowWarnThreshold !== '' && !Number.isNaN(Number(form.noShowWarnThreshold)) ? Number(form.noShowWarnThreshold) : 2,
        // Empty ⇒ null ⇒ no distance cap at all (zones alone decide).
        maxDeliveryMeters: form.maxDeliveryKm !== '' && !Number.isNaN(Number(form.maxDeliveryKm))
          ? Math.round(Number(form.maxDeliveryKm) * 1000)
          : null,
        // `|| 20` would silently discard a legitimate 0 (the field allows
        // min="0" to disable the buffer) since 0 is falsy — only fall back
        // to 20 when the field is genuinely empty/non-numeric.
        prepTimeMinutes: form.prepTimeMinutes !== '' && !Number.isNaN(Number(form.prepTimeMinutes)) ? Number(form.prepTimeMinutes) : 20,
        orderHours: form.orderHours,
      });
    } catch (err) {
      toast.error(t('orders.settings.saveFailed'));
      setSaving(false);
      return;
    }

    // Second request, only when the pin/address actually moved. Sequential
    // rather than parallel so a failure here is unambiguous — the settings
    // above are already committed at this point.
    if (locationChanged) {
      try {
        // latitude and longitude must travel together (a half-set pin is a 400);
        // clearing the pin sends both as null.
        await api.put('/orders/restaurant-location', {
          latitude: location.latitude,
          longitude: location.longitude,
          addressText: location.addressText.trim() || null,
        });
        setLoadedLocation({ ...location });
      } catch (err) {
        toast.error(t('orders.settings.delivery.locationSaveFailed'));
        setSaving(false);
        return;
      }
    }

    toast.success(t('orders.settings.saved'));
    setSaving(false);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/orders')} className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('orders.settings.title')}</h1>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 italic">{t('orders.settings.subtitle')}</p>
          </div>
        </div>
        <Link href="/dashboard/orders/menu">
          <Button variant="outline" size="sm" className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white">
            <ListChecks className="w-3.5 h-3.5 mr-1.5" /> {t('orders.orderMenuBtn')}
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="bg-slate-100/50">
          <TabsTrigger value="general" className="text-xs font-bold">{t('orders.settings.tabs.general')}</TabsTrigger>
          <TabsTrigger value="zones" className="text-xs font-bold"><MapPinned className="w-3.5 h-3.5 mr-1.5" /> {t('orders.settings.tabs.zones')}</TabsTrigger>
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
                    <span className="text-sm font-black uppercase tracking-tight text-slate-800">{t('orders.settings.killSwitch.title')}</span>
                    <Badge className={cn('text-[9px] font-black uppercase px-2 border-0', form.onlineOrderingOpen ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white')}>
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

          {/* Auto-confirm sits directly under the kill switch: together they are
              the two "how do new orders behave right now" controls. */}
          <Card className="rounded-md border-slate-200 shadow-sm bg-white">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <BadgeCheck className={cn('w-4 h-4', form.autoConfirmOrders ? 'text-emerald-500' : 'text-slate-400')} />
                <div>
                  <div className="text-xs font-black text-slate-700">{t('orders.settings.autoConfirm.title')}</div>
                  <div className="text-[10px] text-slate-400 font-bold max-w-lg mt-0.5">{t('orders.settings.autoConfirm.desc')}</div>
                </div>
              </div>
              <Switch checked={form.autoConfirmOrders} onCheckedChange={(c) => setForm((f) => ({ ...f, autoConfirmOrders: c }))} />
            </CardContent>
          </Card>

          <Card className="rounded-md border-slate-200 shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">{t('orders.settings.fulfillment.title')}</span>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between p-3 border border-slate-100 rounded-md bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="text-xs font-black text-slate-700">{t('orders.settings.fulfillment.delivery')}</div>
                    <div className="text-[10px] text-slate-400 font-bold">{t('orders.settings.fulfillment.deliveryDesc')}</div>
                  </div>
                </div>
                <Switch checked={form.deliveryEnabled} onCheckedChange={(c) => setForm((f) => ({ ...f, deliveryEnabled: c }))} />
              </div>
              <div className="flex items-center justify-between p-3 border border-slate-100 rounded-md bg-slate-50/50">
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

          <Card className="rounded-md border-slate-200 shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">{t('orders.settings.payment.title')}</span>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between p-3 border border-slate-100 rounded-md bg-slate-50/50">
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
              <div className="flex items-center justify-between p-3 border border-slate-100 rounded-md bg-slate-50/50 opacity-70">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-500">{t('orders.settings.payment.card')}</span>
                      <Badge variant="outline" className="text-[8px] font-black uppercase border-amber-200 bg-amber-50 text-amber-700">{t('orders.settings.payment.comingSoon')}</Badge>
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold max-w-sm">{t('orders.settings.payment.cardHint')}</div>
                  </div>
                </div>
                <Switch checked={false} disabled />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md border-slate-200 shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <span className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2"><Gauge className="w-4 h-4 text-blue-500" /> {t('orders.settings.capacity.title')}</span>
            </CardHeader>
            <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('orders.settings.capacity.maxConcurrent')}</Label>
                <Input type="number" min="0" placeholder={t('orders.settings.capacity.maxConcurrentHint')} value={form.maxConcurrentOrders} onChange={(e) => setForm((f) => ({ ...f, maxConcurrentOrders: e.target.value }))} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                <span className="text-[9px] text-slate-400 font-bold">{t('orders.settings.capacity.enforcedHint')}</span>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('orders.settings.capacity.prepTime')}</Label>
                <Input type="number" min="0" value={form.prepTimeMinutes} onChange={(e) => setForm((f) => ({ ...f, prepTimeMinutes: e.target.value }))} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                <span className="text-[9px] text-slate-400 font-bold">{t('orders.settings.capacity.prepTimeHint')}</span>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('orders.settings.capacity.noShowThreshold')}</Label>
                <Input type="number" min="1" value={form.noShowWarnThreshold} onChange={(e) => setForm((f) => ({ ...f, noShowWarnThreshold: e.target.value }))} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                <span className="text-[9px] text-slate-400 font-bold">{t('orders.settings.capacity.noShowThresholdHint')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md border-slate-200 shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <span className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2"><Clock3 className="w-4 h-4 text-blue-500" /> {t('orders.settings.hours.title')}</span>
              <p className="text-[10px] text-slate-400 font-bold mt-1">{t('orders.settings.hours.desc')}</p>
              <p className="text-[10px] text-slate-400 font-bold mt-1">{t('orders.settings.hours.enforcedHint')}</p>
            </CardHeader>
            <CardContent className="p-4">
              <WeeklyHoursEditor value={form.orderHours} onChange={(v) => setForm((f) => ({ ...f, orderHours: v }))} />
            </CardContent>
          </Card>

          {/* ---- DELIVERY RANGE ---- */}
          <Card className="rounded-md border-slate-200 shadow-sm bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <span className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2"><Ruler className="w-4 h-4 text-blue-500" /> {t('orders.settings.delivery.title')}</span>
              <p className="text-[10px] text-slate-400 font-bold mt-1">{t('orders.settings.delivery.desc')}</p>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid gap-1.5 max-w-xs">
                <Label className="text-[10px] font-black uppercase text-slate-400">{t('orders.settings.delivery.maxDistance')}</Label>
                <Input
                  type="number" min="0" step="0.1"
                  placeholder={t('orders.settings.delivery.maxDistancePlaceholder')}
                  value={form.maxDeliveryKm}
                  onChange={(e) => setForm((f) => ({ ...f, maxDeliveryKm: e.target.value }))}
                  className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono"
                />
                <span className="text-[9px] text-slate-400 font-bold">{t('orders.settings.delivery.maxDistanceHint')}</span>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[10px] font-black uppercase text-slate-400">{t('orders.settings.delivery.location')}</Label>
                  {pin ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] font-mono font-black border-emerald-200 bg-emerald-50 text-emerald-700">
                        {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => setLocation((l) => ({ ...l, latitude: null, longitude: null }))}
                        className="text-[9px] font-black uppercase text-slate-400 hover:text-red-600"
                      >
                        {t('orders.settings.delivery.clearPin')}
                      </button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-black uppercase border-amber-200 bg-amber-50 text-amber-700">
                      {t('orders.settings.delivery.pinNotSet')}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-bold">{t('orders.settings.delivery.locationHint')}</p>

                <LocationSearch
                  locale={locale}
                  onPick={(v) => setLocation((l) => ({
                    ...l,
                    latitude: v.lat,
                    longitude: v.lng,
                    // Only prefill the address line while it is still empty —
                    // a hand-written address must survive a re-search.
                    addressText: l.addressText.trim() ? l.addressText : v.label,
                  }))}
                />

                <LeafletMap
                  value={pin}
                  onChange={(v) => setLocation((l) => ({ ...l, latitude: v.lat, longitude: v.lng }))}
                  heightClass="h-64"
                />
                <p className="text-[9px] text-slate-400 font-bold">{t('orders.settings.delivery.dragHint')}</p>

                <div className="grid gap-1.5 pt-1">
                  <Label className="text-[10px] font-black uppercase text-slate-400">{t('orders.settings.delivery.addressText')}</Label>
                  <Input
                    maxLength={500}
                    value={location.addressText}
                    onChange={(e) => setLocation((l) => ({ ...l, addressText: e.target.value }))}
                    placeholder={t('orders.settings.delivery.addressTextPlaceholder')}
                    className="h-10 text-sm font-medium border-slate-200 rounded-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={saving || loading} className="h-11 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase px-8 rounded-sm shadow-lg shadow-blue-600/20 disabled:opacity-60">
              <Save className="w-4 h-4 mr-2" /> {saving ? t('common.loading') : t('orders.settings.saveBtn')}
            </Button>
          </div>
        </TabsContent>

        {/* ---- DELIVERY ZONES ---- */}
        <TabsContent value="zones" className="mt-4">
          <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-700">{t('orders.settings.zones.title')}</span>
              <Button size="sm" onClick={openCreateZone} className="bg-blue-600 hover:bg-blue-700 text-white rounded-sm h-9 px-4 font-black text-[10px] uppercase shadow-md shadow-blue-600/20">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> {t('orders.settings.zones.addBtn')}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="h-9 border-b border-slate-200">
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-6">{t('orders.settings.zones.table.name')}</TableHead>
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('orders.settings.zones.table.matchType')}</TableHead>
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">{t('orders.settings.zones.table.fee')}</TableHead>
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">{t('orders.settings.zones.table.minOrder')}</TableHead>
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{t('orders.settings.zones.table.active')}</TableHead>
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-6">{t('orders.settings.zones.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingZones ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.settings.zones.table.loading')}</TableCell></TableRow>
                  ) : zones.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-32 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.settings.zones.table.noZones')}</TableCell></TableRow>
                  ) : zones.map((z) => (
                    <TableRow key={z.id} className="h-14 hover:bg-slate-50/50 border-b border-slate-100 transition-colors">
                      <TableCell className="px-6 py-3 font-black text-slate-900 text-sm">{z.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] font-black uppercase border-slate-200 bg-white text-slate-600">{t(`orders.settings.zones.matchType.${z.matchType}`)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-700 text-xs">{z.deliveryFee}</TableCell>
                      <TableCell className="text-right font-bold text-slate-700 text-xs">{z.minOrderAmount}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={z.isActive} onCheckedChange={(c) => toggleZoneActive(z, c)} />
                      </TableCell>
                      <TableCell className="px-6 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditZone(z)} className="h-7 w-7 text-slate-300 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteZone(z)} className="h-7 w-7 text-slate-300 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></Button>
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
                <DialogTitle className="text-sm font-bold uppercase tracking-widest">
                  {editZoneId ? t('orders.settings.zones.dialog.editTitle') : t('orders.settings.zones.dialog.createTitle')}
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="p-6 space-y-4 bg-white max-h-[65vh] overflow-y-auto">
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('orders.settings.zones.dialog.name')}</Label>
                <Input required value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder={t('orders.settings.zones.dialog.namePlaceholder')} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('orders.settings.zones.dialog.matchType')}</Label>
                  <Select value={zoneForm.matchType} onValueChange={(v) => { if (v) setZoneForm({ ...zoneForm, matchType: v as 'RADIUS' | 'AREA' }); }}>
                    <SelectTrigger className="h-10 text-sm font-bold rounded-sm border-slate-200 focus:ring-0 shadow-none">
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
                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('orders.settings.zones.dialog.radiusMeters')}</Label>
                    <Input type="number" min="0" value={zoneForm.radiusMeters} onChange={(e) => setZoneForm({ ...zoneForm, radiusMeters: e.target.value })} className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('orders.settings.zones.dialog.deliveryFee')}</Label>
                  <Input type="number" min="0" step="0.01" required value={zoneForm.deliveryFee} onChange={(e) => setZoneForm({ ...zoneForm, deliveryFee: e.target.value })} className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{t('orders.settings.zones.dialog.minOrderAmount')}</Label>
                  <Input type="number" min="0" step="0.01" value={zoneForm.minOrderAmount} onChange={(e) => setZoneForm({ ...zoneForm, minOrderAmount: e.target.value })} className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono" />
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-sm">
                <Switch checked={zoneForm.isActive} onCheckedChange={(c) => setZoneForm({ ...zoneForm, isActive: c })} />
                <Label className="text-xs font-bold text-slate-700">{t('orders.settings.zones.dialog.active')}</Label>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1 mb-2 block">{t('orders.settings.hours.title')}</Label>
                <WeeklyHoursEditor value={zoneForm.openHours} onChange={(v) => setZoneForm({ ...zoneForm, openHours: v })} />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setZoneDialogOpen(false)} disabled={savingZone} className="h-9 text-xs font-bold text-slate-400 uppercase">{t('common.cancel')}</Button>
              <Button type="submit" disabled={savingZone} className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-6 rounded-sm disabled:opacity-60">{t('orders.settings.zones.dialog.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
