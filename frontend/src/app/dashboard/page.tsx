'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Grid, Calendar, TrendingUp, Clock, Activity, Loader2 } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import api from '@/lib/api';
import { toast } from 'sonner';

const COLORS = ['#2563eb', '#38bdf8', '#818cf8', '#6366f1', '#a855f7'];

interface DashboardStats {
  stats: {
    totalReservations: number;
    activeTables: number;
    totalTables: number;
    staffOnline: number;
    occupancyRate: number;
  };
  volumeData: { name: string; total: number }[];
  zoneData: { name: string; value: number }[];
  recentActivity: {
    id: string;
    time: string;
    user: string;
    action: string;
    type: string;
  }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await api.get('/restaurants/stats');
        setData(response.data.data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        toast.error('Failed to load dashboard statistics');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex h-[70vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-slate-500 font-medium">Loading your dashboard...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!data) return null;

  return (
    <AdminLayout>
      <div className="space-y-8 animate-in fade-in duration-500">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Overview</h1>
            <p className="text-slate-500 mt-1">Real-time performance metrics for your restaurant.</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full flex items-center shadow-sm">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
              LIVE DATA ACTIVE
            </span>
          </div>
        </div>

        {/* Top Stat Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="overflow-hidden group">
            <div className="h-1 w-full bg-blue-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Reservations</p>
                <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-3 mt-1">
                <h2 className="text-3xl font-black text-slate-900">{data.stats.totalReservations}</h2>
                <span className="text-xs font-bold text-slate-400">LAST 30D</span>
              </div>
              <div className="flex items-center mt-3 text-emerald-600">
                <TrendingUp className="w-3.5 h-3.5 mr-1" />
                <span className="text-xs font-bold">+12% from last month</span>
              </div>
            </CardContent>
          </Card>
          
          <Card className="overflow-hidden group">
            <div className="h-1 w-full bg-indigo-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Table Occupancy</p>
                <div className="p-2 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                  <Grid className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-1 mt-1">
                <h2 className="text-3xl font-black text-slate-900">{data.stats.activeTables}</h2>
                <span className="text-lg text-slate-400 font-bold">/ {data.stats.totalTables}</span>
              </div>
              <div className="mt-4 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-1000" 
                  style={{ width: `${data.stats.occupancyRate}%` }}
                ></div>
              </div>
              <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-tight">{data.stats.occupancyRate}% Current Capacity</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden group">
            <div className="h-1 w-full bg-amber-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Avg. Stay</p>
                <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-100 transition-colors">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <div className="flex items-baseline space-x-2 mt-1">
                <h2 className="text-3xl font-black text-slate-900">85</h2>
                <span className="text-sm font-bold text-slate-400 uppercase">minutes</span>
              </div>
              <p className="text-[10px] font-bold text-emerald-600 mt-4 uppercase tracking-tight italic">Optimizing turnaround</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden group">
            <div className="h-1 w-full bg-emerald-500"></div>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Staff on Shift</p>
                <div className="p-2 bg-emerald-50 rounded-lg group-hover:bg-emerald-100 transition-colors">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
              <div className="flex items-baseline mt-1">
                <h2 className="text-3xl font-black text-slate-900">{data.stats.staffOnline}</h2>
              </div>
              <p className="text-[10px] font-bold text-slate-500 mt-4 uppercase tracking-tight">Assigned for today</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 md:grid-cols-7">
          
          {/* Main Chart */}
          <Card className="md:col-span-4 lg:col-span-5">
            <CardHeader className="pb-2 bg-slate-50/20">
              <CardTitle className="text-lg">Weekly Reservation Volume</CardTitle>
              <CardDescription>Number of bookings per day over the last 7 days</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.volumeData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar 
                      dataKey="total" 
                      fill="#3b82f6" 
                      radius={[6, 6, 0, 0]}
                      barSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Donut Chart */}
          <Card className="md:col-span-3 lg:col-span-2">
            <CardHeader className="pb-2 bg-slate-50/20">
              <CardTitle className="text-lg">Zone Popularity</CardTitle>
              <CardDescription>Distribution of seat preferences</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[220px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.zoneData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={8}
                      dataKey="value"
                      stroke="none"
                    >
                      {data.zoneData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-6 space-y-3">
                {data.zoneData.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between text-xs font-bold uppercase tracking-tight">
                    <div className="flex items-center">
                      <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                      <span className="text-slate-500">{item.name}</span>
                    </div>
                    <span className="text-slate-900">{item.value} Bookings</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row - Activity Feed */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="">
            <CardHeader className="pb-2 bg-slate-50/20">
              <CardTitle className="text-lg">Recent System Activity</CardTitle>
              <CardDescription>Latest logs from reservations and staff actions</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {data.recentActivity.map((log, i) => (
                  <div key={log.id} className="flex space-x-4 group">
                    <div className="mt-0.5">
                      <div className={`p-2 rounded-xl transition-all ${log.type === 'system' ? 'bg-slate-100 text-slate-600 group-hover:bg-slate-200' : 'bg-blue-100 text-blue-600 group-hover:bg-blue-200'}`}>
                        <Activity className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex-1 border-b border-slate-100 pb-4 last:border-0">
                      <p className="text-sm text-slate-800 leading-tight">
                        <span className="font-bold text-blue-700">{log.user}</span> {log.action}
                      </p>
                      <p className="text-[10px] font-black text-slate-400 mt-1.5 uppercase tracking-widest">
                        {new Date(log.time).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
                {data.recentActivity.length === 0 && (
                  <p className="text-center text-slate-400 py-8 italic">No recent activity found.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 bg-indigo-50/50">
              <CardTitle className="text-lg flex items-center text-indigo-900">
                <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                Quick Insights
              </CardTitle>
              <CardDescription>AI-powered suggestions for your business</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm shadow-indigo-100/50 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm text-indigo-900 flex items-center">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center mr-2">
                        <TrendingUp className="w-3 h-3 text-indigo-600" />
                      </div>
                      Peak Hours Detected
                    </h4>
                    <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border-none text-[10px] uppercase font-black">Actionable</Badge>
                  </div>
                  <p className="text-xs text-slate-600 pl-8 leading-relaxed">Friday evenings (19:00 - 21:00) are seeing <span className="font-bold text-indigo-600">95% occupancy</span>. Consider adding another waiter.</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm shadow-blue-100/50 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm text-blue-900 flex items-center">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-2">
                        <Users className="w-3 h-3 text-blue-600" />
                      </div>
                      VIP Retention
                    </h4>
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-none text-[10px] uppercase font-black">Alert</Badge>
                  </div>
                  <p className="text-xs text-slate-600 pl-8 leading-relaxed">3 regular VIP customers haven't visited in 2 weeks. Send a loyalty discount?</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </AdminLayout>
  );
}
