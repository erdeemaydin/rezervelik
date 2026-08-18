'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck, ShieldOff, KeyRound, Copy, Plus, Settings2, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/store/useAuthStore';
import { SYSTEM_PERMISSIONS, SystemPermissionKey } from '@/lib/systemPermissions';

const splitPermissions = (raw?: string | null): SystemPermissionKey[] =>
  (raw ? raw.split(',') : []).filter(Boolean) as SystemPermissionKey[];

// Shared checkbox list used by both the Add and Edit-permissions dialogs — a
// restricted sub-admin can never be granted anything outside this fixed,
// backend-enforced whitelist (see src/config/systemPermissions.ts on the API).
function PermissionPicker({ value, onChange }: { value: SystemPermissionKey[]; onChange: (next: SystemPermissionKey[]) => void }) {
  const toggle = (key: SystemPermissionKey, checked: boolean) => {
    onChange(checked ? [...value, key] : value.filter((k) => k !== key));
  };
  return (
    <div className="grid gap-2.5 max-h-64 overflow-y-auto pr-1">
      {SYSTEM_PERMISSIONS.map((p) => (
        <label key={p.key} className="flex items-start gap-2.5 rounded-md border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50">
          <Checkbox checked={value.includes(p.key)} onCheckedChange={(c) => toggle(p.key, c)} className="mt-0.5" />
          <span>
            <span className="block text-xs font-bold text-slate-700">{p.label}</span>
            <span className="block text-[10px] text-slate-400 leading-snug">{p.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default function SystemAdminsPage() {
  const confirm = useConfirm();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string>('');
  const [resetExpiryMins, setResetExpiryMins] = useState<number | null>(null);
  const [resetLoadingId, setResetLoadingId] = useState<string | null>(null);
  const [activeLoadingId, setActiveLoadingId] = useState<string | null>(null);

  const handleToggleActive = async (admin: any) => {
    const willDeactivate = admin.isActive !== false;
    if (willDeactivate) {
      const ok = await confirm({
        title: 'Deactivate this administrator?',
        description: 'They will be signed out immediately and unable to log in again until reactivated.',
        details: [{ label: 'Admin', value: admin.email }],
        confirmText: 'Deactivate',
        cancelText: 'Cancel',
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      setActiveLoadingId(admin.id);
      const res = await api.put(`/system/admins/${admin.id}/active`, { isActive: !willDeactivate });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? res.data.data : a)));
      toast.success(willDeactivate ? 'Administrator deactivated' : 'Administrator reactivated');
    } catch (err: any) {
      toast.error(err.response?.data?.details?.message || 'Failed to update administrator');
    } finally {
      setActiveLoadingId(null);
    }
  };

  // Add-administrator dialog state. Defaults to a restricted sub-admin with no
  // capabilities — root access is opt-in, never the default.
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', email: '', password: '', isRootAdmin: false });
  const [addPermissions, setAddPermissions] = useState<SystemPermissionKey[]>([]);

  const resetAddForm = () => {
    setAddForm({ firstName: '', lastName: '', email: '', password: '', isRootAdmin: false });
    setAddPermissions([]);
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addSaving) return;
    if (addForm.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    try {
      setAddSaving(true);
      const res = await api.post('/system/admins', { ...addForm, permissions: addPermissions });
      setAdmins((prev) => [...prev, res.data.data]);
      toast.success('Administrator added');
      setAddOpen(false);
      resetAddForm();
    } catch (err: any) {
      toast.error(err.response?.data?.details?.message || err.response?.data?.message || 'Failed to add administrator');
    } finally {
      setAddSaving(false);
    }
  };

  // Edit-permissions dialog state — changes an existing admin's root/restricted
  // status and, for a restricted one, which capabilities it holds.
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [editIsRoot, setEditIsRoot] = useState(false);
  const [editPermissions, setEditPermissions] = useState<SystemPermissionKey[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const openEditDialog = (admin: any) => {
    setEditTarget(admin);
    setEditIsRoot(admin.isRootAdmin !== false);
    setEditPermissions(splitPermissions(admin.permissions));
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || editSaving) return;
    try {
      setEditSaving(true);
      const res = await api.put(`/system/admins/${editTarget.id}/permissions`, {
        isRootAdmin: editIsRoot,
        permissions: editPermissions,
      });
      setAdmins((prev) => prev.map((a) => (a.id === editTarget.id ? res.data.data : a)));
      toast.success('Access level updated');
      setEditTarget(null);
    } catch (err: any) {
      toast.error(err.response?.data?.details?.message || 'Failed to update access level');
    } finally {
      setEditSaving(false);
    }
  };

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
    <>
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Super Admins</h1>
            <p className="text-xs text-slate-500 font-medium">Manage platform administrators and their access levels.</p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold shadow-sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Administrator
          </Button>
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
                  <TableHead className="text-xs font-bold text-slate-500">Access Level</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">Status</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">Created At</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-xs font-bold text-slate-400">Loading administrators...</TableCell>
                  </TableRow>
                ) : admins.map((admin) => {
                  const isSelf = admin.id === currentUserId;
                  const isActive = admin.isActive !== false;
                  const isRoot = admin.isRootAdmin !== false;
                  const grantedCount = splitPermissions(admin.permissions).length;
                  return (
                  <TableRow key={admin.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="font-semibold text-sm text-slate-800">{admin.firstName} {admin.lastName}</TableCell>
                    <TableCell className="text-xs text-slate-500">{admin.email}</TableCell>
                    <TableCell>
                      <Badge className={isRoot ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}>
                        {isRoot ? 'Root' : `Restricted · ${grantedCount} ${grantedCount === 1 ? 'permission' : 'permissions'}`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                        {isActive ? 'Active' : 'Deactivated'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(admin.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(admin)} className="h-7 text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-2">
                          <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Access
                        </Button>
                        <Button variant="ghost" size="sm" disabled={resetLoadingId === admin.id} onClick={() => handleGenerateReset(admin)} className="h-7 text-[10px] font-bold text-slate-500 hover:text-amber-600 hover:bg-amber-50 px-2">
                          <KeyRound className="w-3.5 h-3.5 mr-1.5" /> {resetLoadingId === admin.id ? 'Generating…' : 'Reset Link'}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          disabled={activeLoadingId === admin.id || isSelf}
                          title={isSelf ? "You can't deactivate your own account" : undefined}
                          onClick={() => handleToggleActive(admin)}
                          className={`h-7 text-[10px] font-bold px-2 ${isActive ? 'text-slate-500 hover:text-red-600 hover:bg-red-50' : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'}`}
                        >
                          {isActive ? <ShieldOff className="w-3.5 h-3.5 mr-1.5" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                          {activeLoadingId === admin.id ? 'Updating…' : isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={addOpen} onOpenChange={(o) => { if (!addSaving) { setAddOpen(o); if (!o) resetAddForm(); } }}>
        <DialogContent maxWidth="sm:max-w-lg" className="p-6">
          <form onSubmit={handleCreateAdmin}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Add Administrator
              </DialogTitle>
              <DialogDescription className="text-xs">
                Create a new platform-level administrator, with either full <span className="font-bold text-slate-700">root</span> access or a restricted set of capabilities.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400">First Name</Label>
                  <Input required value={addForm.firstName} onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Last Name</Label>
                  <Input required value={addForm.lastName} onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })} className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">Email</Label>
                <Input required type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400">Password</Label>
                <Input required type="password" minLength={8} value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} placeholder="At least 8 characters" className="h-9 text-sm" />
              </div>

              <div className="flex items-center justify-between rounded-md border border-slate-200 p-3 mt-1">
                <div>
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    {addForm.isRootAdmin ? <ShieldCheck className="w-3.5 h-3.5 text-red-600" /> : <Lock className="w-3.5 h-3.5 text-blue-600" />}
                    {addForm.isRootAdmin ? 'Root administrator' : 'Restricted administrator'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {addForm.isRootAdmin ? 'Unrestricted access to every platform action.' : 'Only the capabilities checked below.'}
                  </p>
                </div>
                <Switch checked={addForm.isRootAdmin} onCheckedChange={(c) => setAddForm({ ...addForm, isRootAdmin: c })} />
              </div>

              {!addForm.isRootAdmin && (
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Permissions</Label>
                  <PermissionPicker value={addPermissions} onChange={setAddPermissions} />
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={addSaving} onClick={() => setAddOpen(false)} className="h-9 text-xs font-bold text-slate-400">Cancel</Button>
              <Button type="submit" disabled={addSaving} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold px-6 disabled:opacity-60">
                {addSaving ? 'Adding…' : 'Add Administrator'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!editSaving && !o) setEditTarget(null); }}>
        <DialogContent maxWidth="sm:max-w-lg" className="p-6">
          {editTarget && (
            <form onSubmit={handleSavePermissions}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <Settings2 className="w-4 h-4 text-blue-600" /> Access Level
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Change what <span className="font-bold text-slate-700">{editTarget.email}</span> can do.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 mt-4">
                <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
                  <div>
                    <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      {editIsRoot ? <ShieldCheck className="w-3.5 h-3.5 text-red-600" /> : <Lock className="w-3.5 h-3.5 text-blue-600" />}
                      {editIsRoot ? 'Root administrator' : 'Restricted administrator'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {editIsRoot ? 'Unrestricted access to every platform action.' : 'Only the capabilities checked below.'}
                    </p>
                  </div>
                  <Switch
                    checked={editIsRoot}
                    disabled={editTarget.id === currentUserId && editIsRoot}
                    onCheckedChange={setEditIsRoot}
                  />
                </div>
                {editTarget.id === currentUserId && editIsRoot && (
                  <p className="text-[10px] text-amber-600 font-bold -mt-2">You can&apos;t remove root access from your own account.</p>
                )}

                {!editIsRoot && (
                  <div className="grid gap-1.5">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Permissions</Label>
                    <PermissionPicker value={editPermissions} onChange={setEditPermissions} />
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" disabled={editSaving} onClick={() => setEditTarget(null)} className="h-9 text-xs font-bold text-slate-400">Cancel</Button>
                <Button type="submit" disabled={editSaving} className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-bold px-6 disabled:opacity-60">
                  {editSaving ? 'Saving…' : 'Save Access Level'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

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
    </>
  );
}
