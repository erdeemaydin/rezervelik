'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Calendar, Clock, Activity, Loader2, Star, CheckCircle2, Clock3, XCircle, AlertCircle } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from 'recharts';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/i18n/provider';

interface UpcomingReservation {
  customerName: string;
  guestCount: number;
  startTime: string;
  table: { identifier: string } | null;
  status: string;
  isVIP: boolean;
}

interface TodayStats {
  todayReservations: number;
  todayGuests: number;
  pendingCount: number;
  confirmedCount: number;
  canceledCount: number;
  noShowCount: number;
  upcomingReservations: UpcomingReservation[];
  todayByHour: { hour: number; count: number }[];
  avgDuration: number;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await api.get('/restaurants/today');
        setData(response.data.data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        toast.error('Failed to load dashboard statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    // Optional: Refresh every 5 minutes
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <AdminLayout>
        <div className="flex h-[70vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-slate-500 font-medium">{t('dashboard.loading')}</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!data) return null;

  const currentHour = new Date().getHours();

  return (
    <AdminLayout>
      <div className="space-y-8 animate-in fade-in duration-500 pb-8">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t('dashboard.todaysOperations')}</h1>
            <p className="text-slate-500 mt-1">{t('dashboard.realtimeCommand')}</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full flex items-center shadow-sm">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
              {t('dashboard.liveData')}
            </span>
          </div>
        </div>

        {/* Top Stat Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="overflow-hidden group hover:shadow-md transition-all">
            <div className="h-1 w-full bg-blue-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('dashboard.reservationsToday')}</p>
                <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-3 mt-1">
                <h2 className="text-3xl font-black text-slate-900">{data.todayReservations}</h2>
              </div>
            </CardContent>
          </Card>
          
          <Card className="overflow-hidden group hover:shadow-md transition-all">
            <div className="h-1 w-full bg-indigo-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('dashboard.expectedGuests')}</p>
                <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                  <Users className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-1 mt-1">
                <h2 className="text-3xl font-black text-slate-900">{data.todayGuests}</h2>
                <span className="text-sm font-bold text-slate-400">{t('dashboard.confirmed')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden group hover:shadow-md transition-all">
            <div className="h-1 w-full bg-amber-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('dashboard.avgDuration')}</p>
                <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-2 mt-1">
                <h2 className="text-3xl font-black text-slate-900">{data.avgDuration || '--'}</h2>
                <span className="text-sm font-bold text-slate-400 uppercase">{t('dashboard.minutes')}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden group hover:shadow-md transition-all">
            <div className="h-1 w-full bg-rose-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{t('dashboard.actionRequired')}</p>
                <div className="p-2 bg-rose-50 rounded-lg group-hover:bg-rose-100 transition-colors">
                  <Activity className="h-5 w-5 text-rose-600" />
                </div>
              </div>
              <div className="flex items-baseline mt-1 space-x-2">
                <h2 className={`text-3xl font-black ${data.pendingCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{data.pendingCount}</h2>
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
                  <span className="text-lg font-black text-slate-900">{data.confirmedCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg"><Clock3 className="w-4 h-4 text-amber-600" /></div>
                    <span className="font-semibold text-slate-700">{t('dashboard.pending')}</span>
                  </div>
                  <span className="text-lg font-black text-slate-900">{data.pendingCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg"><XCircle className="w-4 h-4 text-slate-600" /></div>
                    <span className="font-semibold text-slate-700">{t('dashboard.canceled')}</span>
                  </div>
                  <span className="text-lg font-black text-slate-900">{data.canceledCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 rounded-lg"><AlertCircle className="w-4 h-4 text-rose-600" /></div>
                    <span className="font-semibold text-slate-700">{t('dashboard.noShow')}</span>
                  </div>
                  <span className="text-lg font-black text-slate-900">{data.noShowCount}</span>
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
                    <ReferenceLine x={currentHour} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'top', value: 'Now', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }} />
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

        {/* Bottom Row - Upcoming Timeline */}
        <Card className="shadow-sm border-slate-200">
          <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-lg text-slate-800">{t('dashboard.upcomingTimeline')}</CardTitle>
            <CardDescription>{t('dashboard.nextReservations')} {data.upcomingReservations.length} {t('dashboard.reservationsArrivingToday')}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 p-0">
            {data.upcomingReservations.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>{t('dashboard.noMoreReservations')}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.upcomingReservations.map((res, i) => (
                  <div key={i} className="flex items-center p-4 hover:bg-slate-50 transition-colors">
                    <div className="w-24 text-sm font-bold text-slate-600">
                      {new Date(res.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="flex-1 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{res.customerName}</span>
                        {res.isVIP && <Badge className="bg-amber-100 text-amber-800 border-amber-200 px-1.5 py-0 rounded text-[10px]">VIP <Star className="w-3 h-3 inline ml-0.5"/></Badge>}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                        <span className="flex items-center"><Users className="w-3 h-3 mr-1"/> {res.guestCount} {t('dashboard.guests').toLowerCase()}</span>
                        {res.table && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span className="font-medium text-indigo-600">{t('dashboard.table')} {res.table.identifier}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div>
                      <Badge variant="outline" className={
                        res.status === 'CONFIRMED' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                        res.status === 'PENDING' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                        'border-slate-200 text-slate-700 bg-slate-50'
                      }>
                        {res.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AdminLayout>
  );
}
