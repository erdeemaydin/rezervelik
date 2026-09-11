'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck, Users, Buildings, Gear, SignOut, ChartBar, HardDrives, List, X } from '@phosphor-icons/react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminThemeStore } from '@/store/useAdminThemeStore';
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

type NavItem = { name: string; href: string; icon: typeof ChartBar };
const compactNavItems = (items: (NavItem | false)[]): NavItem[] => items.filter(Boolean) as NavItem[];

export default function SystemAdminLayout({ children }: SystemAdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  // Below lg the sidebar is an off-canvas overlay (closed by default); at lg+ it's
  // a fixed rail that's always shown.
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Shared theme store is the single source of truth (see useAdminThemeStore) so
  // the system settings page's live preview / save reskins this persistent layout
  // via React, with no imperative DOM writes that could desync back to blue.
  const theme = useAdminThemeStore((s) => s.theme);
  const setAdminTheme = useAdminThemeStore((s) => s.setTheme);
  const { t } = useTranslation();

  useEffect(() => {
    setMounted(true);
    // Desktop (lg+) shows the sidebar by default; smaller screens keep it closed.
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setIsSidebarOpen(true);
    }
    // HardDrives-side route protection was removed (token is in localStorage, not a
    // cookie), so guard here: bounce unauthenticated users to login, and
    // non-superadmins to their tenant dashboard.
    if (!user) {
      router.push('/auth/login');
    } else if (user.role !== 'SUPER_ADMIN') {
      router.push('/dashboard');
    }
  }, [user, router]);

  // Load the system-admin surface theme (set by the root admin in Global Gear).
  useEffect(() => {
    if (!user || user.role !== 'SUPER_ADMIN') return;
    // Seed from this surface's cache first (the shared store may still hold a
    // previous tenant session's theme after an SPA login), then correct from the
    // server response.
    setAdminTheme(localStorage.getItem(SYSTEM_THEME_CACHE));
    import('@/lib/api').then(({ default: api }) => {
      api.get('/system/settings/global').then((res) => {
        const th = normalizeTheme(res.data?.data?.dashboardTheme);
        setAdminTheme(th);
        try { localStorage.setItem(SYSTEM_THEME_CACHE, th); } catch { /* best-effort */ }
      }).catch(() => { /* keep cached/default theme on failure */ });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // A restricted sub-admin (isRootAdmin === false) only sees nav entries for
  // capabilities its `permissions` actually grants; a root admin (undefined
  // counts as root — older tokens predate this field) sees everything.
  // "Super Admins" (administrator management) is never shown to a sub-admin —
  // that's root-only on the backend regardless of any granted permission.
  const isRoot = user?.isRootAdmin !== false;
  const perms = (user?.permissions || '').split(',').filter(Boolean);
  const has = (key: string) => isRoot || perms.includes(key);

  const navigation = [
    { section: t('systemAdmin.globalOverview'), items: compactNavItems([
      has('sys_view_metrics') && { name: t('systemAdmin.systemMetrics'), href: '/system-admin/dashboard', icon: ChartBar },
      has('sys_manage_tenants') && { name: t('systemAdmin.tenantManagement'), href: '/system-admin/tenants', icon: Buildings },
    ]) },
    { section: t('systemAdmin.userControl'), items: compactNavItems([
      isRoot && { name: t('systemAdmin.superAdmins'), href: '/system-admin/admins', icon: ShieldCheck },
      has('sys_view_audit_log') && { name: t('systemAdmin.activityAudit'), href: '/system-admin/audit', icon: HardDrives },
    ]) },
    { section: t('systemAdmin.configuration'), items: compactNavItems([
      has('sys_manage_global_settings') && { name: t('systemAdmin.globalSettings'), href: '/system-admin/settings', icon: Gear },
    ]) },
  ].filter((group) => group.items.length > 0);

  const handleLogout = async () => {
    // Await so the local "authenticated" cache is actually cleared before we
    // navigate — otherwise the login page's own redirect-when-authenticated
    // effect could see stale state and bounce straight back to /dashboard.
    await logout();
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
          <List className="w-6 h-6" />
        </button>
      )}

      <aside
        className={cn(
          // h-dvh, not h-screen: 100vh reaches behind iOS Safari's bottom toolbar,
          // hiding the logout button under Safari's chrome. dvh = visible height.
          "w-64 bg-[var(--admin-sidebar)] text-stone-700 border-r border-stone-300 flex flex-col z-50 transition-transform duration-300 ease-in-out fixed lg:static top-0 h-dvh",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-stone-300">
          <div className="flex items-center">
            <div className="w-7 h-7 bg-[#111111] rounded-sm flex items-center justify-center mr-3">
              <span className="text-white font-bold text-lg leading-none">S</span>
            </div>
            <span className="font-bold text-lg text-stone-900 tracking-tight">System<span className="text-[var(--admin-accent)]">Adm</span></span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden text-stone-400 hover:text-stone-900 w-8 h-8 flex items-center justify-center rounded-md hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6">
          <div className="px-6 mb-8 flex items-center space-x-3">
            <div className="h-9 w-9 rounded-md bg-stone-100 border border-stone-300 flex items-center justify-center text-[var(--admin-accent)] font-semibold text-xs">SA</div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-stone-900 truncate">
                {mounted ? `${user?.firstName || 'System'} ${user?.lastName || 'Admin'}` : 'System Admin'}
              </p>
              <p className="text-[9px] text-[var(--admin-accent)] font-semibold tracking-tighter">
                {isRoot ? t('systemAdmin.rootAuthority') : t('systemAdmin.restrictedAdministrator')}
              </p>
            </div>
          </div>

          <nav className="space-y-6">
            {navigation.map((group, idx) => (
              <div key={idx}>
                <h3 className="px-6 text-[10px] font-semibold text-stone-400 tracking-[0.18em] mb-3">
                  {group.section}
                </h3>
                <ul className="space-y-1 px-2">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          onClick={() => { if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                          className={cn(
                            'flex items-center justify-between py-2.5 text-xs font-bold rounded-sm transition-all duration-150',
                            // Same current-page treatment as the tenant dashboard sidebar:
                            // muted pastel fill + left edge, not a color swap.
                            isActive
                              ? 'bg-[var(--admin-accent-tint)] text-[var(--admin-accent-strong)] border-l-2 border-[var(--admin-accent)] pl-3.5 pr-4'
                              : 'px-4 text-stone-500 hover:bg-stone-100 hover:text-stone-900'
                          )}
                        >
                          <div className="flex items-center">
                            <item.icon weight={isActive ? 'bold' : 'regular'} className={cn('mr-3 h-4 w-4', isActive ? 'text-[var(--admin-accent-strong)]' : 'text-stone-400')} />
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

        <div className="p-4 border-t border-stone-300">
          <Button variant="ghost" className="w-full justify-start text-stone-500 hover:text-red-600 hover:bg-red-50" onClick={handleLogout}>
            <SignOut className="mr-3 h-5 w-5" /> {t('systemAdmin.logoutSystem')}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-white border-b border-stone-300 flex items-center justify-between pl-16 pr-4 lg:px-8 shrink-0">
          <h2 className="text-base sm:text-xl font-semibold text-stone-900 truncate font-heading">{t('systemAdmin.systemManagement')}</h2>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <LanguageSwitcher />
            <Badge variant="outline" className="hidden sm:inline-flex text-[var(--admin-accent-strong)] border-[var(--admin-accent-tint-3)] bg-[var(--admin-accent-tint)]">{t('systemAdmin.globalClusterActive')}</Badge>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
