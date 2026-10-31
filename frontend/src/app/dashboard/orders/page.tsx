'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Search, Settings2, ShoppingBag, Users, MapPin, StickyNote, Clock, Phone, BadgeCheck, ListChecks,
  Radio, Ban, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/provider';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ActiveOrdersTable from '@/components/orders/ActiveOrdersTable';
import { orderStatusBadgeClass as statusBadgeClass } from '@/lib/orders/badges';
import type { StaffOrder } from '@/lib/orders/types';

// --- Types (mirrors src/controllers/orderController.ts response shapes) ---
interface OrderModifierLine { id: string; name: string; priceAdjust: number }
interface OrderItemLine {
  id: string;
  nameSnapshot: string;
  unitPrice: number;
  quantity: number;
  modifiersSnapshot: OrderModifierLine[] | null;
}
interface AddressSnapshot {
  label?: string | null;
  neighborhood?: string | null;
  fullAddress: string;
  note?: string | null;
}
interface OrderRow {
  id: string;
  orderNumber: number;
  fulfillmentType: 'DELIVERY' | 'PICKUP';
  status: string;
  paymentMethod: 'CASH_ON_DELIVERY' | 'ONLINE_CARD';
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  addressSnapshot: AddressSnapshot | null;
  deliveryFee: number;
  subtotal: number;
  total: number;
  prepTimeMinutes: number | null;
  readyBy: string | null;
  customerNote: string | null;
  createdAt: string;
  // `noShowCount`/`customerBanned` come back from GET /api/orders and the SSE
  // stream, but not from the orders nested inside GET /api/orders/customers/:id
  // (no customer relation is re-included there) — hence optional.
  customer: { id: string; name: string; phone: string; noShowCount?: number } | null;
  customerBanned?: boolean;
  items: OrderItemLine[];
}
/** One row of the phone-scoped CustomerBan history (GET /api/orders/bans and
 *  the `bans` array on a customer detail). Actor UUIDs are already resolved to
 *  display names server-side — per PROJECT_LOGIC.md §7 the ids never surface. */
interface BanRow {
  id: string;
  phone: string;
  reason: string | null;
  bannedByName: string | null;
  liftedByName: string | null;
  liftedAt: string | null;
  createdAt: string;
  active: boolean;
}
interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  phoneVerifiedAt?: string | null;
  createdAt: string;
  banned: boolean;
  noShowCount: number;
  _count: { orders: number };
}
interface CustomerAddressRow {
  id: string;
  label?: string | null;
  neighborhood?: string | null;
  fullAddress: string;
}
interface CustomerDetail extends CustomerRow {
  addresses: CustomerAddressRow[];
  orders: OrderRow[];
  bans: BanRow[];
}

const ALL_STATUSES = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'REJECTED', 'NOT_PICKED_UP'];

