'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, Edit2, Trash2, Search, ShieldCheck, ShieldAlert, Users, Settings2, Shield
} from 'lucide-react';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  permissions: string | null;
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
];

const PRESET_ROLES = {
  "MANAGER": ['manage_reservations', 'manage_tables', 'edit_floor_plan', 'manage_menu', 'manage_calendar', 'manage_staff', 'manage_settings'],
  "HOST": ['manage_reservations', 'manage_tables'],
  "STAFF": []
};

export default function StaffManagementPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'STAFF',
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
      toast.error('Failed to load staff. Check permissions.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setIsEditMode(false);
    setSelectedId(null);
    setFormData({
      firstName: '', lastName: '', email: '', password: '', role: 'STAFF',
      permissions: new Set()
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
      password: '', // blank unless changing
      role: member.role,
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

      if (isEditMode && selectedId) {
        await api.put(`/staff/${selectedId}`, payload);
        toast.success('Staff member updated');
      } else {
        await api.post('/staff', payload);
        toast.success('Staff member created');
      }
      setIsDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this staff member?')) return;
    try {
      await api.delete(`/staff/${id}`);
      toast.success('Staff member removed');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const filteredStaff = staff.filter(s => 
    s.firstName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AdminLayout>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Staff Operations</h1>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1 italic">Role & Privilege Management</p>
          </div>
          <Button size="sm" onClick={handleOpenCreate} className="bg-blue-600 hover:bg-blue-700 text-white rounded-sm h-9 px-6 font-black text-[10px] uppercase shadow-md shadow-blue-600/20">
            <Plus className="w-3.5 h-3.5 mr-1.5 stroke-[3]" /> Add Staff Member
          </Button>
        </div>

        {/* Command Center */}
        <Card className="rounded-md border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="p-3 bg-slate-50/50 border-b border-slate-200 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Active Personnel</span>
            </div>
            <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <Input placeholder="Search name or email..." className="pl-8 h-8 text-xs bg-white border-slate-200 rounded-sm" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="h-9 border-b border-slate-200">
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-6">Identity</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Base Role</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Custom Entitlements</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</TableHead>
                  <TableHead className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right px-6">Command</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={5} className="h-48 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Retrieving Staff Records...</TableCell></TableRow>
                ) : filteredStaff.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="h-48 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">No matching personnel found</TableCell></TableRow>
                ) : filteredStaff.map((member) => (
                  <TableRow key={member.id} className="h-14 hover:bg-slate-50/50 border-b border-slate-100 transition-colors">
                    <TableCell className="px-6 py-3">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-900 text-sm tracking-tight">{member.firstName} {member.lastName}</span>
                        <span className="text-[10px] font-mono text-slate-500 mt-0.5">{member.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-[9px] font-black uppercase px-2 shadow-none rounded-sm", member.role === 'ADMIN' || member.role === 'MANAGER' ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700")}>
                          {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[250px]">
                        {member.role === 'ADMIN' ? (
                            <Badge variant="outline" className="text-[8px] font-black bg-emerald-50 text-emerald-700 border-emerald-200 uppercase px-1 py-0 shadow-none"><ShieldCheck className="w-2.5 h-2.5 mr-1" /> Full Access</Badge>
                        ) : member.permissions ? (
                            member.permissions.split(',').map(p => (
                                <Badge key={p} variant="outline" className="text-[8px] font-black bg-white text-slate-500 border-slate-200 uppercase px-1 py-0 shadow-none">
                                    {p.replace('manage_', '')}
                                </Badge>
                            ))
                        ) : (
                            <span className="text-[9px] font-bold text-slate-400 italic">No custom rules</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-black uppercase tracking-tighter">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" /> Active
                        </div>
                    </TableCell>
                    <TableCell className="px-6 text-right">
                        {member.id !== currentUser?.id && member.role !== 'SUPER_ADMIN' && member.role !== 'ADMIN' ? (
                            <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(member)} className="h-7 w-7 text-slate-300 hover:text-blue-600 transition-colors"><Edit2 className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(member.id)} className="h-7 w-7 text-slate-300 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                        ) : (
                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mr-2">Protected</span>
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
                            <DialogTitle className="text-sm font-bold uppercase tracking-widest">{isEditMode ? 'Update Personnel Record' : 'Register New Staff'}</DialogTitle>
                        </DialogHeader>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white">
                        <div className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">First Name</Label>
                                    <Input required value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Last Name</Label>
                                    <Input required value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Email / Login ID</Label>
                                <Input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm font-mono" />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">{isEditMode ? 'New Password (Optional)' : 'Initial Password'}</Label>
                                <Input type="password" required={!isEditMode} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="h-10 text-sm font-bold border-slate-200 rounded-sm" />
                            </div>
                            <div className="grid gap-1.5 pt-4 border-t border-slate-100">
                                <Label className="text-[10px] font-black uppercase text-slate-400 ml-1">Base Role Template</Label>
                                <Select value={formData.role} onValueChange={handleRoleChange}>
                                    <SelectTrigger className="h-10 text-sm font-bold border-slate-200 rounded-sm bg-slate-50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="MANAGER" className="text-xs font-bold text-blue-700">Manager (All Ops)</SelectItem>
                                        <SelectItem value="HOST" className="text-xs font-bold text-slate-700">Host (Tables & Res.)</SelectItem>
                                        <SelectItem value="STAFF" className="text-xs font-bold text-slate-700">Standard Staff (View Only)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-4 border-l border-slate-100 pl-6">
                            <div className="flex items-center gap-2 mb-2">
                                <Shield className="w-4 h-4 text-blue-500" />
                                <Label className="text-xs font-black uppercase text-slate-800 tracking-tight">Granular Entitlements</Label>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed mb-4">Toggle specific access rights beyond the base role template.</p>
                            
                            <div className="grid gap-3">
                                {AVAILABLE_PERMISSIONS.map(perm => (
                                    <div key={perm.id} className={cn("flex items-center justify-between p-3 border rounded-sm transition-all", formData.permissions.has(perm.id) ? "border-blue-200 bg-blue-50/30" : "border-slate-100 bg-slate-50/50")}>
                                        <div className="space-y-0.5">
                                            <div className={cn("text-xs font-black uppercase tracking-tight", formData.permissions.has(perm.id) ? "text-blue-700" : "text-slate-600")}>{perm.label}</div>
                                            <div className="text-[9px] font-bold text-slate-400">{perm.desc}</div>
                                        </div>
                                        <Checkbox checked={formData.permissions.has(perm.id)} onCheckedChange={() => togglePermission(perm.id)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="h-9 text-xs font-bold text-slate-400 uppercase tracking-widest px-6">Cancel</Button>
                        <Button type="submit" className="h-9 bg-blue-600 hover:bg-blue-700 text-xs font-black uppercase px-8 rounded-sm shadow-lg shadow-blue-600/20">Commit Record</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
