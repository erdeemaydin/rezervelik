'use client';

import { ReactNode, useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/provider';

interface SystemAdminLayoutProps {
  children: ReactNode;
}

export default function SystemAdminLayout({ children }: SystemAdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setMounted(true);
    // Server-side route protection was removed (token is in localStorage, not a
    // cookie), so guard here: bounce unauthenticated users to login, and
    // non-superadmins to their tenant dashboard.
    if (!user) {
      router.push('/auth/login');
    } else if (user.role !== 'SUPER_ADMIN') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const navigation = [
    { section: t('systemAdmin.globalOverview'), items: [
      { name: t('systemAdmin.systemMetrics'), href: '/system-admin/dashboard', icon: BarChart3 },
      { name: t('systemAdmin.tenantManagement'), href: '/system-admin/tenants', icon: Building2, badge: t('systemAdmin.active') },
    ]},
    { section: t('systemAdmin.userControl'), items: [
      { name: t('systemAdmin.superAdmins'), href: '/system-admin/admins', icon: ShieldCheck },
      { name: t('systemAdmin.activityAudit'), href: '/system-admin/audit', icon: Server },
    ]},
    { section: t('systemAdmin.configuration'), items: [
      { name: t('systemAdmin.globalSettings'), href: '/system-admin/settings', icon: Settings },
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
              <p className="text-xs font-bold text-white truncate">
                {mounted ? `${user?.firstName || 'System'} ${user?.lastName || 'Admin'}` : 'System Admin'}
              </p>
              <p className="text-[9px] text-emerald-500 font-black uppercase tracking-tighter">{t('systemAdmin.rootAuthority')}</p>
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
            <LogOut className="mr-3 h-5 w-5" /> {t('systemAdmin.logoutSystem')}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center justify-between px-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800">{t('systemAdmin.systemManagement')}</h2>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">{t('systemAdmin.globalClusterActive')}</Badge>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