export default function OrdersPage() {
  const { t, locale } = useTranslation();
  const confirm = useConfirm();
  const localeTag = locale === 'tr' ? 'tr-TR' : 'en-US';

  const [tab, setTab] = useState('active');
  const [restaurantProfile, setRestaurantProfile] = useState<any>(null);
  const formatPrice = useMemo(() => {
    const currency = restaurantProfile?.settings?.currency || 'TRY';
    return (price: number) => {
      try {
        return price.toLocaleString(localeTag, { style: 'currency', currency });
      } catch {
        return `${price.toLocaleString(localeTag)} ${currency}`;
      }
    };
  }, [restaurantProfile, localeTag]);

  useEffect(() => {
    api.get('/restaurants/me').then((res) => setRestaurantProfile(res.data.data)).catch(() => {});
  }, []);

  // Two settings shape the live table: whether a Confirm button makes sense at
  // all, and how many no-shows earn a customer a ⚠ badge. A failed load
  // degrades to "no auto-confirm, no badges", never to a broken table.
  const [autoConfirmOrders, setAutoConfirmOrders] = useState(false);
  const [noShowWarnThreshold, setNoShowWarnThreshold] = useState(0);
  useEffect(() => {
    api.get('/orders/order-settings').then((res) => {
      setAutoConfirmOrders(res.data?.data?.autoConfirmOrders === true);
      setNoShowWarnThreshold(Number(res.data?.data?.noShowWarnThreshold) || 0);
    }).catch(() => {});
  }, []);

  // --- Order history ---
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

  const timeRange = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (timeFilter === 'today') {
      const to = new Date(startOfToday); to.setDate(to.getDate() + 1);
      return { from: startOfToday, to };
    }
    if (timeFilter === 'week') {
      const from = new Date(startOfToday); from.setDate(from.getDate() - 7);
      const to = new Date(startOfToday); to.setDate(to.getDate() + 1);
      return { from, to };
    }
    if (timeFilter === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(startOfToday); to.setDate(to.getDate() + 1);
      return { from, to };
    }
    if (timeFilter === 'custom' && customDate) {
      const from = new Date(`${customDate}T00:00:00`);
      const to = new Date(from); to.setDate(to.getDate() + 1);
      return { from, to };
    }
    return { from: undefined, to: undefined };
  }, [timeFilter, customDate]);

  const fetchOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      const params: Record<string, string> = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (timeRange.from) params.from = timeRange.from.toISOString();
      if (timeRange.to) params.to = timeRange.to.toISOString();
      const res = await api.get('/orders', { params });
      setOrders(res.data.data);
    } catch (err) {
      toast.error(t('orders.errors.loadFailed'));
    } finally {
      setLoadingOrders(false);
    }
  }, [statusFilter, timeRange, t]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      String(o.orderNumber).includes(q) ||
      (o.customer?.name || '').toLowerCase().includes(q) ||
      (o.customer?.phone || '').includes(q)
    );
  }, [orders, orderSearch]);

  // --- Customer directory ---
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoadingCustomers(true);
      const res = await api.get('/orders/customers');
      setCustomers(res.data.data);
      setCustomersLoaded(true);
    } catch (err) {
      toast.error(t('orders.errors.loadCustomersFailed'));
    } finally {
      setLoadingCustomers(false);
    }
  }, [t]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, customerSearch]);

  const openCustomerDetail = async (id: string) => {
    try {
      setLoadingCustomerDetail(true);
      const res = await api.get(`/orders/customers/${id}`);
      setSelectedCustomer(res.data.data);
    } catch (err) {
      toast.error(t('orders.errors.loadCustomerDetailFailed'));
    } finally {
      setLoadingCustomerDetail(false);
    }
  };

  /** Re-read the ban-derived state after a ban changes — `banned`, `bans[]`
   *  and the customers table's badge are all computed server-side, none of it
   *  is patched in locally.
   *
   *  The detail is only re-fetched when its dialog is already showing that
   *  customer: banning from the *order* detail must not pop a second dialog
   *  open on top of the one the user is looking at. */
  const refreshCustomerViews = useCallback(async (customerId: string, refetchDetail: boolean) => {
    if (refetchDetail) {
      try {
        const res = await api.get(`/orders/customers/${customerId}`);
        setSelectedCustomer(res.data.data);
      } catch {
        /* the ban itself succeeded; a stale dialog isn't worth a second error toast */
      }
    }
    if (customersLoaded) fetchCustomers();
  }, [customersLoaded, fetchCustomers]);

  // --- Customer bans (manual only — see plan decision #4; noShowCount never
  // bans anyone by itself, it only raises the badge staff act on) ---
  const [banTarget, setBanTarget] = useState<{ customerId: string; name: string; phone: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

  const openBanDialog = (customerId: string, name: string, phone: string) => {
    setBanReason('');
    setBanTarget({ customerId, name, phone });
  };

  const submitBan = async () => {
    if (!banTarget) return;
    const { customerId } = banTarget;
    const detailOpen = selectedCustomer?.id === customerId;
    // The order-detail dialog stays open behind the ban dialog, so flip its
    // banned flag too — nothing else would tell it (the ban isn't an order
    // status change, so no SSE event follows).
    const markOrderBanned = () =>
      setSelectedOrder((prev) => (prev && prev.customer?.id === customerId ? { ...prev, customerBanned: true } : prev));
    setBanSubmitting(true);
    try {
      await api.post('/orders/bans', { phone: banTarget.phone, reason: banReason.trim() || undefined });
      toast.success(t('orders.bans.banned'));
      setBanTarget(null);
      markOrderBanned();
      await refreshCustomerViews(customerId, detailOpen);
    } catch (err: any) {
      // 409 = an active ban for this number already exists (another manager got
      // there first). That's a no-op, not a failure — say so plainly and pull
      // the fresh state in rather than leaving a stale "not banned" dialog.
      if (err?.response?.status === 409) {
        toast.error(t('orders.bans.alreadyBanned'));
        setBanTarget(null);
        markOrderBanned();
        await refreshCustomerViews(customerId, detailOpen);
      } else {
        toast.error(err?.response?.data?.message || t('orders.bans.banFailed'));
      }
    } finally {
      setBanSubmitting(false);
    }
  };

  const liftBan = async (customer: CustomerDetail) => {
    const activeBan = customer.bans.find((b) => b.active);
    if (!activeBan) return;
    const ok = await confirm({
      title: t('orders.bans.liftConfirmTitle'),
      description: t('orders.bans.liftConfirmDesc'),
      details: [
        { label: t('orders.customers.table.name'), value: customer.name },
        { label: t('orders.customers.table.phone'), value: customer.phone },
      ],
      confirmText: t('orders.bans.liftBtn'),
      cancelText: t('orders.customerDetail.close'),
    });
    if (!ok) return;
    try {
      await api.patch(`/orders/bans/${activeBan.id}/lift`);
      toast.success(t('orders.bans.lifted'));
      setSelectedOrder((prev) => (prev && prev.customer?.id === customer.id ? { ...prev, customerBanned: false } : prev));
      await refreshCustomerViews(customer.id, true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('orders.bans.liftFailed'));
    }
  };

  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(localeTag, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('orders.title')}</h1>
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 italic">{t('orders.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/orders/menu">
            <Button variant="outline" size="sm" className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white">
              <ListChecks className="w-3.5 h-3.5 mr-1.5" /> {t('orders.orderMenuBtn')}
            </Button>
          </Link>
          <Link href="/dashboard/orders/settings">
            <Button variant="outline" size="sm" className="h-9 px-4 text-[10px] font-black uppercase border-slate-200 text-slate-600 shadow-sm bg-white">
              <Settings2 className="w-3.5 h-3.5 mr-1.5" /> {t('orders.settingsBtn')}
            </Button>
          </Link>
        </div>
      </div>

      {/* "active" is the default tab: the live board is what a manager opening
          this screen mid-service actually needs; history is the lookup tool. */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v === 'customers' && !customersLoaded) fetchCustomers(); }} className="w-full">
        <TabsList className="bg-slate-100/50">
          <TabsTrigger value="active" className="text-xs font-bold"><Radio className="w-3.5 h-3.5 mr-1.5" /> {t('orders.tabs.active')}</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs font-bold"><ShoppingBag className="w-3.5 h-3.5 mr-1.5" /> {t('orders.tabs.history')}</TabsTrigger>
          <TabsTrigger value="customers" className="text-xs font-bold"><Users className="w-3.5 h-3.5 mr-1.5" /> {t('orders.tabs.customers')}</TabsTrigger>
        </TabsList>

        {/* ---- ACTIVE ORDERS (live) ---- */}
        <TabsContent value="active" className="mt-4">
          <ActiveOrdersTable
            active={tab === 'active'}
            formatPrice={formatPrice}
            autoConfirmOrders={autoConfirmOrders}
            noShowWarnThreshold={noShowWarnThreshold}
            onSelectOrder={(o: StaffOrder) => setSelectedOrder(o)}
          />
        </TabsContent>

        {/* ---- ORDER HISTORY ---- */}
        <TabsContent value="orders" className="mt-4">
          <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-0 border-b border-slate-100">
              <div className="flex flex-wrap items-center justify-between p-3 gap-3">
                <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-md border border-slate-200/60 flex-wrap">
                  {([
                    { label: t('orders.filters.today'), value: 'today' as const },
                    { label: t('orders.filters.thisWeek'), value: 'week' as const },
                    { label: t('orders.filters.thisMonth'), value: 'month' as const },
                    { label: t('orders.filters.allTime'), value: 'all' as const },
                  ]).map((f) => (
                    <Button key={f.value} variant="ghost" size="sm" onClick={() => setTimeFilter(f.value)} className={cn('h-7 text-[9px] font-black uppercase px-3 rounded-sm transition-all', timeFilter === f.value ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700')}>{f.label}</Button>
                  ))}
                  <div className="w-px h-4 bg-slate-300 mx-1" />
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => { setCustomDate(e.target.value); setTimeFilter('custom'); }}
                    className={cn('h-7 text-[10px] font-bold border rounded px-1.5 bg-white', timeFilter === 'custom' ? 'border-blue-400' : 'border-slate-200')}
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v); }}>
                    <SelectTrigger className="h-9 w-[160px] text-[10px] font-black rounded-md border-slate-200 focus:ring-0 shadow-none">
                      <SelectValue>{statusFilter === 'ALL' ? t('orders.filters.statusAll') : t(`orders.status.${statusFilter}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" className="text-xs">{t('orders.filters.statusAll')}</SelectItem>
                      {ALL_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{t(`orders.status.${s}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder={t('orders.searchPlaceholder')} className="pl-10 h-9 text-xs bg-slate-50 border-slate-200 focus:bg-white rounded-md font-bold" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="h-10 hover:bg-transparent border-b border-slate-200">
                    <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-6">{t('orders.table.orderNumber')}</TableHead>
                    <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('orders.table.customer')}</TableHead>
                    <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('orders.table.fulfillment')}</TableHead>
                    <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('orders.table.status')}</TableHead>
                    <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">{t('orders.table.total')}</TableHead>
                    <TableHead className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right px-6">{t('orders.table.placedAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingOrders ? (
                    <TableRow><TableCell colSpan={6} className="h-48 text-center text-xs text-slate-300 font-black uppercase tracking-widest">{t('orders.table.loading')}</TableCell></TableRow>
                  ) : filteredOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-48 text-center text-xs text-slate-300 font-black uppercase tracking-widest">{t('orders.table.noOrders')}</TableCell></TableRow>
                  ) : filteredOrders.map((o) => (
                    <TableRow key={o.id} onClick={() => setSelectedOrder(o)} className="h-14 border-b border-slate-50 hover:bg-slate-50/70 transition-colors cursor-pointer">
                      <TableCell className="px-6">
                        <span className="font-black text-slate-900 text-sm">#{o.orderNumber}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-xs">{o.customer?.name || '—'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{o.customer?.phone || ''}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] font-black uppercase border-slate-200 bg-white text-slate-600 shadow-none">
                          {t(`orders.fulfillment.${o.fulfillmentType}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-[9px] font-black uppercase px-2 py-0.5 rounded-sm shadow-none border-0', statusBadgeClass(o.status))}>
                          {t(`orders.status.${o.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-black text-slate-800 text-sm">{formatPrice(o.total)}</TableCell>
                      <TableCell className="px-6 text-right text-[10px] font-bold text-slate-500">{fmtDateTime(o.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- CUSTOMERS ---- */}
        <TabsContent value="customers" className="mt-4">
          <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">{t('orders.tabs.customers')}</span>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input placeholder={t('orders.customers.searchPlaceholder')} className="pl-8 h-8 text-xs bg-white border-slate-200 rounded-sm" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="h-9 border-b border-slate-200">
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-6">{t('orders.customers.table.name')}</TableHead>
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('orders.customers.table.phone')}</TableHead>
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">{t('orders.customers.table.orderCount')}</TableHead>
                    <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-6">{t('orders.customers.table.joined')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingCustomers ? (
                    <TableRow><TableCell colSpan={4} className="h-48 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.customers.table.loading')}</TableCell></TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="h-48 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('orders.customers.table.noCustomers')}</TableCell></TableRow>
                  ) : filteredCustomers.map((c) => (
                    <TableRow key={c.id} onClick={() => openCustomerDetail(c.id)} className="h-14 hover:bg-slate-50/50 border-b border-slate-100 transition-colors cursor-pointer">
                      <TableCell className="px-6 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-black text-slate-900 text-sm">{c.name}</span>
                          {c.banned && (
                            <Badge className="border-0 bg-rose-100 px-1.5 py-0 text-[9px] font-black uppercase text-rose-700 shadow-none">
                              <Ban className="mr-0.5 h-2.5 w-2.5" /> {t('orders.active.bannedBadge')}
                            </Badge>
                          )}
                          {noShowWarnThreshold > 0 && (c.noShowCount ?? 0) >= noShowWarnThreshold && (
                            <Badge className="border-0 bg-amber-100 px-1.5 py-0 text-[9px] font-black uppercase text-amber-700 shadow-none">
                              <AlertTriangle className="mr-0.5 h-2.5 w-2.5" /> {String(c.noShowCount)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] font-mono text-slate-500">{c.phone}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[9px] font-black border-slate-200 bg-white text-slate-600 shadow-none">{c._count.orders}</Badge>
                      </TableCell>
                      <TableCell className="px-6 text-right text-[10px] font-bold text-slate-400">{new Date(c.createdAt).toLocaleDateString(localeTag)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---- ORDER DETAIL DIALOG ---- */}
      <Dialog open={!!selectedOrder} onOpenChange={(o) => { if (!o) setSelectedOrder(null); }}>
        <DialogContent maxWidth="sm:max-w-xl" className="p-0 rounded-md overflow-hidden border-0 shadow-2xl">
          {selectedOrder && (
            <>
              <div className="bg-slate-900 p-5 text-white flex items-center justify-between">
                <DialogHeader>
                  <DialogTitle className="text-lg font-black uppercase tracking-tight">
                    {t('orders.detail.title')} #{selectedOrder.orderNumber}
                  </DialogTitle>
                </DialogHeader>
                <Badge className={cn('text-[9px] font-black uppercase px-2 py-1 rounded-sm shadow-none border-0', statusBadgeClass(selectedOrder.status))}>
                  {t(`orders.status.${selectedOrder.status}`)}
                </Badge>
              </div>
              <div className="p-6 space-y-5 bg-white max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('orders.detail.customer')}</div>
                    <div className="font-bold text-slate-800">{selectedOrder.customer?.name || '—'}</div>
                    <div className="text-slate-500 font-mono">{selectedOrder.customer?.phone || ''}</div>
                    {(selectedOrder.customerBanned || (noShowWarnThreshold > 0 && (selectedOrder.customer?.noShowCount ?? 0) >= noShowWarnThreshold)) && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {noShowWarnThreshold > 0 && (selectedOrder.customer?.noShowCount ?? 0) >= noShowWarnThreshold && (
                          <Badge className="border-0 bg-amber-100 px-1.5 py-0 text-[9px] font-black uppercase text-amber-700 shadow-none">
                            <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                            {String(selectedOrder.customer?.noShowCount ?? 0)} {t('orders.active.noShowsSuffix')}
                          </Badge>
                        )}
                        {selectedOrder.customerBanned && (
                          <Badge className="border-0 bg-rose-100 px-1.5 py-0 text-[9px] font-black uppercase text-rose-700 shadow-none">
                            <Ban className="mr-0.5 h-2.5 w-2.5" /> {t('orders.active.bannedBadge')}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('orders.detail.placedAt')}</div>
                    <div className="font-bold text-slate-800">{fmtDateTime(selectedOrder.createdAt)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('orders.detail.paymentMethod')}</div>
                    <div className="font-bold text-slate-800">{t(`orders.paymentMethod.${selectedOrder.paymentMethod}`)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('orders.detail.paymentStatus')}</div>
                    <div className="font-bold text-slate-800">{t(`orders.paymentStatus.${selectedOrder.paymentStatus}`)}</div>
                  </div>
                  {selectedOrder.prepTimeMinutes != null && (
                    <div className="space-y-1">
                      <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> {t('orders.detail.prepTime')}</div>
                      <div className="font-bold text-slate-800">{selectedOrder.prepTimeMinutes} {t('orders.detail.minutesSuffix')}</div>
                    </div>
                  )}
                  {selectedOrder.readyBy && (
                    <div className="space-y-1">
                      <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{t('orders.detail.readyBy')}</div>
                      <div className="font-bold text-slate-800">{fmtDateTime(selectedOrder.readyBy)}</div>
                    </div>
                  )}
                </div>

                {selectedOrder.fulfillmentType === 'DELIVERY' && (
                  <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-1 mb-1"><MapPin className="w-3 h-3" /> {t('orders.detail.address')}</div>
                    {selectedOrder.addressSnapshot ? (
                      <div className="text-xs text-slate-700 font-medium">
                        {selectedOrder.addressSnapshot.label && <span className="font-black mr-1">{selectedOrder.addressSnapshot.label}:</span>}
                        {selectedOrder.addressSnapshot.neighborhood && <span className="mr-1">{selectedOrder.addressSnapshot.neighborhood},</span>}
                        {selectedOrder.addressSnapshot.fullAddress}
                        {selectedOrder.addressSnapshot.note && <div className="text-[10px] text-slate-400 italic mt-1">{selectedOrder.addressSnapshot.note}</div>}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic">{t('orders.detail.noAddress')}</div>
                    )}
                  </div>
                )}

                <div>
                  <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">{t('orders.detail.items')}</div>
                  <div className="rounded-md border border-slate-200 overflow-hidden">
                    {selectedOrder.items.map((it) => (
                      <div key={it.id} className="flex items-start justify-between p-3 border-b border-slate-100 last:border-0 bg-white">
                        <div>
                          <div className="text-xs font-bold text-slate-800">{it.quantity}× {it.nameSnapshot}</div>
                          {it.modifiersSnapshot && it.modifiersSnapshot.length > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {it.modifiersSnapshot.map((m) => m.priceAdjust ? `${m.name} (+${formatPrice(m.priceAdjust)})` : m.name).join(', ')}
                            </div>
                          )}
                        </div>
                        {/* OrderItem.unitPrice already bakes in modifier price adjustments
                            (src/services/orderPricingService.ts: unitPrice = menuItem.price +
                            modifierTotal) — modifiersSnapshot is for display only here, don't
                            re-add its priceAdjust or this double-counts. */}
                        <div className="text-xs font-black text-slate-700">{formatPrice(it.unitPrice * it.quantity)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
                  <div className="flex justify-between text-slate-500 font-bold">
                    <span>{t('orders.detail.subtotal')}</span><span>{formatPrice(selectedOrder.subtotal)}</span>
                  </div>
                  {selectedOrder.fulfillmentType === 'DELIVERY' && (
                    <div className="flex justify-between text-slate-500 font-bold">
                      <span>{t('orders.detail.deliveryFee')}</span><span>{formatPrice(selectedOrder.deliveryFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-900 font-black text-sm pt-1">
                    <span>{t('orders.detail.total')}</span><span>{formatPrice(selectedOrder.total)}</span>
                  </div>
                </div>

                <div className="rounded-md bg-blue-50/40 border border-blue-100 p-3">
                  <div className="text-[9px] font-black uppercase text-blue-500 tracking-widest flex items-center gap-1 mb-1"><StickyNote className="w-3 h-3" /> {t('orders.detail.customerNote')}</div>
                  <div className="text-xs text-slate-700 font-medium italic">{selectedOrder.customerNote || t('orders.detail.noNote')}</div>
                </div>

                {/* Acting on a bad order shouldn't mean hunting the customer
                    down in the Customers tab — the ban shortcut is right here.
                    Hidden once the number is already banned. */}
                {selectedOrder.customer && !selectedOrder.customerBanned && (
                  <div className="flex justify-end border-t border-slate-100 pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openBanDialog(selectedOrder.customer!.id, selectedOrder.customer!.name, selectedOrder.customer!.phone)}
                      className="h-8 border-rose-200 bg-white px-3 text-[10px] font-black uppercase text-rose-600 shadow-none hover:bg-rose-50"
                    >
                      <Ban className="mr-1.5 h-3 w-3" /> {t('orders.bans.banCustomerBtn')}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- CUSTOMER DETAIL DIALOG ---- */}
      <Dialog open={!!selectedCustomer || loadingCustomerDetail} onOpenChange={(o) => { if (!o) setSelectedCustomer(null); }}>
        <DialogContent maxWidth="sm:max-w-lg" className="p-0 rounded-md overflow-hidden border-0 shadow-2xl">
          <div className="bg-slate-900 p-5 text-white">
            <DialogHeader>
              <DialogTitle className="text-lg font-black uppercase tracking-tight">
                {selectedCustomer ? selectedCustomer.name : t('orders.customerDetail.title')}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-5 bg-white max-h-[70vh] overflow-y-auto">
            {loadingCustomerDetail || !selectedCustomer ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono font-bold text-slate-700">{selectedCustomer.phone}</span>
                  {selectedCustomer.phoneVerifiedAt ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[9px] font-black"><BadgeCheck className="w-3 h-3 mr-1" /> {t('orders.customerDetail.phoneVerified')}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-black border-slate-200 text-slate-500">{t('orders.customerDetail.phoneNotVerified')}</Badge>
                  )}
                  {selectedCustomer.banned && (
                    <Badge className="bg-rose-100 text-rose-700 border-0 text-[9px] font-black uppercase"><Ban className="w-3 h-3 mr-1" /> {t('orders.active.bannedBadge')}</Badge>
                  )}
                </div>

                {/* Ban state + the action that changes it. Bans are keyed by
                    phone number, so this is deliberately phrased as banning
                    the number, not the account row. */}
                <div className={cn(
                  'flex flex-wrap items-center justify-between gap-3 rounded-md border p-3',
                  selectedCustomer.banned ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-slate-50/50'
                )}>
                  <div className="space-y-0.5">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('orders.customerDetail.banStatus')}</div>
                    <div className={cn('text-xs font-black', selectedCustomer.banned ? 'text-rose-700' : 'text-slate-700')}>
                      {t(selectedCustomer.banned ? 'orders.customerDetail.bannedState' : 'orders.customerDetail.notBannedState')}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="space-y-0.5 text-right">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t('orders.customerDetail.noShowCount')}</div>
                      <div className={cn(
                        'text-sm font-black',
                        noShowWarnThreshold > 0 && (selectedCustomer.noShowCount ?? 0) >= noShowWarnThreshold ? 'text-amber-600' : 'text-slate-700'
                      )}>
                        {String(selectedCustomer.noShowCount ?? 0)}
                      </div>
                    </div>
                    {selectedCustomer.banned ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => liftBan(selectedCustomer)}
                        className="h-8 border-emerald-200 bg-white px-3 text-[10px] font-black uppercase text-emerald-600 shadow-none hover:bg-emerald-50"
                      >
                        <ShieldCheck className="mr-1.5 h-3 w-3" /> {t('orders.bans.liftBtn')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openBanDialog(selectedCustomer.id, selectedCustomer.name, selectedCustomer.phone)}
                        className="h-8 border-rose-200 bg-white px-3 text-[10px] font-black uppercase text-rose-600 shadow-none hover:bg-rose-50"
                      >
                        <Ban className="mr-1.5 h-3 w-3" /> {t('orders.bans.banBtn')}
                      </Button>
                    )}
                  </div>
                </div>

                {selectedCustomer.bans?.length > 0 && (
                  <div>
                    <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">{t('orders.customerDetail.banHistory')}</div>
                    <div className="rounded-md border border-slate-200 overflow-hidden">
                      {selectedCustomer.bans.map((b) => (
                        <div key={b.id} className="border-b border-slate-100 bg-white p-2.5 text-xs last:border-0">
                          <div className="flex items-center justify-between gap-2">
                            <Badge className={cn(
                              'border-0 px-1.5 py-0 text-[9px] font-black uppercase shadow-none',
                              b.active ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'
                            )}>
                              {t(b.active ? 'orders.bans.activeBadge' : 'orders.bans.liftedBadge')}
                            </Badge>
                            <span className="text-[10px] font-bold text-slate-400">{fmtDateTime(b.createdAt)}</span>
                          </div>
                          <div className="mt-1 italic text-slate-700">{b.reason || t('orders.bans.noReason')}</div>
                          <div className="mt-1 text-[10px] font-bold text-slate-400">
                            {t('orders.bans.bannedBy')} {b.bannedByName || t('orders.bans.unknownStaff')}
                            {b.liftedAt && (
                              <> · {t('orders.bans.liftedBy')} {b.liftedByName || t('orders.bans.unknownStaff')} · {fmtDateTime(b.liftedAt)}</>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">{t('orders.customerDetail.addresses')}</div>
                  {selectedCustomer.addresses.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">{t('orders.customerDetail.noAddresses')}</div>
                  ) : (
                    <div className="space-y-2">
                      {selectedCustomer.addresses.map((a) => (
                        <div key={a.id} className="rounded-md border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-700">
                          {a.label && <span className="font-black mr-1">{a.label}:</span>}
                          {a.neighborhood && <span className="mr-1">{a.neighborhood},</span>}
                          {a.fullAddress}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">{t('orders.customerDetail.orderHistory')}</div>
                  {selectedCustomer.orders.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">{t('orders.customerDetail.noOrders')}</div>
                  ) : (
                    <div className="rounded-md border border-slate-200 overflow-hidden">
                      {selectedCustomer.orders.map((o) => (
                        <div key={o.id} className="flex items-center justify-between p-2.5 border-b border-slate-100 last:border-0 bg-white text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900">#{o.orderNumber}</span>
                            <Badge className={cn('text-[8px] font-black uppercase px-1.5 py-0 rounded-sm shadow-none border-0', statusBadgeClass(o.status))}>{t(`orders.status.${o.status}`)}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-slate-500 font-bold">
                            <span>{fmtDateTime(o.createdAt)}</span>
                            <span className="text-slate-900">{formatPrice(o.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- BAN CUSTOMER DIALOG ---- */}
      <Dialog open={!!banTarget} onOpenChange={(o) => { if (!o) setBanTarget(null); }}>
        <DialogContent maxWidth="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black">{t('orders.bans.dialogTitle')}</DialogTitle>
            <DialogDescription className="text-xs">{t('orders.bans.dialogDesc')}</DialogDescription>
          </DialogHeader>
          {banTarget && (
            <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <div className="font-black text-slate-800">{banTarget.name}</div>
              <div className="font-mono text-slate-500">{banTarget.phone}</div>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('orders.bans.reasonLabel')}</Label>
            <Textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder={t('orders.bans.reasonPlaceholder')}
              className="min-h-[80px] text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBanTarget(null)}>{t('orders.customerDetail.close')}</Button>
            <Button onClick={submitBan} disabled={banSubmitting} className="bg-rose-600 text-white hover:bg-rose-700">
              <Ban className="mr-1.5 h-3.5 w-3.5" /> {t('orders.bans.banBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
