'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Server, RefreshCw } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface AuditLog {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  restaurantId: string | null;
  action: string;
  category: string;
  targetType: string | null;
  targetLabel: string | null;
  restaurant?: { id: string; name: string; slug: string } | null;
}

const CATEGORIES = ['ALL', 'AUTH', 'TENANT', 'SETTINGS', 'SUBSCRIPTION', 'PERMISSIONS', 'RESERVATION', 'PAYMENT', 'SYSTEM'];

const categoryColor = (c: string) => {
  switch (c) {
    case 'AUTH': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'TENANT': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'SETTINGS': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'SUBSCRIPTION': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'PERMISSIONS': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'RESERVATION': return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'PAYMENT': return 'bg-rose-50 text-rose-700 border-rose-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export default function SystemAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('ALL');
  const [restaurantId, setRestaurantId] = useState('ALL');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = { limit: '200' };
      if (category !== 'ALL') params.category = category;
      if (restaurantId !== 'ALL') params.restaurantId = restaurantId;
      const res = await api.get('/system/audit', { params });
      setLogs(res.data.data);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  }, [category, restaurantId]);

  useEffect(() => {
    api.get('/system/tenants').then((res) => setTenants(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Activity Audit</h1>
            <p className="text-xs text-slate-500 font-medium">Platform-wide log of administrative and tenant activity.</p>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 h-8 px-3 text-xs font-bold text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
          </button>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-slate-600" />
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-700">Audit Trail</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={restaurantId}
                  onChange={(e) => setRestaurantId(e.target.value)}
                  className="h-8 px-2 text-xs font-bold border border-slate-200 rounded-md bg-white max-w-[200px]"
                >
                  <option value="ALL">All Tenants + Platform</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-8 px-2 text-xs font-bold border border-slate-200 rounded-md bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c === 'ALL' ? 'All Categories' : c}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="text-xs font-bold text-slate-500 whitespace-nowrap">Timestamp</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500">Actor</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500">Action</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500">Scope</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500">Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs font-bold text-slate-400">Loading audit trail…</TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs font-bold text-slate-400">No activity recorded for this filter.</TableCell></TableRow>
                  ) : logs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <TableCell className="font-mono text-[11px] text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-xs text-slate-800">{log.actorName || log.actorEmail || 'System'}</div>
                        {log.actorRole && <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{log.actorRole}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className={cn('text-[9px] font-black uppercase w-fit px-1.5', categoryColor(log.category))}>
                            {log.category}
                          </Badge>
                          <span className="text-[11px] font-semibold text-slate-600">{log.action.replace(/_/g, ' ').toLowerCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.restaurant ? (
                          <span className="font-semibold text-slate-700">{log.restaurant.name}</span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Platform</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {log.targetLabel || log.targetType || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
