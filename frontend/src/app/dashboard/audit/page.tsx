'use client';

import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollText, RefreshCw, ShieldAlert } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/i18n/provider';

interface AuditLog {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  category: string;
  targetType: string | null;
  targetLabel: string | null;
}

const CATEGORIES = ['ALL', 'AUTH', 'SETTINGS', 'RESERVATION', 'PERMISSIONS', 'SUBSCRIPTION', 'TENANT'];

const categoryColor = (c: string) => {
  switch (c) {
    case 'AUTH': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'SETTINGS': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'RESERVATION': return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'PERMISSIONS': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'SUBSCRIPTION': return 'bg-purple-50 text-purple-700 border-purple-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export default function TenantAuditPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [category, setCategory] = useState('ALL');

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = { limit: '200' };
      if (category !== 'ALL') params.category = category;
      const res = await api.get('/audit', { params });
      setLogs(res.data.data);
      setForbidden(false);
    } catch (err: any) {
      if (err?.response?.status === 403) setForbidden(true);
      else console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (forbidden) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center max-w-md space-y-3">
            <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto text-amber-500">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{t('audit.notEnabledTitle')}</h2>
            <p className="text-sm text-slate-500 leading-relaxed">{t('audit.notEnabledDesc')}</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{t('audit.title')}</h1>
            <p className="text-xs text-slate-500 font-medium">{t('audit.subtitle')}</p>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 h-8 px-3 text-xs font-bold text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> {t('audit.refresh')}
          </button>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-slate-600" />
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-700">{t('audit.title')}</CardTitle>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-8 px-2 text-xs font-bold border border-slate-200 rounded-md bg-white"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c === 'ALL' ? t('audit.allCategories') : c}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                    <TableHead className="text-xs font-bold text-slate-500 whitespace-nowrap">{t('audit.colTime')}</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500">{t('audit.colActor')}</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500">{t('audit.colAction')}</TableHead>
                    <TableHead className="text-xs font-bold text-slate-500">{t('audit.colTarget')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-xs font-bold text-slate-400">{t('audit.loading')}</TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-xs font-bold text-slate-400">{t('audit.empty')}</TableCell></TableRow>
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
                      <TableCell className="text-xs text-slate-600">{log.targetLabel || log.targetType || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
