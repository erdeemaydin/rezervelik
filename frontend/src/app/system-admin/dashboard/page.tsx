'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ChartBar, Buildings, Users, Database } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { SmallBox } from '@/components/dashboard/StatBoxes';

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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <SmallBox tone="green" value={metrics.totalTenants} label="Active Tenants" icon={Buildings} footer="+3 this month" href="/system-admin/tenants" />
          <SmallBox tone="aqua" value={metrics.totalUsers} label="Total Users" icon={Users} footer="+12 this month" />
          <SmallBox tone="yellow" value={metrics.totalReservations} label="Total Reservations" icon={ChartBar} footer="Stable" />
          <SmallBox tone="purple" value="1.4 GB" label="DB Size" icon={Database} footer="8% used" />
        </div>

        <Card tone="primary" className="border-border shadow-sm bg-card min-h-[400px]">
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
