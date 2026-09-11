'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Calendar, Clock, Activity, Loader2, CheckCircle2, Clock3, XCircle, AlertCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-slate-500 font-medium">{t('dashboard.loading')}</p>
          </div>
        </div>
      </>
    );
  }

  if (!data) return null;

  // "Now" markers only make sense while viewing today.
  const currentHour = isViewingToday ? new Date().getHours() : -1;

  return (
    <>
      <div className="space-y-8 animate-in fade-in duration-500 pb-8">

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 font-heading">{t('dashboard.todaysOperations')}</h1>
            <p className="text-slate-500 mt-1">{t('dashboard.realtimeCommand')}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Day selector (#2.1) */}
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || localDateStr(new Date()))}
              className="h-9 w-44 bg-white border-slate-200 shadow-sm text-sm font-semibold"
            />
            {!isViewingToday && (
              <Button variant="outline" className="h-9" onClick={() => setSelectedDate(localDateStr(new Date()))}>
                {t('dashboard.today')}
              </Button>
            )}
            {isViewingToday ? (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full flex items-center shadow-sm">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                {t('dashboard.liveData')}
              </span>
            ) : (
              <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full flex items-center shadow-sm">
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            )}
          </div>
        </div>

        {/* Top Stat Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="overflow-hidden group hover:shadow-md transition-all">
            <div className="h-1 w-full bg-blue-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500">{t('dashboard.reservationsToday')}</p>
                <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-3 mt-1">
                <h2 className="text-3xl font-black tabular-nums text-slate-900">{data.todayReservations}</h2>
              </div>
            </CardContent>
          </Card>
          
          <Card className="overflow-hidden group hover:shadow-md transition-all">
            <div className="h-1 w-full bg-indigo-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500">{t('dashboard.expectedGuests')}</p>
                <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                  <Users className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-1 mt-1">
                <h2 className="text-3xl font-black tabular-nums text-slate-900">{data.todayGuests}</h2>
                <span className="text-sm font-bold text-slate-400">{t('dashboard.confirmed')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden group hover:shadow-md transition-all">
            <div className="h-1 w-full bg-amber-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500">{t('dashboard.avgDuration')}</p>
                <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-2 mt-1">
                <h2 className="text-3xl font-black tabular-nums text-slate-900">{data.avgDuration || '--'}</h2>
                <span className="text-sm font-bold text-slate-400">{t('dashboard.minutes')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden group hover:shadow-md transition-all">
            <div className="h-1 w-full bg-rose-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500">{t('dashboard.actionRequired')}</p>
                <div className="p-2 bg-rose-50 rounded-lg group-hover:bg-rose-100 transition-colors">
                  <Activity className="h-5 w-5 text-rose-600" />
                </div>
              </div>
              <div className="flex items-baseline mt-1 space-x-2">
                <h2 className={`text-3xl font-black tabular-nums ${data.pendingCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{data.pendingCount}</h2>
                <span className="text-sm font-bold text-slate-400">{t('dashboard.pending')}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Breakdown & Chart Row */}
        <div className="grid gap-6 md:grid-cols-7">
          
          {/* Status Breakdown */}
          <Card className="md:col-span-2 shadow-sm border-slate-200">
            <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg text-slate-800">{t('dashboard.todaysStatus')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>
                    <span className="font-semibold text-slate-700">{t('dashboard.confirmed')}</span>
                  </div>
                  <span className="text-lg font-black tabular-nums text-slate-900">{data.confirmedCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg"><Clock3 className="w-4 h-4 text-amber-600" /></div>
                    <span className="font-semibold text-slate-700">{t('dashboard.pending')}</span>
                  </div>
                  <span className="text-lg font-black tabular-nums text-slate-900">{data.pendingCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg"><XCircle className="w-4 h-4 text-slate-600" /></div>
                    <span className="font-semibold text-slate-700">{t('dashboard.canceled')}</span>
                  </div>
                  <span className="text-lg font-black tabular-nums text-slate-900">{data.canceledCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 rounded-lg"><AlertCircle className="w-4 h-4 text-rose-600" /></div>
                    <span className="font-semibold text-slate-700">{t('dashboard.noShow')}</span>
                  </div>
                  <span className="text-lg font-black tabular-nums text-slate-900">{data.noShowCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hourly Distribution Chart */}
          <Card className="md:col-span-5 shadow-sm border-slate-200">
            <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-lg text-slate-800">{t('dashboard.hourlyDistribution')}</CardTitle>
              <CardDescription>{t('dashboard.hourlyDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={data.todayByHour} margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="hour" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} 
                      dy={10}
                      tickFormatter={(val) => `${val}:00`}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(label) => `${label}:00 - ${Number(label)+1}:00`}
                    />
                    {isViewingToday && <ReferenceLine x={currentHour} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'top', value: t('dashboard.now'), fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} />}
                    <Bar 
                      dataKey="count" 
                      name="Reservations"
                      radius={[6, 6, 0, 0]}
                      barSize={30}
                    >
                      {data.todayByHour.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.hour === currentHour ? '#3b82f6' : (entry.hour < currentHour ? '#cbd5e1' : '#818cf8')} />
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
