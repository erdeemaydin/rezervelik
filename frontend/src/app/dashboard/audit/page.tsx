'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Scroll, ArrowClockwise, ShieldWarning, CaretRight } from '@phosphor-icons/react';
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
  targetId: string | null;
  targetLabel: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
}

const CATEGORIES = ['ALL', 'AUTH', 'SETTINGS', 'RESERVATION', 'PERMISSIONS', 'SUBSCRIPTION', 'TENANT'];

const categoryColor = (c: string) => {
  switch (c) {
    case 'AUTH': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'SETTINGS': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'RESERVATION': return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'PERMISSIONS': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'SUBSCRIPTION': return 'bg-purple-50 text-purple-700 border-purple-200';
    default: return 'bg-slate-100 text-slate-600 border-border';
  }
};

export default function TenantAuditPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [category, setCategory] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

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
      <>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center max-w-md space-y-3">
            <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto text-amber-500">
              <ShieldWarning className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">{t('audit.notEnabledTitle')}</h2>
            <p className="text-sm text-slate-500 leading-relaxed">{t('audit.notEnabledDesc')}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t('audit.title')}</h1>
            <p className="text-xs text-slate-500 font-medium">{t('audit.subtitle')}</p>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 h-8 px-3 text-xs font-bold text-slate-600 border border-border rounded-md hover:bg-slate-50"
          >
            <ArrowClockwise className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> {t('audit.refresh')}
          </button>
        </div>

        <Card className="border-border shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-border bg-slate-50/50 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Scroll className="w-4 h-4 text-slate-600" />
                <CardTitle className="text-sm font-bold text-slate-700">{t('audit.title')}</CardTitle>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-8 px-2 text-xs font-bold border border-border rounded-md bg-white transition-colors outline-none hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs font-bold text-slate-400">{t('audit.loading')}</TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs font-bold text-slate-400">{t('audit.empty')}</TableCell></TableRow>
                  ) : logs.map((log) => (
                    <TableRow
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedLog(log); } }}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <TableCell className="font-mono text-[11px] text-slate-500 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-xs text-slate-800">{log.actorName || log.actorEmail || 'System'}</div>
                        {log.actorRole && <div className="text-[10px] text-slate-400 font-bold">{log.actorRole}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
 <Badge variant="outline"className={cn('text-[9px] font-semibold w-fit px-1.5', categoryColor(log.category))}>
                            {log.category}
                          </Badge>
                          <span className="text-[11px] font-semibold text-slate-600">{log.action.replace(/_/g, ' ').toLowerCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">{log.targetLabel || log.targetType || '—'}</TableCell>
                      <TableCell className="text-slate-300">
                        <CaretRight className="w-4 h-4" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail dialog — the list row is a compact summary; this is where the
          actual before/after (log.metadata) and other raw fields are shown. */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          {selectedLog && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Scroll className="w-4 h-4 text-slate-500" />
                  {selectedLog.action.replace(/_/g, ' ').toLowerCase()}
                </DialogTitle>
                <DialogDescription className="font-mono text-[11px]">
                  {new Date(selectedLog.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-semibold text-slate-400">{t('audit.colActor')}</div>
                    <div className="font-semibold text-slate-800">{selectedLog.actorName || selectedLog.actorEmail || 'System'}</div>
                    {selectedLog.actorRole && <div className="text-[10px] text-slate-400 font-bold">{selectedLog.actorRole}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-slate-400">{t('audit.detailCategory')}</div>
 <Badge variant="outline"className={cn('text-[9px] font-semibold w-fit px-1.5 mt-0.5', categoryColor(selectedLog.category))}>
                      {selectedLog.category}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-slate-400">{t('audit.colTarget')}</div>
                    <div className="text-slate-700">{selectedLog.targetLabel || selectedLog.targetType || '—'}</div>
                    {selectedLog.targetId && <div className="text-[10px] text-slate-400 font-mono truncate">{selectedLog.targetId}</div>}
                  </div>
                  {selectedLog.ip && (
                    <div>
                      <div className="text-[10px] font-semibold text-slate-400">{t('audit.detailIp')}</div>
                      <div className="text-slate-700 font-mono text-xs">{selectedLog.ip}</div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-slate-400 mb-1.5">{t('audit.detailChanges')}</div>
                  {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 ? (
                    <pre className="bg-slate-50 border border-border rounded-lg p-3 text-[11px] font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-xs text-slate-400 italic bg-slate-50 border border-border rounded-lg p-3">
                      {t('audit.detailNoChanges')}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
