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
    case 'SETTINGS': return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50';
    case 'RESERVATION': return 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800/50';
    case 'PERMISSIONS': return 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50';
    case 'SUBSCRIPTION': return 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/50';
    default: return 'bg-muted text-muted-foreground border-border';
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
            <div className="w-14 h-14 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800/50 flex items-center justify-center mx-auto text-amber-500 dark:text-amber-400">
              <ShieldWarning className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-foreground">{t('audit.notEnabledTitle')}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{t('audit.notEnabledDesc')}</p>
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground font-heading">{t('audit.title')}</h1>
            <p className="text-xs text-muted-foreground font-medium">{t('audit.subtitle')}</p>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-2 h-8 px-3 text-xs font-bold text-muted-foreground border border-border rounded-md hover:bg-muted"
          >
            <ArrowClockwise className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> {t('audit.refresh')}
          </button>
        </div>

        <Card className="border-border shadow-sm bg-card overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/50 p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Scroll className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-bold text-foreground">{t('audit.title')}</CardTitle>
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-8 px-2 text-xs font-bold border border-border rounded-md bg-card transition-colors outline-none hover:border-ring focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-bold text-muted-foreground whitespace-nowrap">{t('audit.colTime')}</TableHead>
                    <TableHead className="text-xs font-bold text-muted-foreground">{t('audit.colActor')}</TableHead>
                    <TableHead className="text-xs font-bold text-muted-foreground">{t('audit.colAction')}</TableHead>
                    <TableHead className="text-xs font-bold text-muted-foreground">{t('audit.colTarget')}</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs font-bold text-muted-foreground">{t('audit.loading')}</TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-xs font-bold text-muted-foreground">{t('audit.empty')}</TableCell></TableRow>
                  ) : logs.map((log) => (
                    <TableRow
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedLog(log); } }}
                      className="hover:bg-muted/80 transition-colors cursor-pointer"
                    >
                      <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-xs text-foreground">{log.actorName || log.actorEmail || 'System'}</div>
                        {log.actorRole && <div className="text-[10px] text-muted-foreground font-bold">{log.actorRole}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
 <Badge variant="outline"className={cn('text-[9px] font-semibold w-fit px-1.5', categoryColor(log.category))}>
                            {log.category}
                          </Badge>
                          <span className="text-[11px] font-semibold text-muted-foreground">{log.action.replace(/_/g, ' ').toLowerCase()}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.targetLabel || log.targetType || '—'}</TableCell>
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
                  <Scroll className="w-4 h-4 text-muted-foreground" />
                  {selectedLog.action.replace(/_/g, ' ').toLowerCase()}
                </DialogTitle>
                <DialogDescription className="font-mono text-[11px]">
                  {new Date(selectedLog.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground">{t('audit.colActor')}</div>
                    <div className="font-semibold text-foreground">{selectedLog.actorName || selectedLog.actorEmail || 'System'}</div>
                    {selectedLog.actorRole && <div className="text-[10px] text-muted-foreground font-bold">{selectedLog.actorRole}</div>}
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground">{t('audit.detailCategory')}</div>
 <Badge variant="outline"className={cn('text-[9px] font-semibold w-fit px-1.5 mt-0.5', categoryColor(selectedLog.category))}>
                      {selectedLog.category}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground">{t('audit.colTarget')}</div>
                    <div className="text-foreground">{selectedLog.targetLabel || selectedLog.targetType || '—'}</div>
                    {selectedLog.targetId && <div className="text-[10px] text-muted-foreground font-mono truncate">{selectedLog.targetId}</div>}
                  </div>
                  {selectedLog.ip && (
                    <div>
                      <div className="text-[10px] font-semibold text-muted-foreground">{t('audit.detailIp')}</div>
                      <div className="text-foreground font-mono text-xs">{selectedLog.ip}</div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground mb-1.5">{t('audit.detailChanges')}</div>
                  {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 ? (
                    <pre className="bg-muted border border-border rounded-lg p-3 text-[11px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  ) : (
                    <div className="text-xs text-muted-foreground italic bg-muted border border-border rounded-lg p-3">
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
