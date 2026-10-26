'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, PencilSimple, Trash, MagnifyingGlass, ShieldCheck, ShieldWarning, Users, GearSix, Shield, Copy, LinkSimple } from '@phosphor-icons/react';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhoneInput } from '@/components/ui/phone-input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from "@/i18n/provider";

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  permissions: string | null;
  phone: string | null;
  createdAt: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'manage_reservations', label: 'Manage Reservations', desc: 'Create, edit, cancel bookings' },
  { id: 'manage_tables', label: 'Manage Tables', desc: 'Manage tables capacity and properties' },
  { id: 'edit_floor_plan', label: 'Edit Floor Plan', desc: 'Allow drag/drop and visual floor plan editing' },
  { id: 'manage_menu', label: 'Manage Menu', desc: 'Create and update dishes/categories' },
  { id: 'manage_calendar', label: 'Manage Calendar', desc: 'Set blackout days and events' },
  { id: 'manage_staff', label: 'Manage Staff', desc: 'Add/remove users and set permissions' },
  { id: 'manage_settings', label: 'Manage Settings', desc: 'Change core restaurant config' },
  { id: 'view_analytics', label: 'View Dashboard & Analytics', desc: 'See the main dashboard and analytics reports' },
  { id: 'view_payments', label: 'View Payments', desc: 'See the payments dashboard' },
  { id: 'view_reviews', label: 'View Reviews', desc: 'See the reviews dashboard' },
  { id: 'manage_orders', label: 'Manage Orders', desc: 'Access the online order station' },
];

const PRESET_ROLES = {
  "MANAGER": ['manage_reservations', 'manage_tables', 'edit_floor_plan', 'manage_menu', 'manage_calendar', 'manage_staff', 'manage_settings'],
  "HOST": ['manage_reservations', 'manage_tables'],
  "KITCHEN": ['manage_orders'],
  "STAFF": []
};

