'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChartBar, Buildings, Users, Database } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

export default function SystemAdminDashboard() {
  const [metrics, setMetrics] = useState({ totalTenants: 0, totalUsers: 0, totalReservations: 0 });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await api.get('/system/metrics');
        setMetrics(res.data.data);
      } catch (err) {
        console.error('Failed to load metrics');
      }
    };
    fetchMetrics();
  }, []);
  return (
    <>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-heading">System Metrics</h1>
          <p className="text-xs text-muted-foreground font-medium">Global platform statistics across all tenants.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">Active Tenants</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                {metrics.totalTenants}
                <Buildings className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-2">+3 this month</p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">Total Users</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                {metrics.totalUsers}
                <Users className="w-5 h-5 text-blue-600" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-blue-600 font-bold mt-2">+12 this month</p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">Total Reservations</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                {metrics.totalReservations}
                <ChartBar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-2">Stable</p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[10px] font-semibold text-muted-foreground">DB Size</CardDescription>
              <CardTitle className="text-2xl font-bold flex items-center justify-between">
                1.4 GB
                <Database className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-2">8% used</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border shadow-sm bg-card min-h-[400px]">
          <CardHeader className="border-b border-border bg-muted/50">
            <CardTitle className="text-sm font-bold text-foreground">Platform Traffic</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-8 h-80">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-2 text-muted-foreground">
                <ChartBar className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Metrics visualization</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Connect your external monitoring tools (Datadog, Prometheus) to visualize latency and throughput.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
