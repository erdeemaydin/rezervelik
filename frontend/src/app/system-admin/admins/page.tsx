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
import { ShieldCheck, ShieldSlash, Key, Copy, Plus, GearSix, Lock } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from '@/i18n/provider';
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

// Shared by the Add and Edit-permissions dialogs — the root/restricted switch
// plus (when restricted) the permission picker.
function RootAccessSection({
  isRoot,
  onToggleRoot,
  toggleDisabled,
  permissions,
  onPermissionsChange,
  warning,
}: {
  isRoot: boolean;
  onToggleRoot: (checked: boolean) => void;
  toggleDisabled?: boolean;
  permissions: SystemPermissionKey[];
  onPermissionsChange: (next: SystemPermissionKey[]) => void;
  warning?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-slate-200 p-3">
        <div>
          <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            {isRoot ? <ShieldCheck className="w-3.5 h-3.5 text-red-600" /> : <Lock className="w-3.5 h-3.5 text-blue-600" />}
            {isRoot ? t('systemAdmin.admins.rootAdministrator') : t('systemAdmin.admins.restrictedAdministratorLabel')}
          </p>
          <p className="text-[10px] text-slate-400">
            {isRoot ? t('systemAdmin.admins.rootAdminDescription') : t('systemAdmin.admins.restrictedAdminDescription')}
          </p>
        </div>
        <Switch checked={isRoot} disabled={toggleDisabled} onCheckedChange={onToggleRoot} />
      </div>
      {warning}
      {!isRoot && (
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-semibold text-slate-400">{t('systemAdmin.admins.permissionsLabel')}</Label>
          <PermissionPicker value={permissions} onChange={onPermissionsChange} />
        </div>
      )}
    </>
  );
}

