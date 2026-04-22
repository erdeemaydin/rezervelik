'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  ShieldCheck, 
  Users, 
  Building2, 
  Settings, 
  LogOut,
  BarChart3,
  Server
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface SystemAdminLayoutProps {
  children: ReactNode;
}

export default function SystemAdminLayout({ children }: SystemAdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const navigation = [
    { section: 'Global Overview', items: [
      { name: 'System Metrics', href: '/system-admin/dashboard', icon: BarChart3 },
      { name: 'Tenant Management', href: '/system-admin/tenants', icon: Building2, badge: 'Active' },
    ]},
    { section: 'User Control', items: [
      { name: 'Super Admins', href: '/system-admin/admins', icon: ShieldCheck },
      { name: 'Activity Audit', href: '/system-admin/audit', icon: Server },
    ]},
    { section: 'Configuration', items: [
      { name: 'Global Settings', href: '/system-admin/settings', icon: Settings },
    ]}
  ];

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  return (
    <div className="flex h-screen bg-[#f1f5f9] font-sans">
      <aside className="w-64 bg-[#0f172a] text-slate-300 flex flex-col shadow-2xl z-10">
        <div className="h-16 flex items-center px-6 bg-[#020617] border-b border-slate-800">
          <div className="w-7 h-7 bg-emerald-600 rounded-sm flex items-center justify-center mr-3 shadow-md">
            <span className="text-white font-bold text-lg leading-none">S</span>
          </div>
          <span className="font-bold text-lg text-white tracking-tight uppercase">System<span className="text-emerald-400">Adm</span></span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6">
          <div className="px-6 mb-8 flex items-center space-x-3">
            <div className="h-9 w-9 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-500 font-black text-xs">SA</div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user?.firstName || 'System'} {user?.lastName || 'Admin'}</p>
              <p className="text-[9px] text-emerald-500 font-black uppercase tracking-tighter">Root Authority</p>
            </div>
          </div>

          <nav className="space-y-6">
            {navigation.map((group, idx) => (
              <div key={idx}>
                <h3 className="px-6 text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                  {group.section}
                </h3>
                <ul className="space-y-0.5 px-2">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center justify-between px-4 py-2 text-xs font-bold rounded-sm transition-all duration-150',
                            isActive 
                              ? 'bg-emerald-600 text-white shadow-md' 
                              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                          )}
                        >
                          <div className="flex items-center">
                            <item.icon className={cn('mr-3 h-4 w-4', isActive ? 'text-white' : 'text-slate-500')} />
                            {item.name}
                          </div>
                          {item.badge && <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[9px] px-1 rounded-sm font-black">{item.badge}</Badge>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="p-4 bg-[#020617] border-t border-slate-800">
          <Button variant="ghost" className="w-full justify-start text-slate-500 hover:text-white hover:bg-red-500/10" onClick={handleLogout}>
            <LogOut className="mr-3 h-5 w-5" /> Logout System
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-between px-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800">System Management</h2>
          <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">Global Cluster: Active</Badge>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
