'use client';

import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, TrendingUp, Users, CalendarDays, DollarSign } from 'lucide-react';

export default function AnalyticsPage() {
  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analytics & Insights</h1>
          <p className="text-xs text-slate-500 font-medium">Performance overview and operational metrics.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Total Reservations</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                1,248
                <CalendarDays className="w-5 h-5 text-blue-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center text-xs text-emerald-600 font-bold gap-1 mt-2">
                <TrendingUp className="w-3 h-3" /> +12.5% this month
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Guests Seated</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                4,892
                <Users className="w-5 h-5 text-indigo-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center text-xs text-emerald-600 font-bold gap-1 mt-2">
                <TrendingUp className="w-3 h-3" /> +8.2% this month
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Avg. Table Turn</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                72m
                <BarChart3 className="w-5 h-5 text-amber-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center text-xs text-rose-600 font-bold gap-1 mt-2">
                <TrendingUp className="w-3 h-3 rotate-180" /> +5m vs last month
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-100 shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Deposit Revenue</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                ₺42.5k
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex items-center text-xs text-emerald-600 font-bold gap-1 mt-2">
                <TrendingUp className="w-3 h-3" /> +24% this month
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-100 shadow-sm bg-white min-h-[400px]">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-700">Monthly Traffic</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-8 h-80">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-2 text-blue-500">
                <BarChart3 className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Advanced Analytics Hub</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Connect your data source to visualize multi-dimensional charts, heatmaps, and peak traffic predictions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
