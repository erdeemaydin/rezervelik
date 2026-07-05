'use client';

import { useState, useEffect } from 'react';
import SystemAdminLayout from '@/components/layout/SystemAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Plus, Settings2, ShieldCheck, ShieldAlert, Globe, Mail, Search, KeyRound, Copy } from 'lucide-react';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useTranslation } from '@/i18n/provider';

export default function TenantManagementPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    name: '', contactEmail: '', adminFirstName: '', adminLastName: '', adminPassword: '',
    businessType: 'RESTAURANT'
  });
  
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const [settingsForm, setSettingsForm] = useState({
    isVipEnabled: true, isInternalNotesEnabled: true, isCategoriesEnabled: true,
    hasWaitTimeFeature: true, hasShiftFeature: true, hasMenuFeature: true, hasPaymentFeature: true,
    // Organizer / wedding modules (default off; the WEDDING profile turns them on).
    hasEventPipeline: false, hasInstallmentPlans: false, hasGuestList: false, hasVendors: false,
    businessType: 'RESTAURANT',
    layoutStyle: 'CLASSIC_LIST',
    // Root-admin-only controls: platform currency + 2FA capability + default language.
    currency: 'TRY', twoFactorEnabled: false, defaultLanguage: 'tr'
  });
  
  const [subscriptionForm, setSubscriptionForm] = useState({
    subscriptionPlan: 'TRIAL', subscriptionStatus: 'ACTIVE', subscriptionEndsAt: '', sysAdminNotes: ''
  });
  
  const [adminPermissions, setAdminPermissions] = useState<Set<string>>(new Set());

  // Password reset link generated for the selected tenant's admin (shown once).
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetExpiryMins, setResetExpiryMins] = useState<number | null>(null);

  const handleGenerateReset = async (userId: string) => {
    try {
      setResetLoading(true);
      const res = await api.post(`/system/users/${userId}/reset-link`);
      setResetLink(`${window.location.origin}${res.data.data.resetLink}`);
      setResetExpiryMins(res.data.data.expiresInMinutes ?? null);
      toast.success('Password reset link generated');
    } catch (err) {
      toast.error('Failed to generate reset link');
    } finally {
      setResetLoading(false);
    }
  };

  // Two-factor (OTP) enforcement for the tenant admin — root-controlled only.
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpEnrolled, setOtpEnrolled] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);

  const handleToggleOtp = async (userId: string, required: boolean) => {
    try {
      setOtpBusy(true);
      const res = await api.put(`/system/users/${userId}/otp`, { required });
      setOtpRequired(res.data.data.otpRequired);
      setOtpEnrolled(res.data.data.otpEnrolled);
      toast.success(required ? 'Two-factor enabled for this admin' : 'Two-factor disabled');
      fetchTenants();
    } catch (err) {
      toast.error('Failed to update two-factor setting');
    } finally {
      setOtpBusy(false);
    }
  };

  const AVAILABLE_PERMISSIONS = [
    { id: 'manage_reservations', label: 'Reservations' },
    { id: 'manage_tables', label: 'Tables & Floor' },
    { id: 'edit_floor_plan', label: 'Edit Floor Plan' },
    { id: 'manage_menu', label: 'Digital Menu' },
    { id: 'manage_calendar', label: 'Calendar Settings' },
    { id: 'manage_staff', label: 'Staff Roster' },
    { id: 'manage_settings', label: 'Global Settings' },
  ];

  useEffect(() => { fetchTenants(); }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await api.get('/system/tenants');
      setTenants(res.data.data);
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    } finally { setLoading(false); }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = { ...formData };
      if (!payload.adminPassword) delete payload.adminPassword;
      
      const res = await api.post('/system/tenants', payload);
      toast.success('Tenant provisioned');
      
      if (res.data.data.setupLink) {
        setInviteLink(`${window.location.origin}${res.data.data.setupLink}`);
      } else {
        setIsDialogOpen(false);
      }
      
      fetchTenants();
      setFormData({ name: '', contactEmail: '', adminFirstName: '', adminLastName: '', adminPassword: '', businessType: 'RESTAURANT' });
    } catch (err: any) { toast.error('Provisioning failed'); }
  };

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await api.post(`/system/tenants/${tenantId}/impersonate`);
      const { user, token } = res.data.data;
      login(token, user);
      toast.success('Impersonation successful');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Impersonation failed');
    }
  };

  const openSettings = (tenant: any) => {
    setSelectedTenant(tenant);
    setSettingsForm({
      isVipEnabled: tenant.settings?.isVipEnabled ?? true,
      isInternalNotesEnabled: tenant.settings?.isInternalNotesEnabled ?? true,
      isCategoriesEnabled: tenant.settings?.isCategoriesEnabled ?? true,
      hasWaitTimeFeature: tenant.settings?.hasWaitTimeFeature ?? true,
      hasShiftFeature: tenant.settings?.hasShiftFeature ?? true,
      hasMenuFeature: tenant.settings?.hasMenuFeature ?? true,
      hasPaymentFeature: tenant.settings?.hasPaymentFeature ?? true,
      hasEventPipeline: tenant.settings?.hasEventPipeline ?? false,
      hasInstallmentPlans: tenant.settings?.hasInstallmentPlans ?? false,
      hasGuestList: tenant.settings?.hasGuestList ?? false,
      hasVendors: tenant.settings?.hasVendors ?? false,
      currency: tenant.settings?.currency ?? 'TRY',
      twoFactorEnabled: tenant.settings?.twoFactorEnabled ?? false,
      defaultLanguage: tenant.settings?.defaultLanguage ?? 'tr',
      businessType: tenant.businessType || 'RESTAURANT',
      layoutStyle: tenant.customization?.layoutStyle || 'CLASSIC_LIST',
    });
    
    setSubscriptionForm({
      subscriptionPlan: tenant.subscriptionPlan || 'TRIAL',
      subscriptionStatus: tenant.subscriptionStatus || 'ACTIVE',
      subscriptionEndsAt: tenant.subscriptionEndsAt ? new Date(tenant.subscriptionEndsAt).toISOString().split('T')[0] : '',
      sysAdminNotes: tenant.sysAdminNotes || ''
    });
    
    const adminUser = tenant.users?.find((u: any) => u.role === 'ADMIN');
    setAdminPermissions(new Set(adminUser?.permissions ? adminUser.permissions.split(',') : []));
    setResetLink(null);
    setResetExpiryMins(null);
    setOtpRequired(!!adminUser?.otpRequired);
    setOtpEnrolled(!!adminUser?.otpConfirmedAt);
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
      await api.put(`/system/tenants/${selectedTenant.id}/subscription`, subscriptionForm);
      
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
            <h1 className="text-xl font-bold text-slate-800">{t('systemAdmin.tenantEcosystem')}</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-black">{t('systemAdmin.globalInfrastructure')}</p>
          </div>
          <Button size="sm" onClick={() => setIsDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 h-8 text-[10px] font-black uppercase">{t('systemAdmin.provisionNewRestaurant')}</Button>
        </div>

        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-700">{t('systemAdmin.activeInstances')}</span>
                </div>
                <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input placeholder={t('systemAdmin.searchPlaceholder')} className="pl-8 h-8 text-xs bg-white border-slate-200 rounded-md" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
             </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="h-9">
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4">{t('systemAdmin.restaurantDomain')}</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('systemAdmin.subscription')}</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('systemAdmin.featureFlags')}</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('systemAdmin.provisioned')}</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-4">{t('systemAdmin.command')}</TableHead>
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
                      <div className="flex flex-col items-start justify-center gap-1">
                        <Badge variant="outline" className={cn(
                          "text-[9px] font-black uppercase px-1.5 py-0 border",
                          tenant.subscriptionPlan === 'PREMIUM' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                          tenant.subscriptionPlan === 'PRO' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          tenant.subscriptionPlan === 'BASIC' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        )}>{tenant.subscriptionPlan || 'TRIAL'}</Badge>
                        {tenant.subscriptionPlan === 'TRIAL' && tenant.subscriptionEndsAt ? (
                          <span className="text-[8px] font-bold text-slate-400">
                            {Math.max(0, Math.ceil((new Date(tenant.subscriptionEndsAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)))} days left
                          </span>
                        ) : tenant.subscriptionStatus !== 'ACTIVE' ? (
                           <span className="text-[8px] font-bold text-red-500 uppercase">{tenant.subscriptionStatus}</span>
                        ) : null}
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
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-2" onClick={() => handleImpersonate(tenant.id)}>
                              {t('systemAdmin.loginAs')}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-emerald-600" onClick={() => openSettings(tenant)}>
                              <Settings2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
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
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Initial Password (Optional)</Label>
                        <Input type="password" value={formData.adminPassword} onChange={e => setFormData({...formData, adminPassword: e.target.value})} placeholder="Leave blank to generate invite link" className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Business Type</Label>
                        <select
                          value={formData.businessType}
                          onChange={e => setFormData({...formData, businessType: e.target.value})}
                          className="h-10 px-2 text-sm font-bold border border-slate-200 rounded-sm bg-white"
                        >
                          <option value="RESTAURANT">Restaurant</option>
                          <option value="SALON">Salon / Barber</option>
                          <option value="SPORTS">Sports / Courts</option>
                          <option value="COWORKING">Coworking</option>
                          <option value="CLINIC">Clinic</option>
                          <option value="WEDDING">Wedding / Events</option>
                        </select>
                    </div>
                </div>
                {inviteLink && (
                  <div className="px-6 pb-4">
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-sm">
                      <Label className="text-[10px] font-black uppercase text-emerald-700">Setup Invite Link Generated</Label>
                      <div className="flex mt-1 gap-2">
                        <Input readOnly value={inviteLink} className="h-8 text-xs bg-white" />
                        <Button type="button" size="sm" onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success('Copied to clipboard!'); }} className="h-8 bg-emerald-600 hover:bg-emerald-700">Copy</Button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => { setIsDialogOpen(false); setInviteLink(null); }} className="h-9 text-xs font-bold text-slate-400">CLOSE</Button>
                    {!inviteLink && <Button type="submit" className="h-9 bg-emerald-600 hover:bg-emerald-700 text-xs font-black uppercase px-6 rounded-sm">INITIALIZE PROVISIONING</Button>}
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
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white max-h-[80vh] overflow-y-auto">
                        <div className="col-span-1 md:col-span-2 border-b border-slate-100 pb-6 mb-2">
                            <div className="flex items-center gap-2 mb-4">
                                <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Subscription Management</Label>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Plan Tier</Label>
                                    <select 
                                      className="w-full h-9 px-3 text-xs font-bold border border-slate-200 rounded-sm bg-slate-50"
                                      value={subscriptionForm.subscriptionPlan}
                                      onChange={e => {
                                        const plan = e.target.value;
                                        const newDate = new Date();
                                        if (plan === 'TRIAL') {
                                          newDate.setDate(newDate.getDate() + 14);
                                        } else {
                                          newDate.setMonth(newDate.getMonth() + 6);
                                        }
                                        setSubscriptionForm({
                                          ...subscriptionForm,
                                          subscriptionPlan: plan,
                                          subscriptionEndsAt: newDate.toISOString().split('T')[0]
                                        });
                                      }}
                                    >
                                      <option value="TRIAL">Trial</option>
                                      <option value="BASIC">Basic</option>
                                      <option value="PRO">Pro</option>
                                      <option value="PREMIUM">Premium</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Status</Label>
                                    <select 
                                      className="w-full h-9 px-3 text-xs font-bold border border-slate-200 rounded-sm bg-slate-50"
                                      value={subscriptionForm.subscriptionStatus}
                                      onChange={e => setSubscriptionForm({...subscriptionForm, subscriptionStatus: e.target.value})}
                                    >
                                      <option value="ACTIVE">Active</option>
                                      <option value="PAST_DUE">Past Due</option>
                                      <option value="CANCELED">Canceled</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400">Subscription Ends At</Label>
                                    <Input 
                                      type="date" 
                                      className="h-9 text-xs font-bold border-slate-200 rounded-sm bg-slate-50"
                                      value={subscriptionForm.subscriptionEndsAt}
                                      onChange={e => setSubscriptionForm({...subscriptionForm, subscriptionEndsAt: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div className="mt-4 space-y-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400">SysAdmin Notes</Label>
                                <textarea 
                                  className="w-full h-24 p-3 text-xs font-medium border border-slate-200 rounded-sm bg-slate-50 resize-none"
                                  placeholder="Internal notes about billing, integration, or custom agreements..."
                                  value={subscriptionForm.sysAdminNotes}
                                  onChange={e => setSubscriptionForm({...subscriptionForm, sysAdminNotes: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Business Vertical</Label>
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase">Business Type</Label>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Terminology & default features</p>
                                </div>
                                <select
                                  className="h-8 px-2 text-xs font-bold border border-slate-200 rounded-sm bg-slate-50"
                                  value={settingsForm.businessType}
                                  onChange={e => setSettingsForm({...settingsForm, businessType: e.target.value})}
                                >
                                  <option value="RESTAURANT">Restaurant</option>
                                  <option value="SALON">Salon / Barber</option>
                                  <option value="SPORTS">Sports / Courts</option>
                                  <option value="COWORKING">Coworking</option>
                                  <option value="CLINIC">Clinic</option>
                                  <option value="WEDDING">Wedding / Events</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Design Architecture</Label>
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase">Layout Style</Label>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Customer Portal Theme</p>
                                </div>
                                <select 
                                  className="h-8 px-2 text-xs font-bold border border-slate-200 rounded-sm bg-slate-50"
                                  value={settingsForm.layoutStyle}
                                  onChange={e => setSettingsForm({...settingsForm, layoutStyle: e.target.value})}
                                >
                                  <option value="CLASSIC_LIST">Classic List</option>
                                  <option value="EDITORIAL_IMAGE">Premium Editorial</option>
                                  <option value="ANIMATED">Olden (Vintage)</option>
                                  <option value="GARDEN_FRESH">Garden (Light & Creative)</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Platform Configuration</Label>
                            </div>
                            {/* Global currency — root-admin-only; tenant admins see it read-only. */}
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase">Currency</Label>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Global Menu & Deposit Currency</p>
                                </div>
                                <select
                                  className="h-8 px-2 text-xs font-bold border border-slate-200 rounded-sm bg-slate-50"
                                  value={settingsForm.currency}
                                  onChange={e => setSettingsForm({...settingsForm, currency: e.target.value})}
                                >
                                  <option value="TRY">TRY (₺)</option>
                                  <option value="USD">USD ($)</option>
                                  <option value="EUR">EUR (€)</option>
                                  <option value="GBP">GBP (£)</option>
                                </select>
                            </div>
                            {/* Default UI language — applied for users who haven't chosen one. */}
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase">Default Language</Label>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">Dashboard UI Language</p>
                                </div>
                                <select
                                  className="h-8 px-2 text-xs font-bold border border-slate-200 rounded-sm bg-slate-50"
                                  value={settingsForm.defaultLanguage}
                                  onChange={e => setSettingsForm({...settingsForm, defaultLanguage: e.target.value})}
                                >
                                  <option value="tr">Türkçe (TR)</option>
                                  <option value="en">English (EN)</option>
                                </select>
                            </div>
                            {/* 2FA capability — when on, the tenant admin can require 2FA by role. */}
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-rose-50/30">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-rose-900">Two-Factor Capability</Label>
                                    <p className="text-[9px] text-rose-400 font-bold uppercase">Let Tenant Require 2FA By Role</p>
                                </div>
                                <Checkbox checked={settingsForm.twoFactorEnabled} onCheckedChange={(c) => setSettingsForm({...settingsForm, twoFactorEnabled: !!c})} />
                            </div>
                        </div>

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
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-indigo-50/30">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-indigo-900">Wait Time Module</Label>
                                    <p className="text-[9px] text-indigo-400 font-bold uppercase">Enable Waitlist</p>
                                </div>
                                <Checkbox checked={settingsForm.hasWaitTimeFeature} onCheckedChange={(c) => setSettingsForm({...settingsForm, hasWaitTimeFeature: !!c})} />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-indigo-50/30">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-indigo-900">Shift Management</Label>
                                    <p className="text-[9px] text-indigo-400 font-bold uppercase">Staff Rostering</p>
                                </div>
                                <Checkbox checked={settingsForm.hasShiftFeature} onCheckedChange={(c) => setSettingsForm({...settingsForm, hasShiftFeature: !!c})} />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-indigo-50/30">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-indigo-900">Digital Menu</Label>
                                    <p className="text-[9px] text-indigo-400 font-bold uppercase">Menu & QR</p>
                                </div>
                                <Checkbox checked={settingsForm.hasMenuFeature} onCheckedChange={(c) => setSettingsForm({...settingsForm, hasMenuFeature: !!c})} />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-indigo-50/30">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-indigo-900">Paid Reservations</Label>
                                    <p className="text-[9px] text-indigo-400 font-bold uppercase">Deposits & Payment</p>
                                </div>
                                <Checkbox checked={settingsForm.hasPaymentFeature} onCheckedChange={(c) => setSettingsForm({...settingsForm, hasPaymentFeature: !!c})} />
                            </div>
                            {/* Organizer / wedding modules — meaningful for the WEDDING vertical. */}
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-amber-50/40">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-amber-900">Event Pipeline</Label>
                                    <p className="text-[9px] text-amber-500 font-bold uppercase">Lead → Confirmed</p>
                                </div>
                                <Checkbox checked={settingsForm.hasEventPipeline} onCheckedChange={(c) => setSettingsForm({...settingsForm, hasEventPipeline: !!c})} />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-amber-50/40">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-amber-900">Installment Plans</Label>
                                    <p className="text-[9px] text-amber-500 font-bold uppercase">Kapora & Taksit</p>
                                </div>
                                <Checkbox checked={settingsForm.hasInstallmentPlans} onCheckedChange={(c) => setSettingsForm({...settingsForm, hasInstallmentPlans: !!c})} />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-amber-50/40">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-amber-900">Guest List & Seating</Label>
                                    <p className="text-[9px] text-amber-500 font-bold uppercase">RSVP & Seating</p>
                                </div>
                                <Checkbox checked={settingsForm.hasGuestList} onCheckedChange={(c) => setSettingsForm({...settingsForm, hasGuestList: !!c})} />
                            </div>
                            <div className="flex items-center justify-between p-3 border border-slate-100 rounded-sm bg-amber-50/40">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-black uppercase text-amber-900">Vendor Coordination</Label>
                                    <p className="text-[9px] text-amber-500 font-bold uppercase">Photographers, DJs…</p>
                                </div>
                                <Checkbox checked={settingsForm.hasVendors} onCheckedChange={(c) => setSettingsForm({...settingsForm, hasVendors: !!c})} />
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

                            {(() => {
                                const adminUser = selectedTenant?.users?.find((u: any) => u.role === 'ADMIN');
                                if (!adminUser) return null;
                                return (
                                  <>
                                    <div className="pt-4 mt-2 border-t border-slate-100 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                                <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Two-Factor (OTP)</Label>
                                            </div>
                                            <Switch checked={otpRequired} disabled={otpBusy} onCheckedChange={(v: boolean) => handleToggleOtp(adminUser.id, v)} />
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                            Require an authenticator-app code at sign-in for <span className="font-bold text-slate-600">{adminUser.email}</span>.
                                            {otpRequired && (otpEnrolled
                                                ? <span className="text-emerald-600 font-bold"> Enrolled.</span>
                                                : <span className="text-amber-600 font-bold"> Awaiting setup at next sign-in.</span>)}
                                        </p>
                                    </div>
                                    <div className="pt-4 mt-2 border-t border-slate-100 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <KeyRound className="w-4 h-4 text-amber-500" />
                                            <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Password Reset</Label>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                            Generate a secure single-use link to reset <span className="font-bold text-slate-600">{adminUser.email}</span>. The password is never shown or stored in plain text.
                                        </p>
                                        {resetLink ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Input readOnly value={resetLink} className="h-9 text-[10px] font-mono border-slate-200 bg-slate-50 rounded-sm" onFocus={(e) => e.target.select()} />
                                                    <Button type="button" size="sm" onClick={() => { navigator.clipboard.writeText(resetLink); toast.success('Copied to clipboard!'); }} className="h-9 shrink-0 bg-slate-900 hover:bg-slate-800 text-white">
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                                <p className="text-[9px] text-amber-600 font-bold uppercase tracking-wide">
                                                    Share securely{resetExpiryMins ? ` · Expires in ${resetExpiryMins} min` : ''} · Single use
                                                </p>
                                            </div>
                                        ) : (
                                            <Button type="button" onClick={() => handleGenerateReset(adminUser.id)} disabled={resetLoading} className="h-9 w-full bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase rounded-sm">
                                                {resetLoading ? 'Generating…' : 'Generate Reset Link'}
                                            </Button>
                                        )}
                                    </div>
                                  </>
                                );
                            })()}
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
