'use client';

import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Grid, Calendar, TrendingUp, TrendingDown, Clock, Activity } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const revenueData = [
  { name: 'Mon', total: 1200 },
  { name: 'Tue', total: 1800 },
  { name: 'Wed', total: 2200 },
  { name: 'Thu', total: 2600 },
  { name: 'Fri', total: 3400 },
  { name: 'Sat', total: 4800 },
  { name: 'Sun', total: 3900 },
];

const tableUsageData = [
  { name: 'Indoor', value: 400 },
  { name: 'Terrace', value: 300 },
  { name: 'VIP', value: 100 },
];
const COLORS = ['#2563eb', '#38bdf8', '#818cf8'];

export default function DashboardPage() {
  return (
    <AdminLayout>
      <div className="space-y-8">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard Overview</h1>
            <p className="text-slate-500 mt-1">Here is what is happening in your restaurant today.</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-2">
            <span className="text-sm font-medium text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full flex items-center">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
              Live Tracking Active
            </span>
          </div>
        </div>

        {/* Top Stat Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-slate-600">Total Reservations</p>
                <div className="p-2 bg-blue-50 rounded-lg"><Calendar className="h-5 w-5 text-blue-600" /></div>
              </div>
              <div className="flex items-baseline space-x-3">
                <h2 className="text-3xl font-bold text-slate-900">124</h2>
                <span className="text-sm font-medium text-emerald-600 flex items-center">
                  <TrendingUp className="w-3 h-3 mr-1" /> +14%
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">vs. last week</p>
            </CardContent>
          </Card>
          
          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-slate-600">Active Tables</p>
                <div className="p-2 bg-blue-50 rounded-lg"><Grid className="h-5 w-5 text-blue-600" /></div>
              </div>
              <div className="flex items-baseline space-x-3">
                <h2 className="text-3xl font-bold text-slate-900">18<span className="text-lg text-slate-400 font-normal">/32</span></h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">56% current occupancy</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-slate-600">Avg. Turnaround Time</p>
                <div className="p-2 bg-amber-50 rounded-lg"><Clock className="h-5 w-5 text-amber-600" /></div>
              </div>
              <div className="flex items-baseline space-x-3">
                <h2 className="text-3xl font-bold text-slate-900">72<span className="text-lg text-slate-400 font-normal"> min</span></h2>
                <span className="text-sm font-medium text-red-500 flex items-center">
                  <TrendingDown className="w-3 h-3 mr-1" /> -4m
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Improving efficiency</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-slate-600">Staff Online</p>
                <div className="p-2 bg-emerald-50 rounded-lg"><Users className="h-5 w-5 text-emerald-600" /></div>
              </div>
              <div className="flex items-baseline space-x-3">
                <h2 className="text-3xl font-bold text-slate-900">8</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">Waiters & Managers</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 md:grid-cols-7">
          
          {/* Main Chart */}
          <Card className="md:col-span-4 lg:col-span-5 border-0 shadow-sm ring-1 ring-slate-200">
            <CardHeader>
              <CardTitle>Reservation Volume</CardTitle>
              <CardDescription>Number of guests booked per day over the current week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12 }} 
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748b', fontSize: 12 }}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="#2563eb" 
                      strokeWidth={3}
                      dot={{ r: 4, strokeWidth: 2 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Donut Chart */}
          <Card className="md:col-span-3 lg:col-span-2 border-0 shadow-sm ring-1 ring-slate-200">
            <CardHeader>
              <CardTitle>Zone Popularity</CardTitle>
              <CardDescription>Where guests prefer to sit</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tableUsageData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {tableUsageData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {tableUsageData.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[idx] }}></span>
                      <span className="text-slate-600">{item.name}</span>
                    </div>
                    <span className="font-medium text-slate-900">{item.value} bookings</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Row - Activity Feed */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-0 shadow-sm ring-1 ring-slate-200">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest actions from your staff and system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {[
                  { time: 'Just now', user: 'System', action: 'Auto-confirmed table 12 for Smith party', type: 'system' },
                  { time: '10 min ago', user: 'Sarah M.', action: 'Cleared Table 4 (Terrace)', type: 'staff' },
                  { time: '1 hour ago', user: 'John D.', action: 'Created new reservation for 6 people', type: 'staff' },
                  { time: '2 hours ago', user: 'System', action: 'Daily report generated', type: 'system' },
                ].map((log, i) => (
                  <div key={i} className="flex space-x-4">
                    <div className="mt-0.5">
                      <div className={`p-1.5 rounded-full ${log.type === 'system' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-600'}`}>
                        <Activity className="w-4 h-4" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-800"><span className="font-medium">{log.user}</span> {log.action}</p>
                      <p className="text-xs text-slate-500 mt-1">{log.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </AdminLayout>
  );
}
