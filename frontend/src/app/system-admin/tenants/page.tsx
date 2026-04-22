'use client';

import { useState, useEffect } from 'react';
import SystemAdminLayout from '@/components/layout/SystemAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Plus, Settings2, ShieldCheck, ShieldAlert, Globe, Mail, Search } from 'lucide-react';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function TenantManagementPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '', contactEmail: '', adminFirstName: '', adminLastName: '', adminPassword: ''
  });

  const [settingsForm, setSettingsForm] = useState({
    isVipEnabled: true, isInternalNotesEnabled: true, isCategoriesEnabled: true
  });
  
  const [adminPermissions, setAdminPermissions] = useState<Set<string>>(new Set());

  const AVAILABLE_PERMISSIONS = [
    { id: 'manage_reservations', label: 'Reservations' },
    { id: 'manage_tables', label: 'Tables & Floor' },
    { id: 'manage_menu', label: 'Menus' },
    { id: 'manage_calendar', label: 'Calendar' },
    { id: 'manage_staff', label: 'Staff' },
    { id: 'manage_settings', label: 'Settings' },
  ];

  useEffect(() => { fetchTenants(); }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await api.get('/system/tenants');
      setTenants(res.data.data);
    } finally { setLoading(false); }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/system/tenants', formData);
      toast.success('Tenant provisioned');
      setIsDialogOpen(false);
      fetchTenants();
    } catch (err: any) { toast.error('Provisioning failed'); }
  };

  const openSettings = (tenant: any) => {
    setSelectedTenant(tenant);
    setSettingsForm(tenant.settings || { isVipEnabled: true, isInternalNotesEnabled: true, isCategoriesEnabled: true });
    
    const adminUser = tenant.users?.find((u: any) => u.role === 'ADMIN');
    setAdminPermissions(new Set(adminUser?.permissions ? adminUser.permissions.split(',') : []));
    setIsSettingsOpen(true);
  };

  const togglePermission = (permId: string) => {
      const newPerms = new Set(adminPermissions);
      if (newPerms.has(permId)) newPerms.delete(permId);
      else newPerms.add(permId);
      setAdminPermissions(newPerms);
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/system/tenants/${selectedTenant.id}/settings`, settingsForm);
      
      const adminUser = selectedTenant.users?.find((u: any) => u.role === 'ADMIN');
      if (adminUser) {
          await api.put(`/system/users/${adminUser.id}/permissions`, {
              permissions: Array.from(adminPermissions)
          });
      }
      
      toast.success('Entitlements updated');
      setIsSettingsOpen(false);
      fetchTenants();
    } catch (err) { toast.error('Update failed'); }
  };

  const filteredTenants = tenants.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.slug.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <SystemAdminLayout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Tenant Ecosystem</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black">Global Infrastructure</p>
          </div>
          <Button size="sm" onClick={() => setIsDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 h-8 text-[10px] font-black uppercase">Provision New Restaurant</Button>
        </div>

        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-700">Active Instances</span>
                </div>
                <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input placeholder="Search name or slug..." className="pl-8 h-8 text-xs bg-white border-slate-200 rounded-md" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
             </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="h-9">
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">Restaurant / Domain</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Feature Flags</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Provisioned</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-4">Command</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={4} className="h-32 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Querying Tenants...</TableCell></TableRow>
                ) : filteredTenants.map(tenant => (
                  <TableRow key={tenant.id} className="h-12 hover:bg-slate-50/50 border-b border-slate-100">
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100">
                            <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="font-bold text-slate-900 text-xs uppercase tracking-tight">{tenant.name}</div>
                            <div className="text-[9px] text-slate-400 font-mono">{tenant.slug}.reservue.com</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex gap-1">
                            {tenant.settings?.isVipEnabled && <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-[8px] font-black px-1 rounded-sm shadow-none">VIP</Badge>}
                            {tenant.settings?.isInternalNotesEnabled && <Badge className="bg-blue-50 text-blue-700 border-blue-100 text-[8px] font-black px-1 rounded-sm shadow-none">NOTE</Badge>}
                            {tenant.settings?.isCategoriesEnabled && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[8px] font-black px-1 rounded-sm shadow-none">CAT</Badge>}
                        </div>
                    </TableCell>
                    <TableCell>
                        <div className="text-[10px] font-bold text-slate-500">{new Date(tenant.createdAt).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell className="px-4 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-emerald-600" onClick={() => openSettings(tenant)}>
                            <Settings2 className="w-3.5 h-3.5" />
                        </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Provisioning Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent maxWidth="sm:max-w-md" className="p-0 rounded-md border-0 shadow-2xl">
            <form onSubmit={handleCreateTenant}>
                <div className="bg-emerald-900 p-4 text-white">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold uppercase tracking-tight">Provision New Tenant</DialogTitle>
                    </DialogHeader>
                </div>
                <div className="p-6 space-y-4 bg-white">
                    <div className="grid gap-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Restaurant Name</Label>
                        <Input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Admin Email</Label>
                        <Input required type="email" value={formData.contactEmail} onChange={e => setFormData({...formData, contactEmail: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">First Name</Label>
                            <Input required value={formData.adminFirstName} onChange={e => setFormData({...formData, adminFirstName: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Last Name</Label>
                            <Input required value={formData.adminLastName} onChange={e => setFormData({...formData, adminLastName: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Initial Password</Label>
                        <Input required type="password" value={formData.adminPassword} onChange={e => setFormData({...formData, adminPassword: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                    </div>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400">CANCEL</Button>
                    <Button type="submit" className="h-9 bg-emerald-600 hover:bg-emerald-700 text-xs font-black uppercase px-6 rounded-sm">INITIALIZE PROVISIONING</Button>
                </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Entitlements Dialog */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogContent maxWidth="sm:max-w-2xl" className="p-0 rounded-md border-0 shadow-2xl">
                <form onSubmit={handleUpdateSettings}>
                    <div className="bg-slate-900 p-4 text-white">
                        <DialogHeader>
                            <DialogTitle className="text-sm font-bold uppercase tracking-widest">Entitlements: {selectedTenant?.name}</DialogTitle>
                        </DialogHeader>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-8 bg-white">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Feature Flags</Label>
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase">VIP Status</Label>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Staff VIP Marking</p>
                                </div>
                                <Checkbox checked={settingsForm.isVipEnabled} onCheckedChange={(c) => setSettingsForm({...settingsForm, isVipEnabled: !!c})} />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase">Internal Notes</Label>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Staff Instructions</p>
                                </div>
                                <Checkbox checked={settingsForm.isInternalNotesEnabled} onCheckedChange={(c) => setSettingsForm({...settingsForm, isInternalNotesEnabled: !!c})} />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase">Categories</Label>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Source Tracking</p>
                                </div>
                                <Checkbox checked={settingsForm.isCategoriesEnabled} onCheckedChange={(c) => setSettingsForm({...settingsForm, isCategoriesEnabled: !!c})} />
                            </div>
                        </div>

                        <div className="space-y-4 border-l border-slate-100 pl-6">
                            <div className="flex items-center gap-2 mb-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Tenant Admin Permissions</Label>
                            </div>
                            <div className="grid gap-2">
                                {AVAILABLE_PERMISSIONS.map(perm => (
                                    <div key={perm.id} className={cn("flex items-center justify-between p-2.5 border rounded-sm transition-all", adminPermissions.has(perm.id) ? "border-emerald-200 bg-emerald-50/30" : "border-slate-100 bg-slate-50/50")}>
                                        <div className={cn("text-[10px] font-black uppercase tracking-tight", adminPermissions.has(perm.id) ? "text-emerald-700" : "text-slate-600")}>{perm.label}</div>
                                        <Checkbox checked={adminPermissions.has(perm.id)} onCheckedChange={() => togglePermission(perm.id)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsSettingsOpen(false)} className="h-9 text-xs font-bold text-slate-400">CANCEL</Button>
                        <Button type="submit" className="h-9 bg-slate-900 text-white text-xs font-black uppercase px-6 rounded-sm">COMMIT ENTITLEMENTS</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
      </div>
    </SystemAdminLayout>
  );
}
