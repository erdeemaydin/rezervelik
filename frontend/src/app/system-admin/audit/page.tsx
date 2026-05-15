'use client';

import SystemAdminLayout from '@/components/layout/SystemAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Server } from 'lucide-react';

export default function SystemAuditPage() {
  const auditLogs = [
    { id: '1', action: 'TENANT_PROVISIONED', actor: 'root@reservepro.com', target: 'BurgerKing Inc.', timestamp: '2026-05-15 11:20:00' },
    { id: '2', action: 'FEATURE_FLAG_UPDATED', actor: 'root@reservepro.com', target: 'SushiBar Ltd.', timestamp: '2026-05-15 10:45:00' },
    { id: '3', action: 'ADMIN_LOGIN', actor: 'alice@reservepro.com', target: 'System', timestamp: '2026-05-14 14:30:00' },
    { id: '4', action: 'GLOBAL_SETTING_CHANGED', actor: 'root@reservepro.com', target: 'Maintenance Mode', timestamp: '2026-05-14 02:00:00' },
  ];

  return (
    <SystemAdminLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Activity Audit</h1>
          <p className="text-xs text-slate-500 font-medium">Immutable log of system-level administrative actions.</p>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-600" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-700">Audit Trail</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-xs font-bold text-slate-500">Timestamp</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">Actor</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">Action</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="font-mono text-xs text-slate-500">{log.timestamp}</TableCell>
                    <TableCell className="font-semibold text-sm text-slate-800">{log.actor}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-black uppercase text-slate-600 bg-slate-50">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{log.target}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </SystemAdminLayout>
  );
}
