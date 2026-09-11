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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Search, Settings2, ShoppingBag, Users, MapPin, StickyNote, Clock, Phone, BadgeCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/provider';

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
  customer: { id: string; name: string; phone: string } | null;
  items: OrderItemLine[];
}
interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  phoneVerifiedAt?: string | null;
  createdAt: string;
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
}

const ALL_STATUSES = ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED', 'REJECTED'];

const statusBadgeClass = (status: string) => {
  if (status === 'NEW') return 'bg-blue-100 text-blue-700';
  if (status === 'ACCEPTED') return 'bg-sky-100 text-sky-700';
  if (status === 'PREPARING') return 'bg-amber-100 text-amber-700';
  if (status === 'READY') return 'bg-emerald-100 text-emerald-700';
  if (status === 'OUT_FOR_DELIVERY') return 'bg-purple-100 text-purple-700';
  if (status === 'COMPLETED') return 'bg-green-100 text-green-700';
  return 'bg-red-100 text-red-700'; // CANCELLED / REJECTED
};

export default function OrdersPage() {
  const { t, locale } = useTranslation();
  const localeTag = locale === 'tr' ? 'tr-TR' : 'en-US';

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

  const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(localeTag, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t('orders.title')}</h1>
          <p className="text-[10px] text-slate-400 font-semibold tracking-[0.2em] mt-1 italic">{t('orders.subtitle')}</p>
        </div>
        <Link href="/dashboard/orders/settings">
          <Button variant="outline" size="sm" className="h-9 px-4 text-[10px] font-semibold border-slate-200 text-slate-600 shadow-sm bg-white">
            <Settings2 className="w-3.5 h-3.5 mr-1.5" /> {t('orders.settingsBtn')}
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="orders" className="w-full" onValueChange={(v) => { if (v === 'customers' && !customersLoaded) fetchCustomers(); }}>
        <TabsList className="bg-slate-100/50">
          <TabsTrigger value="orders" className="text-xs font-bold"><ShoppingBag className="w-3.5 h-3.5 mr-1.5" /> {t('orders.tabs.history')}</TabsTrigger>
          <TabsTrigger value="customers" className="text-xs font-bold"><Users className="w-3.5 h-3.5 mr-1.5" /> {t('orders.tabs.customers')}</TabsTrigger>
        </TabsList>

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
 <Button key={f.value} variant="ghost"size="sm"onClick={() => setTimeFilter(f.value)} className={cn('h-7 text-[9px] font-semibold px-3 rounded-sm transition-all', timeFilter === f.value ?'bg-white text-slate-900 shadow-sm border border-slate-200/50':'text-slate-500 hover:text-slate-700')}>{f.label}</Button>
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
                    <TableHead className="text-[10px] font-semibold text-slate-500 px-6">{t('orders.table.orderNumber')}</TableHead>
                    <TableHead className="text-[10px] font-semibold text-slate-500">{t('orders.table.customer')}</TableHead>
                    <TableHead className="text-[10px] font-semibold text-slate-500">{t('orders.table.fulfillment')}</TableHead>
                    <TableHead className="text-[10px] font-semibold text-slate-500">{t('orders.table.status')}</TableHead>
                    <TableHead className="text-[10px] font-semibold text-slate-500 text-right">{t('orders.table.total')}</TableHead>
                    <TableHead className="text-[10px] font-semibold text-slate-500 text-right px-6">{t('orders.table.placedAt')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingOrders ? (
                    <TableRow><TableCell colSpan={6} className="h-48 text-center text-xs text-slate-300 font-semibold">{t('orders.table.loading')}</TableCell></TableRow>
                  ) : filteredOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="h-48 text-center text-xs text-slate-300 font-semibold">{t('orders.table.noOrders')}</TableCell></TableRow>
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
                        <Badge variant="outline" className="text-[9px] font-semibold border-slate-200 bg-white text-slate-600 shadow-none">
                          {t(`orders.fulfillment.${o.fulfillmentType}`)}
                        </Badge>
                      </TableCell>
                      <TableCell>
 <Badge className={cn('text-[9px] font-semibold px-2 py-0.5 rounded-sm shadow-none border-0', statusBadgeClass(o.status))}>
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
                <span className="text-xs font-bold text-slate-700">{t('orders.tabs.customers')}</span>
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
                    <TableHead className="text-[9px] font-semibold text-slate-400 px-6">{t('orders.customers.table.name')}</TableHead>
                    <TableHead className="text-[9px] font-semibold text-slate-400">{t('orders.customers.table.phone')}</TableHead>
                    <TableHead className="text-[9px] font-semibold text-slate-400 text-center">{t('orders.customers.table.orderCount')}</TableHead>
                    <TableHead className="text-[9px] font-semibold text-slate-400 text-right px-6">{t('orders.customers.table.joined')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingCustomers ? (
                    <TableRow><TableCell colSpan={4} className="h-48 text-center text-[10px] font-semibold text-slate-400">{t('orders.customers.table.loading')}</TableCell></TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="h-48 text-center text-[10px] font-semibold text-slate-400">{t('orders.customers.table.noCustomers')}</TableCell></TableRow>
                  ) : filteredCustomers.map((c) => (
                    <TableRow key={c.id} onClick={() => openCustomerDetail(c.id)} className="h-14 hover:bg-slate-50/50 border-b border-slate-100 transition-colors cursor-pointer">
                      <TableCell className="px-6 py-3">
                        <span className="font-black text-slate-900 text-sm">{c.name}</span>
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
                  <DialogTitle className="text-lg font-semibold tracking-tight">
                    {t('orders.detail.title')} #{selectedOrder.orderNumber}
                  </DialogTitle>
                </DialogHeader>
 <Badge className={cn('text-[9px] font-semibold px-2 py-1 rounded-sm shadow-none border-0', statusBadgeClass(selectedOrder.status))}>
                  {t(`orders.status.${selectedOrder.status}`)}
                </Badge>
              </div>
              <div className="p-6 space-y-5 bg-white max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="text-[9px] font-semibold text-slate-400">{t('orders.detail.customer')}</div>
                    <div className="font-bold text-slate-800">{selectedOrder.customer?.name || '—'}</div>
                    <div className="text-slate-500 font-mono">{selectedOrder.customer?.phone || ''}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-semibold text-slate-400">{t('orders.detail.placedAt')}</div>
                    <div className="font-bold text-slate-800">{fmtDateTime(selectedOrder.createdAt)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-semibold text-slate-400">{t('orders.detail.paymentMethod')}</div>
                    <div className="font-bold text-slate-800">{t(`orders.paymentMethod.${selectedOrder.paymentMethod}`)}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-[9px] font-semibold text-slate-400">{t('orders.detail.paymentStatus')}</div>
                    <div className="font-bold text-slate-800">{t(`orders.paymentStatus.${selectedOrder.paymentStatus}`)}</div>
                  </div>
                  {selectedOrder.prepTimeMinutes != null && (
                    <div className="space-y-1">
                      <div className="text-[9px] font-semibold text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {t('orders.detail.prepTime')}</div>
                      <div className="font-bold text-slate-800">{selectedOrder.prepTimeMinutes} {t('orders.detail.minutesSuffix')}</div>
                    </div>
                  )}
                  {selectedOrder.readyBy && (
                    <div className="space-y-1">
                      <div className="text-[9px] font-semibold text-slate-400">{t('orders.detail.readyBy')}</div>
                      <div className="font-bold text-slate-800">{fmtDateTime(selectedOrder.readyBy)}</div>
                    </div>
                  )}
                </div>

                {selectedOrder.fulfillmentType === 'DELIVERY' && (
                  <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
                    <div className="text-[9px] font-semibold text-slate-400 flex items-center gap-1 mb-1"><MapPin className="w-3 h-3" /> {t('orders.detail.address')}</div>
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
                  <div className="text-[9px] font-semibold text-slate-400 mb-2">{t('orders.detail.items')}</div>
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
                  <div className="text-[9px] font-semibold text-blue-500 flex items-center gap-1 mb-1"><StickyNote className="w-3 h-3" /> {t('orders.detail.customerNote')}</div>
                  <div className="text-xs text-slate-700 font-medium italic">{selectedOrder.customerNote || t('orders.detail.noNote')}</div>
                </div>
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
              <DialogTitle className="text-lg font-semibold tracking-tight">
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
                <div className="flex items-center gap-3 text-xs">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono font-bold text-slate-700">{selectedCustomer.phone}</span>
                  {selectedCustomer.phoneVerifiedAt ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[9px] font-black"><BadgeCheck className="w-3 h-3 mr-1" /> {t('orders.customerDetail.phoneVerified')}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] font-black border-slate-200 text-slate-500">{t('orders.customerDetail.phoneNotVerified')}</Badge>
                  )}
                </div>

                <div>
                  <div className="text-[9px] font-semibold text-slate-400 mb-2">{t('orders.customerDetail.addresses')}</div>
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
                  <div className="text-[9px] font-semibold text-slate-400 mb-2">{t('orders.customerDetail.orderHistory')}</div>
                  {selectedCustomer.orders.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">{t('orders.customerDetail.noOrders')}</div>
                  ) : (
                    <div className="rounded-md border border-slate-200 overflow-hidden">
                      {selectedCustomer.orders.map((o) => (
                        <div key={o.id} className="flex items-center justify-between p-2.5 border-b border-slate-100 last:border-0 bg-white text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900">#{o.orderNumber}</span>
 <Badge className={cn('text-[8px] font-semibold px-1.5 py-0 rounded-sm shadow-none border-0', statusBadgeClass(o.status))}>{t(`orders.status.${o.status}`)}</Badge>
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
    </div>
  );
}