export default function SystemAdminsPage() {
  const { t } = useTranslation();
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
        title: t('systemAdmin.admins.deactivateConfirmTitle'),
        description: t('systemAdmin.admins.deactivateConfirmDescription'),
        details: [{ label: t('systemAdmin.admins.adminLabel'), value: admin.email }],
        confirmText: t('systemAdmin.admins.deactivateButton'),
        cancelText: t('systemAdmin.admins.cancel'),
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      setActiveLoadingId(admin.id);
      const res = await api.put(`/system/admins/${admin.id}/active`, { isActive: !willDeactivate });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? res.data.data : a)));
      toast.success(willDeactivate ? t('systemAdmin.admins.toastAdminDeactivated') : t('systemAdmin.admins.toastAdminReactivated'));
    } catch (err: any) {
      toast.error(err.response?.data?.details?.message || t('systemAdmin.admins.toastUpdateFailed'));
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
      toast.error(t('systemAdmin.admins.toastPasswordTooShort'));
      return;
    }
    try {
      setAddSaving(true);
      const res = await api.post('/system/admins', { ...addForm, permissions: addPermissions });
      setAdmins((prev) => [...prev, res.data.data]);
      toast.success(t('systemAdmin.admins.toastAdminAdded'));
      setAddOpen(false);
      resetAddForm();
    } catch (err: any) {
      toast.error(err.response?.data?.details?.message || err.response?.data?.message || t('systemAdmin.admins.toastAddFailed'));
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
      toast.success(t('systemAdmin.admins.toastAccessUpdated'));
      setEditTarget(null);
    } catch (err: any) {
      toast.error(err.response?.data?.details?.message || t('systemAdmin.admins.toastAccessUpdateFailed'));
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
      toast.error(t('systemAdmin.admins.toastResetLinkFailed'));
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
        toast.error(t('systemAdmin.admins.toastLoadFailed'));
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
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 font-heading">{t('systemAdmin.superAdmins')}</h1>
            <p className="text-xs text-slate-500 font-medium">{t('systemAdmin.admins.pageSubtitle')}</p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-xs font-bold shadow-sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> {t('systemAdmin.admins.addAdministrator')}
          </Button>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <CardTitle className="text-sm font-bold text-slate-700">{t('systemAdmin.admins.accessRoster')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="text-xs font-bold text-slate-500">{t('systemAdmin.admins.colName')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t('systemAdmin.admins.colEmail')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t('systemAdmin.admins.colAccessLevel')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t('systemAdmin.admins.colStatus')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500">{t('systemAdmin.admins.colCreatedAt')}</TableHead>
                  <TableHead className="text-xs font-bold text-slate-500 text-right">{t('systemAdmin.admins.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-xs font-bold text-slate-400">{t('systemAdmin.admins.loadingAdmins')}</TableCell>
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
                        {isRoot ? t('systemAdmin.admins.root') : `${t('systemAdmin.admins.restricted')} · ${grantedCount} ${grantedCount === 1 ? t('systemAdmin.admins.permission') : t('systemAdmin.admins.permissions')}`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                        {isActive ? t('systemAdmin.active') : t('systemAdmin.admins.deactivated')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{new Date(admin.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(admin)} className="h-7 text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-2">
                          <GearSix className="w-3.5 h-3.5 mr-1.5" /> {t('systemAdmin.admins.accessButton')}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={resetLoadingId === admin.id} onClick={() => handleGenerateReset(admin)} className="h-7 text-[10px] font-bold text-slate-500 hover:text-amber-600 hover:bg-amber-50 px-2">
                          <Key className="w-3.5 h-3.5 mr-1.5" /> {resetLoadingId === admin.id ? t('systemAdmin.admins.generatingEllipsis') : t('systemAdmin.admins.resetLinkButton')}
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          disabled={activeLoadingId === admin.id || isSelf}
                          title={isSelf ? t('systemAdmin.admins.cannotDeactivateSelf') : undefined}
                          onClick={() => handleToggleActive(admin)}
                          className={`h-7 text-[10px] font-bold px-2 ${isActive ? 'text-slate-500 hover:text-red-600 hover:bg-red-50' : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'}`}
                        >
                          {isActive ? <ShieldSlash className="w-3.5 h-3.5 mr-1.5" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                          {activeLoadingId === admin.id ? t('systemAdmin.admins.updatingEllipsis') : isActive ? t('systemAdmin.admins.deactivateButton') : t('systemAdmin.admins.reactivateButton')}
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
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> {t('systemAdmin.admins.addAdministrator')}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t('systemAdmin.admins.addDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-semibold text-slate-400">{t('systemAdmin.admins.firstName')}</Label>
                  <Input required value={addForm.firstName} onChange={(e) => setAddForm({ ...addForm, firstName: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[10px] font-semibold text-slate-400">{t('systemAdmin.admins.lastName')}</Label>
                  <Input required value={addForm.lastName} onChange={(e) => setAddForm({ ...addForm, lastName: e.target.value })} className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold text-slate-400">{t('systemAdmin.admins.colEmail')}</Label>
                <Input required type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-[10px] font-semibold text-slate-400">{t('systemAdmin.admins.password')}</Label>
                <Input required type="password" minLength={8} value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} placeholder={t('systemAdmin.admins.passwordPlaceholder')} className="h-9 text-sm" />
              </div>

              <RootAccessSection
                isRoot={addForm.isRootAdmin}
                onToggleRoot={(c) => setAddForm({ ...addForm, isRootAdmin: c })}
                permissions={addPermissions}
                onPermissionsChange={setAddPermissions}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={addSaving} onClick={() => setAddOpen(false)} className="h-9 text-xs font-bold text-slate-400">{t('systemAdmin.admins.cancel')}</Button>
              <Button type="submit" disabled={addSaving} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold px-6 disabled:opacity-60">
                {addSaving ? t('systemAdmin.admins.addingEllipsis') : t('systemAdmin.admins.addAdministrator')}
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
                  <GearSix className="w-4 h-4 text-blue-600" /> {t('systemAdmin.admins.colAccessLevel')}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t('systemAdmin.admins.editDescriptionPrefix')} <span className="font-bold text-slate-700">{editTarget.email}</span> {t('systemAdmin.admins.editDescriptionSuffix')}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 mt-4">
                <RootAccessSection
                  isRoot={editIsRoot}
                  onToggleRoot={setEditIsRoot}
                  toggleDisabled={editTarget.id === currentUserId && editIsRoot}
                  permissions={editPermissions}
                  onPermissionsChange={setEditPermissions}
                  warning={editTarget.id === currentUserId && editIsRoot ? (
                    <p className="text-[10px] text-amber-600 font-bold -mt-2">{t('systemAdmin.admins.cannotRemoveOwnRoot')}</p>
                  ) : undefined}
                />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" disabled={editSaving} onClick={() => setEditTarget(null)} className="h-9 text-xs font-bold text-slate-400">{t('systemAdmin.admins.cancel')}</Button>
                <Button type="submit" disabled={editSaving} className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-bold px-6 disabled:opacity-60">
                  {editSaving ? t('systemAdmin.admins.savingEllipsis') : t('systemAdmin.admins.saveAccessLevel')}
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
              <Key className="w-4 h-4 text-amber-500" /> {t('systemAdmin.admins.resetDialogTitle')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t('systemAdmin.admins.resetDialogDescriptionPrefix')} <span className="font-bold text-slate-700">{resetTarget}</span>{t('systemAdmin.admins.resetDialogDescriptionSuffix')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 mt-2">
            <Input readOnly value={resetLink || ''} className="h-9 text-[10px] font-mono border-slate-200 bg-slate-50" onFocus={(e) => e.target.select()} />
            <Button type="button" size="sm" onClick={() => { if (resetLink) { navigator.clipboard.writeText(resetLink); toast.success(t('systemAdmin.admins.copiedToClipboard')); } }} className="h-9 shrink-0 bg-slate-900 hover:bg-slate-800 text-white">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-[9px] text-amber-600 font-bold">
            {resetExpiryMins ? `${t('systemAdmin.admins.expiresInPrefix')} ${resetExpiryMins} ${t('systemAdmin.admins.expiresInSuffix')} · ` : ''}{t('systemAdmin.admins.singleUse')}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
