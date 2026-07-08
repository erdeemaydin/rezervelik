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
  Server,
  Menu,
  X
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { normalizeTheme } from '@/lib/themes';
import { useTranslation } from '@/i18n/provider';

interface SystemAdminLayoutProps {
  children: ReactNode;
}

// Cache key for the system-admin surface theme, so it applies on first paint
// (no default→chosen flash) before the /system/settings/global request returns.
const SYSTEM_THEME_CACHE = 'systemDashboardTheme';

export default function SystemAdminLayout({ children }: SystemAdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  // Below lg the sidebar is an off-canvas overlay (closed by default); at lg+ it's
  // a fixed rail that's always shown.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<string>(() =>
    typeof window === 'undefined' ? 'default' : normalizeTheme(localStorage.getItem(SYSTEM_THEME_CACHE))
  );
  const { t } = useTranslation();

  useEffect(() => {
    setMounted(true);
    // Desktop (lg+) shows the sidebar by default; smaller screens keep it closed.
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setIsSidebarOpen(true);
    }
    // Server-side route protection was removed (token is in localStorage, not a
    // cookie), so guard here: bounce unauthenticated users to login, and
    // non-superadmins to their tenant dashboard.
    if (!user) {
      router.push('/auth/login');
    } else if (user.role !== 'SUPER_ADMIN') {
      router.push('/dashboard');
    }
  }, [user, router]);

  // Load the system-admin surface theme (set by the root admin in Global Settings).
  useEffect(() => {
    if (!user || user.role !== 'SUPER_ADMIN') return;
    import('@/lib/api').then(({ default: api }) => {
      api.get('/system/settings/global').then((res) => {
        const th = normalizeTheme(res.data?.data?.dashboardTheme);
        setTheme(th);
        try { localStorage.setItem(SYSTEM_THEME_CACHE, th); } catch { /* best-effort */ }
      }).catch(() => { /* keep cached/default theme on failure */ });
    });
  }, [user]);

  const navigation = [
    { section: t('systemAdmin.globalOverview'), items: [
      { name: t('systemAdmin.systemMetrics'), href: '/system-admin/dashboard', icon: BarChart3 },
      { name: t('systemAdmin.tenantManagement'), href: '/system-admin/tenants', icon: Building2 },
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
    <div data-admin-theme={theme} className="admin-surface-system flex h-dvh bg-[var(--admin-bg)] font-sans">
      {/* Mobile/tablet overlay — clicking off the sidebar closes it. */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Floating open button — only on mobile/tablet when the sidebar is hidden. */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Open navigation"
          className="lg:hidden fixed top-3 left-3 z-40 w-11 h-11 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center active:scale-95 transition-all"
        >
          <Menu className="w-6 h-6" />
        </button>
      )}

      <aside
        className={cn(
          // h-dvh, not h-screen: 100vh reaches behind iOS Safari's bottom toolbar,
          // hiding the logout button under Safari's chrome. dvh = visible height.
          "w-64 bg-[var(--admin-sidebar)] text-slate-300 flex flex-col shadow-2xl z-50 transition-transform duration-300 ease-in-out fixed lg:static top-0 h-dvh",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center justify-between px-6 bg-black/20 border-b border-slate-800">
          <div className="flex items-center">
            <div className="w-7 h-7 bg-emerald-600 rounded-sm flex items-center justify-center mr-3 shadow-md">
              <span className="text-white font-bold text-lg leading-none">S</span>
            </div>
            <span className="font-bold text-lg text-white tracking-tight uppercase">System<span className="text-emerald-400">Adm</span></span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-md hover:bg-slate-800/60"
          >
            <X className="w-5 h-5" />
          </button>
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
                          onClick={() => { if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
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
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="p-4 bg-black/20 border-t border-slate-800">
          <Button variant="ghost" className="w-full justify-start text-slate-500 hover:text-white hover:bg-red-500/10" onClick={handleLogout}>
            <LogOut className="mr-3 h-5 w-5" /> {t('systemAdmin.logoutSystem')}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-white border-b flex items-center justify-between pl-16 pr-4 lg:px-8 shadow-sm shrink-0">
          <h2 className="text-base sm:text-xl font-bold text-slate-800 truncate">{t('systemAdmin.systemManagement')}</h2>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <LanguageSwitcher />
            <Badge variant="outline" className="hidden sm:inline-flex text-emerald-600 border-emerald-200 bg-emerald-50">{t('systemAdmin.globalClusterActive')}</Badge>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
