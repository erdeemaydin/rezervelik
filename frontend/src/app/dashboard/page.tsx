'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, CalendarCheck, Clock, WarningCircle, CircleNotch } from '@phosphor-icons/react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SmallBox } from '@/components/dashboard/StatBoxes';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/provider';

interface TodayStats {
  date: string;
  isToday: boolean;
  todayReservations: number;
  todayGuests: number;
  pendingCount: number;
  confirmedCount: number;
  canceledCount: number;
  noShowCount: number;
  todayByHour: { hour: number; count: number }[];
  avgDuration: number;
}

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Hourly chart palette: past hours recede, the current hour pops, upcoming
// hours carry the classic AdminLTE blue.
const BAR_PAST = '#c3ccd6';
const BAR_NOW = '#f39c12';
const BAR_UPCOMING = '#3c8dbc';

export default function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);
  // Selected operations day (#2.1). Defaults to today.
  const [selectedDate, setSelectedDate] = useState(localDateStr(new Date()));
  const isViewingToday = selectedDate === localDateStr(new Date());

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/restaurants/today?date=${selectedDate}`);
        setData(response.data.data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        toast.error(t('dashboard.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Only auto-refresh when viewing today's live operations.
    if (!isViewingToday) return;
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedDate, isViewingToday]);

  if (loading && !data) {
    return (
      <>
        <div className="flex h-[70vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <CircleNotch className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-muted-foreground font-medium">{t('dashboard.loading')}</p>
          </div>
        </div>
      </>
    );
  }

  if (!data) return null;

  // "Now" markers only make sense while viewing today.
  const currentHour = isViewingToday ? new Date().getHours() : -1;

  // Status breakdown rows, each with an AdminLTE-style solid count badge.
  const statusRows = [
    { label: t('dashboard.confirmed'), count: data.confirmedCount, bg: '#00875a', fg: '#ffffff' },
    { label: t('dashboard.pending'), count: data.pendingCount, bg: '#f39c12', fg: '#201400' },
    { label: t('dashboard.canceled'), count: data.canceledCount, bg: '#5b6b7b', fg: '#ffffff' },
    { label: t('dashboard.noShow'), count: data.noShowCount, bg: '#c7301f', fg: '#ffffff' },
  ];

  return (
    <>
      <div className="space-y-6 animate-in fade-in duration-500 pb-8">

        {/* Content header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('dashboard.todaysOperations')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('dashboard.realtimeCommand')}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Day selector (#2.1) */}
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || localDateStr(new Date()))}
              className="h-9 w-44 bg-card border-border text-sm font-semibold"
            />
            {!isViewingToday && (
              <Button variant="outline" className="h-9" onClick={() => setSelectedDate(localDateStr(new Date()))}>
                {t('dashboard.today')}
              </Button>
            )}
            {isViewingToday ? (
              <span className="text-xs font-bold text-white bg-[#00875a] px-2.5 py-1.5 rounded-[var(--radius)] flex items-center">
                <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></span>
                {t('dashboard.liveData')}
              </span>
            ) : (
              <span className="text-xs font-bold text-foreground bg-card border border-border px-2.5 py-1.5 rounded-[var(--radius)] flex items-center">
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            )}
          </div>
        </div>

        {/* Small-box stat row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SmallBox
            tone="aqua"
            value={data.todayReservations}
            label={t('dashboard.reservationsToday')}
            icon={CalendarCheck}
            footer={t('common.moreInfo')}
            href="/dashboard/reservations"
          />
          <SmallBox
            tone="green"
            value={data.todayGuests}
            label={t('dashboard.expectedGuests')}
            icon={Users}
            footer={t('common.moreInfo')}
            href="/dashboard/host"
          />
          <SmallBox
            tone="yellow"
            value={data.avgDuration || '--'}
            unit={t('dashboard.minutes')}
            label={t('dashboard.avgDuration')}
            icon={Clock}
            footer={t('common.moreInfo')}
            href="/dashboard/analytics"
          />
          <SmallBox
            tone="red"
            value={data.pendingCount}
            unit={t('dashboard.pending')}
            label={t('dashboard.actionRequired')}
            icon={WarningCircle}
            footer={t('common.moreInfo')}
            href="/dashboard/reservations"
          />
        </div>

        {/* Status Breakdown & Chart Row */}
        <div className="grid gap-6 md:grid-cols-7">

          {/* Status Breakdown */}
          <Card tone="info" className="md:col-span-2 gap-0 py-0">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-base text-foreground">{t('dashboard.todaysStatus')}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ul>
                {statusRows.map((row) => (
                  <li key={row.label} className="flex items-center justify-between px-5 py-3.5 border-b border-border last:border-b-0">
                    <span className="font-semibold text-foreground">{row.label}</span>
                    <span
                      className="min-w-9 rounded-[var(--radius)] px-2 py-0.5 text-center text-sm font-bold tabular-nums"
                      style={{ backgroundColor: row.bg, color: row.fg }}
                    >
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Hourly Distribution Chart */}
          <Card tone="primary" className="md:col-span-5 gap-0 py-0">
            <CardHeader className="py-3 border-b border-border">
              <CardTitle className="text-base text-foreground">{t('dashboard.hourlyDistribution')}</CardTitle>
              <CardDescription>{t('dashboard.hourlyDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="py-5">
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={data.todayByHour} margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde3ea" />
                    <XAxis
                      dataKey="hour"
                      axisLine={{ stroke: '#9ca8b7' }}
                      tickLine={false}
                      tick={{ fill: '#5b6b7b', fontSize: 11, fontWeight: 600 }}
                      dy={10}
                      tickFormatter={(val) => `${val}:00`}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#5b6b7b', fontSize: 11, fontWeight: 600 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#eef2f7' }}
                      contentStyle={{ borderRadius: '4px', border: '1px solid #9ca8b7', boxShadow: '0 2px 6px rgb(0 0 0 / 0.12)' }}
                      labelFormatter={(label) => `${label}:00 - ${Number(label)+1}:00`}
                    />
                    {isViewingToday && <ReferenceLine x={currentHour} stroke="#c7301f" strokeDasharray="3 3" label={{ position: 'top', value: t('dashboard.now'), fill: '#c7301f', fontSize: 10, fontWeight: 'bold' }} />}
                    <Bar
                      dataKey="count"
                      name="Reservations"
                      radius={[3, 3, 0, 0]}
                      barSize={30}
                    >
                      {data.todayByHour.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.hour === currentHour ? BAR_NOW : (entry.hour < currentHour ? BAR_PAST : BAR_UPCOMING)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </>
  );
}
