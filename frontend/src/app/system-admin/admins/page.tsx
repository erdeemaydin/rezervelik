'use client';

import SystemAdminLayout from '@/components/layout/SystemAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

export default function SystemAdminsPage() {
  const admins = [
    { id: '1', name: 'John Root', email: 'root@reservepro.com', role: 'SUPER_ADMIN', lastLogin: '2026-05-15 10:00:00' },
    { id: '2', name: 'Alice Manager', email: 'alice@reservepro.com', role: 'SYSTEM_SUPPORT', lastLogin: '2026-05-14 14:30:00' }
  ];

  return (
    <SystemAdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Super Admins</h1>
            <p className="text-xs text-slate-500 font-medium">Manage platform administrators and their access levels.</p>
          </div>
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold shadow-sm">Add Administrator</Button>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-slate-700">Access Roster</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-xs font-bold text-slate-500">Name</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">Email</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">Role Level</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 text-right">Last Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="font-semibold text-sm text-slate-800">{admin.name}</TableCell>
                    <TableCell className="text-xs text-slate-500">{admin.email}</TableCell>
                    <TableCell>
                      <Badge className={admin.role === 'SUPER_ADMIN' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}>
                        {admin.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 text-right">{admin.lastLogin}</TableCell>
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
