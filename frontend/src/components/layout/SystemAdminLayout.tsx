'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldCheck, Buildings, Gear, SignOut, ChartBar, HardDrives, List, X, House, CaretRight } from '@phosphor-icons/react';
import { useAuthStore } from '@/store/useAuthStore';
import { useAdminThemeStore } from '@/store/useAdminThemeStore';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BrandLogo } from '@/components/BrandLogo';
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
  const { t, locale } = useTranslation();

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

  const activeItem = navigation.flatMap((g) => g.items).find((i) => pathname === i.href);

  const handleLogout = async () => {
    // Await so the local "authenticated" cache is actually cleared before we
    // navigate — otherwise the login page's own redirect-when-authenticated
    // effect could see stale state and bounce straight back to /dashboard.
    await logout();
    router.push('/auth/login');
  };

  return (
    <div data-admin-theme={theme} lang={locale} className="admin-surface-system flex h-dvh bg-background font-sans">
      {/* Mobile/tablet overlay — clicking off the sidebar closes it. */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          // h-dvh, not h-screen: 100vh reaches behind iOS Safari's bottom toolbar,
          // hiding the footer under Safari's chrome. dvh = visible height.
          "w-64 bg-[var(--admin-sidebar)] text-[var(--admin-sidebar-fg)] flex flex-col z-50 transition-transform duration-300 ease-in-out fixed lg:static top-0 h-dvh shrink-0 shadow-[2px_0_8px_rgba(0,0,0,0.25)]",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand/logo bar */}
        <div className="h-14 shrink-0 flex items-center justify-between gap-2 bg-[var(--admin-brand)] text-[var(--admin-brand-fg)] px-4">
          <Link href="/system-admin/dashboard" className="flex items-center gap-2 min-w-0">
            <BrandLogo size={30} tile="var(--admin-brand-fg)" glyph="var(--admin-brand)" textClassName="text-[19px]" />
            <span className="rounded-sm bg-black/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">SYS</span>
          </Link>
          <button
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-[var(--radius)] hover:bg-black/15"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User panel */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--admin-accent)] ring-2 ring-white/20 flex items-center justify-center text-white font-bold text-xs">SA</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {mounted ? `${user?.firstName || 'System'} ${user?.lastName || 'Admin'}` : 'System Admin'}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium">
              <span className="h-2 w-2 rounded-full bg-[#22c55e] shrink-0" />
              {isRoot ? t('systemAdmin.rootAuthority') : t('systemAdmin.restrictedAdministrator')}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto pb-4">
          {navigation.map((group, idx) => (
            <div key={idx}>
              <h3 className="bg-[var(--admin-sidebar-deep)] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-sidebar-muted)]">
                {group.section}
              </h3>
              <ul>
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={() => { if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 border-l-[3px] py-2.5 pl-[13px] pr-4 text-sm transition-colors',
                          isActive
                            ? 'border-[var(--admin-sidebar-edge)] bg-[var(--admin-sidebar-hover)] text-white font-semibold'
                            : 'border-transparent hover:bg-[var(--admin-sidebar-hover)] hover:text-white'
                        )}
                      >
                        <item.icon weight={isActive ? 'fill' : 'regular'} className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-[var(--admin-sidebar-edge)]')} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <button
          onClick={handleLogout}
          className="shrink-0 flex items-center gap-3 bg-[var(--admin-sidebar-deep)] border-l-[3px] border-transparent py-3 pl-[13px] pr-4 text-sm font-medium hover:bg-[var(--admin-sidebar-hover)] hover:text-white transition-colors"
        >
          <SignOut className="h-[18px] w-[18px]" /> {t('systemAdmin.logoutSystem')}
        </button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-1 bg-[var(--admin-header)] text-[var(--admin-header-fg)] px-2 sm:px-3 shadow-[0_1px_4px_rgba(0,0,0,0.2)] relative z-10">
          <button
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open navigation"
            className="lg:hidden h-10 w-10 flex items-center justify-center rounded-[var(--radius)] hover:bg-black/15 shrink-0"
          >
            <List weight="bold" className="h-5 w-5" />
          </button>
          <nav aria-label="Breadcrumb" className="min-w-0 flex items-center gap-2 px-2 text-sm">
            <House weight="fill" className="h-4 w-4 shrink-0 opacity-85" />
            <span className="hidden sm:inline opacity-85 whitespace-nowrap">{t('systemAdmin.systemManagement')}</span>
            {activeItem && (
              <>
                <CaretRight weight="bold" className="hidden sm:inline h-3 w-3 shrink-0 opacity-70" />
                <span className="font-semibold truncate">{activeItem.name}</span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-sm bg-black/15 px-2 py-1 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
              {t('systemAdmin.globalClusterActive')}
            </span>
            <LanguageSwitcher triggerClassName="h-10 w-10 text-inherit hover:text-inherit hover:bg-black/15" />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