export default function StaffManagementPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  // Holds a freshly-issued password-reset link to show/copy for the admin (#7.1).
  const [resetLinkInfo, setResetLinkInfo] = useState<{ name: string; link: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'STAFF',
    sendResetLink: false,
    permissions: new Set<string>()
  });

  const currentUser = useAuthStore(state => state.user);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/staff');
      setStaff(res.data.data);
    } catch (err) {
      toast.error(t("staff.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setIsEditMode(false);
    setSelectedId(null);
    setFormData({
      firstName: '', lastName: '', email: '', phone: '', role: 'STAFF',
      sendResetLink: false, permissions: new Set()
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (member: StaffMember) => {
    setIsEditMode(true);
    setSelectedId(member.id);
    setFormData({
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone || '',
      role: member.role,
      sendResetLink: false,
      permissions: new Set(member.permissions ? member.permissions.split(',') : [])
    });
    setIsDialogOpen(true);
  };

  const handleRoleChange = (role: string | null) => {
      if (!role) return;
      // Auto-assign permissions based on preset if applicable
      const defaultPerms = PRESET_ROLES[role as keyof typeof PRESET_ROLES] || [];
      setFormData(prev => ({
          ...prev, 
          role, 
          permissions: new Set(defaultPerms)
      }));
  };

  const togglePermission = (permId: string) => {
      const newPerms = new Set(formData.permissions);
      if (newPerms.has(permId)) newPerms.delete(permId);
      else newPerms.add(permId);
      setFormData(prev => ({ ...prev, permissions: newPerms }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        permissions: Array.from(formData.permissions)
      };

      let resetLink: string | undefined;
      if (isEditMode && selectedId) {
        const res = await api.put(`/staff/${selectedId}`, payload);
        resetLink = res.data?.data?.resetLink;
        toast.success(t("staff.success.updated"));
      } else {
        const res = await api.post('/staff', payload);
        resetLink = res.data?.data?.resetLink;
        toast.success(t("staff.success.created"));
      }
      setIsDialogOpen(false);
      // Surface the reset link so the admin can hand it to the staff member (#7.1).
      if (resetLink) setResetLinkInfo({ name: `${formData.firstName} ${formData.lastName}`, link: resetLink });
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("staff.errors.saveFailed"));
    }
  };

  const handleDelete = async (member: StaffMember) => {
    const ok = await confirm({
      title: t("staff.confirm.remove"),
      details: [{ label: t("staff.table.identity"), value: `${member.firstName} ${member.lastName}` }],
      tone: 'danger',
      confirmText: t("tables.deleteBtn"),
    });
    if (!ok) return;
    try {
      await api.delete(`/staff/${member.id}`);
      toast.success(t("staff.success.removed"));
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || t("staff.errors.deleteFailed"));
    }
  };

  const filteredStaff = staff.filter(s => 
    s.firstName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground font-heading">{t("staff.title")}</h1>
            <p className="text-[10px] text-muted-foreground font-semibold tracking-[0.2em] mt-1 italic">{t("staff.subtitle")}</p>
          </div>
          <Button size="sm" onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white rounded-sm h-9 px-6 font-semibold text-[10px] shadow-md shadow-blue-600/20">
            <Plus className="w-3.5 h-3.5 mr-1.5 stroke-[3]" /> {t("staff.addBtn")}
          </Button>
        </div>

        {/* Command Center */}
        <Card className="rounded-md border-border shadow-sm overflow-hidden bg-card">
          <CardHeader className="p-3 bg-muted/50 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-foreground">{t("staff.activePersonnel")}</span>
            </div>
            <div className="relative w-64">
                <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder={t("staff.searchPlaceholder")} className="pl-8 h-8 text-xs bg-card border-border rounded-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/80">
                <TableRow className="h-9 border-b border-border">
                  <TableHead className="text-[9px] font-semibold text-muted-foreground px-6">{t("staff.table.identity")}</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground">{t("staff.table.baseRole")}</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground">{t("staff.table.customEntitlements")}</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground">{t("staff.table.status")}</TableHead>
                  <TableHead className="text-[9px] font-semibold text-muted-foreground text-right px-6">{t("staff.table.command")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-48 text-center text-[10px] font-semibold text-muted-foreground">{t("staff.table.loading")}</TableCell></TableRow>
                ) : filteredStaff.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-48 text-center text-[10px] font-semibold text-muted-foreground">{t("staff.table.noResults")}</TableCell></TableRow>
                ) : filteredStaff.map((member) => (
                  <TableRow key={member.id} className="h-14 hover:bg-muted/50 border-b border-border transition-colors">
                    <TableCell className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-black text-foreground text-sm tracking-tight">{member.firstName} {member.lastName}</span>
                        <span className="text-[10px] font-mono text-muted-foreground mt-0.5">{member.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
 <Badge className={cn("text-[9px] font-semibold px-2 shadow-none rounded-sm", member.role ==='ADMIN'|| member.role ==='MANAGER'?"bg-blue-100 text-blue-700":"bg-muted text-foreground")}>
                          {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[250px]">
                        {member.role === 'ADMIN' ? (
                            <Badge variant="outline" className="text-[8px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 px-1 py-0 shadow-none"><ShieldCheck className="w-2.5 h-2.5 mr-1" /> {t("staff.table.fullAccess")}</Badge>
                        ) : member.permissions ? (
                            member.permissions.split(',').map(p => (
                                <Badge key={p} variant="outline" className="text-[8px] font-semibold bg-card text-muted-foreground border-border px-1 py-0 shadow-none">
                                    {t(`staff.permissions.${p}.label`)}
                                </Badge>
                            ))
                        ) : (
                            <span className="text-[9px] font-bold text-muted-foreground italic">{t("staff.table.noCustomRules")}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold tracking-tighter">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" /> {t("staff.table.active")}
                        </div>
                    </TableCell>
                    <TableCell className="px-6 text-right">
                        {member.id !== currentUser?.id && member.role !== 'SUPER_ADMIN' && member.role !== 'ADMIN' ? (
                            <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(member)} className="h-7 w-7 text-slate-300 hover:text-blue-600 transition-colors"><PencilSimple className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(member)} className="h-7 w-7 text-slate-300 hover:text-red-600 dark:text-red-400 transition-colors"><Trash className="w-3.5 h-3.5" /></Button>
                            </div>
                        ) : (
                            <span className="text-[9px] font-semibold text-slate-300 mr-2">{t("staff.table.protected")}</span>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dialogs */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent maxWidth="sm:max-w-2xl" className="p-0 rounded-md border-0 shadow-2xl">
                <form onSubmit={handleSubmit}>
                    <div className="bg-slate-900 p-4 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-sm font-bold">{isEditMode ? t("staff.dialog.editTitle") : t("staff.dialog.createTitle")}</DialogTitle>
                        </DialogHeader>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 bg-card">
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label className="text-[10px] font-semibold text-muted-foreground ml-1">{t("staff.dialog.firstName")}</Label>
                                    <Input required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="h-10 text-sm font-bold border-border rounded-sm" />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label className="text-[10px] font-semibold text-muted-foreground ml-1">{t("staff.dialog.lastName")}</Label>
                                    <Input required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="h-10 text-sm font-bold border-border rounded-sm" />
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-semibold text-muted-foreground ml-1">{t("staff.dialog.email")}</Label>
                                <Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-10 text-sm font-bold border-border rounded-sm font-mono" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-semibold text-muted-foreground ml-1">{t("staff.dialog.phone")}</Label>
                                <PhoneInput value={formData.phone} onChange={(p) => setFormData({...formData, phone: p})} countryHint={t("staff.dialog.phoneHint")} />
                            </div>
                            {/* Passwords are set by the staff member via a reset link, never by the admin (#7.1) */}
                            {!isEditMode ? (
                                <p className="text-[10px] font-bold text-muted-foreground leading-relaxed bg-muted border border-border rounded-sm p-2 flex items-start gap-1.5">
                                    <LinkSimple className="w-3 h-3 mt-0.5 text-blue-500 shrink-0" /> {t("staff.dialog.resetLinkOnCreate")}
                                </p>
                            ) : (
                                <div className={cn("flex items-center justify-between p-3 border rounded-sm transition-all", formData.sendResetLink ? "border-blue-200 bg-blue-50/30" : "border-border bg-muted/50")}>
                                    <div className="space-y-0.5">
                                        <div className="text-xs font-semibold tracking-tight text-muted-foreground">{t("staff.dialog.sendResetLink")}</div>
                                        <div className="text-[9px] font-bold text-muted-foreground">{t("staff.dialog.sendResetLinkDesc")}</div>
                                    </div>
                                    <Checkbox checked={formData.sendResetLink} onCheckedChange={() => setFormData(prev => ({...prev, sendResetLink: !prev.sendResetLink}))} />
                                </div>
                            )}
                            <div className="grid gap-1.5 pt-4 border-t border-border">
                                <Label className="text-[10px] font-semibold text-muted-foreground ml-1">{t("staff.dialog.baseRoleTemplate")}</Label>
                                <Select value={formData.role} onValueChange={handleRoleChange}>
                                    <SelectTrigger className="h-10 text-sm font-bold border-border rounded-sm bg-muted"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MANAGER" className="text-xs font-bold text-blue-700">{t("staff.dialog.roleManager")}</SelectItem>
                                        <SelectItem value="HOST" className="text-xs font-bold text-foreground">{t("staff.dialog.roleHost")}</SelectItem>
                                        <SelectItem value="KITCHEN" className="text-xs font-bold text-foreground">{t("staff.dialog.roleKitchen")}</SelectItem>
                                        <SelectItem value="STAFF" className="text-xs font-bold text-foreground">{t("staff.dialog.roleStaff")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-4 border-l border-border pl-6">
                            <div className="flex items-center gap-2 mb-2">
                                <Shield className="w-4 h-4 text-blue-500" />
                                <Label className="text-xs font-semibold text-foreground tracking-tight">{t("staff.dialog.granularEntitlements")}</Label>
                            </div>
                            <p className="text-[10px] font-bold text-muted-foreground leading-relaxed mb-4">{t("staff.dialog.entitlementsDesc")}</p>
                            
                            <div className="grid gap-3">
                                {AVAILABLE_PERMISSIONS.map(perm => (
                                    <div key={perm.id} className={cn("flex items-center justify-between p-3 border rounded-sm transition-all", formData.permissions.has(perm.id) ? "border-blue-200 bg-blue-50/30" : "border-border bg-muted/50")}>
                                        <div className="space-y-0.5">
 <div className={cn("text-xs font-semibold tracking-tight", formData.permissions.has(perm.id) ?"text-blue-700":"text-muted-foreground")}>{t(`staff.permissions.${perm.id}.label`)}</div>
                                            <div className="text-[9px] font-bold text-muted-foreground">{t(`staff.permissions.${perm.id}.desc`)}</div>
                                        </div>
                                        <Checkbox checked={formData.permissions.has(perm.id)} onCheckedChange={() => togglePermission(perm.id)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-muted border-t border-border flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-9 text-xs font-bold text-muted-foreground px-6">{t("staff.dialog.cancel")}</Button>
                        <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-semibold px-8 rounded-sm shadow-lg shadow-blue-600/20">{t("staff.dialog.commit")}</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>

        {/* One-time reset link to hand to the staff member (#7.1) */}
        <Dialog open={!!resetLinkInfo} onOpenChange={(o) => { if (!o) setResetLinkInfo(null); }}>
            <DialogContent maxWidth="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-lg">{t("staff.resetLink.title")}</DialogTitle>
                    <DialogDescription>{t("staff.resetLink.desc", )}</DialogDescription>
                </DialogHeader>
                <div className="rounded-lg border bg-muted/40 p-3 flex items-center gap-2">
                    <LinkSimple className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-xs font-mono break-all flex-1">{resetLinkInfo?.link}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => { if (resetLinkInfo) { navigator.clipboard?.writeText(resetLinkInfo.link); toast.success(t("staff.resetLink.copied")); } }}>
                        <Copy className="w-3.5 h-3.5 mr-1" /> {t("staff.resetLink.copy")}
                    </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("staff.resetLink.expiryHint")}</p>
            </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
