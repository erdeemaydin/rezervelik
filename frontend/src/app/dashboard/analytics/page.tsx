'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChartBar, TrendUp, Users, CalendarDots, CurrencyDollar, CircleNotch, TrendDown, Star, Clock, Prohibit, UserMinus, UserPlus, Repeat, Crown } from '@phosphor-icons/react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar
} from 'recharts';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from "@/i18n/provider";
import { statusStyle } from '@/lib/reservationStatus';

// Chart status colors come from the single source of truth so pie slices, dots
// and the reservations list all agree (CONFIRMED = blue, etc.).
const statusHex = (status: string) => statusStyle(status).hex;

const DEFAULT_COLORS = ['#2563eb', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

interface AnalyticsData {
  period: number;
  openingHour: number;
  closingHour: number;
  range: { from: string; to: string };
  summary: {
    totalReservations: number;
    totalGuests: number;
    avgPartySize: number;
    cancelRate: number;
    noShowRate: number;
    vipCount: number;
  };
  leadTime: { avgHours: number; avgDays: number };
  customerSegments: { new: number; returning: number; regular: number };
  comparison: {
    totalReservations: { current: number; previous: number; changePercent: number };
    totalGuests: { current: number; previous: number; changePercent: number };
  };
  dailyTrend: { date: string; reservations: number; guests: number }[];
  peakHours: { dayOfWeek: number; hour: number; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  categoryBreakdown: { name: string; count: number; color: string | null }[];
  zoneUtilization: { zone: string; reservations: number; avgGuests: number }[];
  waitlistMetrics: {
    totalJoined: number;
    seated: number;
    noShow: number;
    canceled: number;
    avgWaitMinutes: number;
    conversionRate: number;
  };
}

export default function AnalyticsPage() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>("30");
  // Custom range (#1.4). When both dates are set they take precedence over `period`.
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const usingCustom = Boolean(customFrom && customTo);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        const query = usingCustom
          ? `from=${customFrom}&to=${customTo}`
          : `period=${period}`;
        const response = await api.get(`/restaurants/analytics?${query}`);
        setData(response.data.data);
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
        toast.error(t("analytics.fetchError"));
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [period, customFrom, customTo, usingCustom]);

  const renderTrend = (value: number) => {
    if (value > 0) {
      return <div className="flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-bold gap-1 mt-2"><TrendUp className="w-3 h-3" /> +{value}% {t("analytics.vsPrev")}</div>;
    }
    if (value < 0) {
      return <div className="flex items-center text-xs text-rose-600 dark:text-rose-400 font-bold gap-1 mt-2"><TrendDown className="w-3 h-3" /> {value}% {t("analytics.vsPrev")}</div>;
    }
    return <div className="flex items-center text-xs text-muted-foreground font-bold gap-1 mt-2">{t("analytics.noChange")}</div>;
  };

  const getHeatmapColor = (count: number, maxCount: number) => {
    if (count === 0) return 'bg-muted';
    const intensity = Math.max(0.1, count / maxCount);
    // Return a solid blue with varying opacity
    return `rgba(59, 130, 246, ${intensity})`;
  };

  if (loading && !data) {
    return (
      <>
        <div className="flex h-[70vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <CircleNotch className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-muted-foreground font-medium">{t("analytics.loading")}</p>
          </div>
        </div>
      </>
    );
  }

  if (!data) return null;

  // Max value for heatmap
  const maxPeakCount = Math.max(...data.peakHours.map(p => p.count), 1);

  // Heatmap axis adapts to the restaurant's real open hours (#1.2), inclusive.
  const openH = data.openingHour ?? 10;
  const closeH = Math.max(openH, data.closingHour ?? 23);
  const heatHours = Array.from({ length: closeH - openH + 1 }, (_, i) => openH + i);
  const midHour = heatHours[Math.floor(heatHours.length / 2)];
  // Localized short weekday names, indexed by JS getDay() (0 = Sunday).
  const dayFmt = new Intl.DateTimeFormat(locale === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'short' });
  const dayLabels = Array.from({ length: 7 }, (_, i) => dayFmt.format(new Date(Date.UTC(2024, 0, 7 + i)))); // 2024-01-07 is a Sunday

  return (
    <>
      <div className="flex flex-col gap-6 pb-8 animate-in fade-in duration-500">
        
        {/* Header & Period Selector */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground font-heading">{t("analytics.title")}</h1>
            <p className="text-sm text-muted-foreground font-medium">{t("analytics.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Select value={usingCustom ? '' : period} onValueChange={(v) => { if (v) { setPeriod(v); setCustomFrom(''); setCustomTo(''); } }}>
                <SelectTrigger className="bg-card border-border shadow-sm font-semibold text-foreground">
                  <SelectValue placeholder={usingCustom ? t("analytics.customRange") : t("analytics.selectPeriod")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t("analytics.last7Days")}</SelectItem>
                  <SelectItem value="30">{t("analytics.last30Days")}</SelectItem>
                  <SelectItem value="60">{t("analytics.last60Days")}</SelectItem>
                  <SelectItem value="90">{t("analytics.last90Days")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Custom date range (#1.4) */}
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-muted-foreground mb-1">{t("analytics.from")}</label>
              <Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 bg-card border-border shadow-sm text-sm w-40" />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold text-muted-foreground mb-1">{t("analytics.to")}</label>
              <Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="h-9 bg-card border-border shadow-sm text-sm w-40" />
            </div>
            {usingCustom && (
              <Button variant="outline" className="h-9" onClick={() => { setCustomFrom(''); setCustomTo(''); }}>{t("analytics.clear")}</Button>
            )}
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">{t("analytics.totalReservations")}</CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums flex items-center justify-between">
                {data.summary.totalReservations}
                <CalendarDots className="w-5 h-5 text-blue-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {renderTrend(data.comparison.totalReservations.changePercent)}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">{t("analytics.guestsSeated")}</CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums flex items-center justify-between">
                {data.summary.totalGuests}
                <Users className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {renderTrend(data.comparison.totalGuests.changePercent)}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">{t("analytics.avgPartySize")}</CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums flex items-center justify-between">
                {data.summary.avgPartySize}
                <Users className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center text-xs text-muted-foreground font-bold gap-1 mt-2">
                {t("analytics.overallAverage")}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">{t("analytics.vipVisits")}</CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums flex items-center justify-between">
                {data.summary.vipCount}
                <Star className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center text-xs text-muted-foreground font-bold gap-1 mt-2">
                {t("analytics.inSelectedPeriod")}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary metrics: cancellation / no-show rate, lead time, customer mix */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">{t("analytics.cancelRate")}</CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums flex items-center justify-between">
                {data.summary.cancelRate}%
                <Prohibit className="w-5 h-5 text-rose-500 dark:text-rose-400" />
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">{t("analytics.noShowRate")}</CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums flex items-center justify-between">
                {data.summary.noShowRate}%
                <UserMinus className="w-5 h-5 text-muted-foreground" />
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">{t("analytics.avgLeadTime")}</CardDescription>
              <CardTitle className="text-2xl font-bold tabular-nums flex items-center justify-between">
                {data.leadTime.avgDays >= 1 ? `${data.leadTime.avgDays} ${t("analytics.days")}` : `${data.leadTime.avgHours} ${t("analytics.hours")}`}
                <Clock className="w-5 h-5 text-blue-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-xs text-muted-foreground font-bold mt-2">{t("analytics.leadTimeHint")}</div>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">{t("analytics.customerMix")}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-1.5">
              <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> {t("analytics.newCustomers")}</span>
                <span className="font-black tabular-nums text-foreground">{data.customerSegments.new}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5 text-blue-500" /> {t("analytics.returningCustomers")}</span>
                <span className="font-black tabular-nums text-foreground">{data.customerSegments.returning}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" /> {t("analytics.regularCustomers")}</span>
                <span className="font-black tabular-nums text-foreground">{data.customerSegments.regular}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1: Trend & Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border-border shadow-sm bg-card lg:col-span-2">
            <CardHeader className="border-b border-border bg-muted/50">
              <CardTitle className="text-sm font-bold text-foreground">{t("analytics.reservationTrend")}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={data.dailyTrend} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getDate()}/${d.getMonth()+1}`;
                      }}
                      axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={10} 
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '4px' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Line type="monotone" dataKey="reservations" name={t("analytics.reservations")} stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="guests" name={t("analytics.guests")} stroke="#8b5cf6" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm bg-card">
            <CardHeader className="border-b border-border bg-muted/50">
              <CardTitle className="text-sm font-bold text-foreground">{t("analytics.statusBreakdown")}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie
                      data={data.statusBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="count"
                      nameKey="status"
                      stroke="none"
                    >
                      {data.statusBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={statusHex(entry.status) || DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {data.statusBreakdown.sort((a,b) => b.count - a.count).map(item => (
                  <div key={item.status} className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusHex(item.status) || '#ccc' }}></div>
                      {t(statusStyle(item.status).labelKey)}
                    </div>
                    <span className="text-foreground font-bold">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2: Heatmap & Zone/Waitlist */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Peak Hours Heatmap */}
          <Card className="border-border shadow-sm bg-card">
            <CardHeader className="border-b border-border bg-muted/50">
              <CardTitle className="text-sm font-bold text-foreground">{t("analytics.peakHoursHeatmap")}</CardTitle>
            </CardHeader>
            <CardContent className="p-6 overflow-x-auto">
              <div style={{ minWidth: Math.max(500, heatHours.length * 34) }}>
                {/* Days = rows, hours = columns (#1.1); columns span the open window (#1.2) */}
                <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${heatHours.length}, minmax(0, 1fr))` }}>
                  <div />
                  {heatHours.map((hour) => (
                    <div key={`h-${hour}`} className="text-[10px] font-bold text-muted-foreground text-center pb-2">
                      {hour === openH || hour === closeH || hour === midHour ? `${String(hour).padStart(2, '0')}:00` : ''}
                    </div>
                  ))}
                  {dayLabels.map((day, dIdx) => (
                    <React.Fragment key={day + dIdx}>
                      <div className="text-xs font-semibold text-muted-foreground flex items-center justify-end pr-3">{day}</div>
                      {heatHours.map((hour) => {
                        const cellData = data.peakHours.find(p => p.dayOfWeek === dIdx && p.hour === hour);
                        const count = cellData ? cellData.count : 0;
                        return (
                          <div
                            key={`${dIdx}-${hour}`}
                            className="aspect-square rounded-sm border border-border/50 transition-all hover:scale-110 hover:shadow-md cursor-pointer group relative"
                            style={{ backgroundColor: count > 0 ? getHeatmapColor(count, maxPeakCount) : '#f8fafc' }}
                          >
                            <div className="absolute opacity-0 group-hover:opacity-100 z-10 bg-slate-800 text-white text-[10px] px-2 py-1 rounded bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap pointer-events-none">
                              {day} {String(hour).padStart(2, '0')}:00 · {count} {t("analytics.bookings")}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            {/* Zone Utilization */}
            <Card className="border-border shadow-sm bg-card flex-1">
              <CardHeader className="border-b border-border bg-muted/50 pb-4">
                <CardTitle className="text-sm font-bold text-foreground">{t("analytics.zoneUtilization")}</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-4">
                <div className="space-y-4">
                  {data.zoneUtilization.sort((a,b) => b.reservations - a.reservations).map((zone, i) => {
                    const maxZone = Math.max(...data.zoneUtilization.map(z => z.reservations), 1);
                    const percent = (zone.reservations / maxZone) * 100;
                    return (
                      <div key={zone.zone}>
                        <div className="flex justify-between text-xs font-semibold mb-1">
                          <span className="text-foreground">{zone.zone}</span>
                          <span className="text-foreground">{zone.reservations} <span className="text-muted-foreground font-normal">{t("analytics.res")}</span></span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                  {data.zoneUtilization.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-4">{t("analytics.noZoneData")}</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Waitlist Metrics */}
            <Card className="border-border shadow-sm bg-gradient-to-br from-slate-800 to-slate-900 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-300">{t("analytics.waitlistPerformance")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold mb-1">{t("analytics.avgWait")}</p>
                    <p className="text-2xl font-black tabular-nums">{data.waitlistMetrics.avgWaitMinutes}<span className="text-sm font-normal text-muted-foreground ml-1">m</span></p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold mb-1">{t("analytics.conversion")}</p>
                    <p className="text-2xl font-black tabular-nums text-emerald-400">{data.waitlistMetrics.conversionRate}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold mb-1">{t("analytics.seated")}</p>
                    <p className="text-2xl font-black tabular-nums">{data.waitlistMetrics.seated}<span className="text-sm font-normal text-muted-foreground ml-1">/{data.waitlistMetrics.totalJoined}</span></p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>

      </div>
    </>
  );
}
