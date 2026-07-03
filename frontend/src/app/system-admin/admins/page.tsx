'use client';

import SystemAdminLayout from '@/components/layout/SystemAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShieldCheck, KeyRound, Copy } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function SystemAdminsPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string>('');
  const [resetExpiryMins, setResetExpiryMins] = useState<number | null>(null);
  const [resetLoadingId, setResetLoadingId] = useState<string | null>(null);

  const handleGenerateReset = async (admin: any) => {
    try {
      setResetLoadingId(admin.id);
      const res = await api.post(`/system/users/${admin.id}/reset-link`);
      setResetLink(`${window.location.origin}${res.data.data.resetLink}`);
      setResetTarget(admin.email);
      setResetExpiryMins(res.data.data.expiresInMinutes ?? null);
      setResetOpen(true);
    } catch (err) {
      toast.error('Failed to generate reset link');
    } finally {
      setResetLoadingId(null);
    }
  };

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const res = await api.get('/system/admins');
        setAdmins(res.data.data);
      } catch (err) {
        toast.error('Failed to load admins');
      } finally {
        setLoading(false);
      }
    };
    fetchAdmins();
  }, []);

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
                  <TableHead className="text-xs font-bold text-slate-500">Created At</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-xs font-bold text-slate-400">Loading administrators...</TableCell>
                  </TableRow>
                ) : admins.map((admin) => (
                  <TableRow key={admin.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="font-semibold text-sm text-slate-800">{admin.firstName} {admin.lastName}</TableCell>
                    <TableCell className="text-xs text-slate-500">{admin.email}</TableCell>
                    <TableCell>
                      <Badge className={admin.role === 'SUPER_ADMIN' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}>
                        {admin.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(admin.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" disabled={resetLoadingId === admin.id} onClick={() => handleGenerateReset(admin)} className="h-7 text-[10px] font-bold text-slate-500 hover:text-amber-600 hover:bg-amber-50 px-2">
                        <KeyRound className="w-3.5 h-3.5 mr-1.5" /> {resetLoadingId === admin.id ? 'Generating…' : 'Reset Link'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent maxWidth="sm:max-w-md" className="p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <KeyRound className="w-4 h-4 text-amber-500" /> Password Reset Link
            </DialogTitle>
            <DialogDescription className="text-xs">
              Single-use link for <span className="font-bold text-slate-700">{resetTarget}</span>. Share it securely — anyone with the link can set a new password.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <Input readOnly value={resetLink || ''} className="h-9 text-[10px] font-mono border-slate-200 bg-slate-50" onFocus={(e) => e.target.select()} />
            <Button type="button" size="sm" onClick={() => { if (resetLink) { navigator.clipboard.writeText(resetLink); toast.success('Copied to clipboard!'); } }} className="h-9 shrink-0 bg-slate-900 hover:bg-slate-800 text-white">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-[9px] text-amber-600 font-bold uppercase tracking-wide">
            {resetExpiryMins ? `Expires in ${resetExpiryMins} minutes · ` : ''}Single use
          </p>
        </DialogContent>
      </Dialog>
    </SystemAdminLayout>
  );
}
