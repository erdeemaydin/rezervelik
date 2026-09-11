'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SquaresFour, Users, GridFour, Gear, SignOut, Calendar, ForkKnife, ChartBar, Chat, CreditCard, CaretLeft, CaretRight, Clock, DeviceTablet, Confetti, Handshake, Scissors, Sparkle, Trophy, ClipboardText, Buildings, DoorOpen, Stethoscope, Heartbeat, Package, Armchair, Scroll, ShoppingBag } from '@phosphor-icons/react';
import { useAuthStore } from '@/store/useAuthStore';
import { useFormatStore } from '@/store/useFormatStore';
import { useTenantStore } from '@/store/useTenantStore';
import { useAdminThemeStore } from '@/store/useAdminThemeStore';
import { useTerms } from '@/hooks/useTerms';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/i18n/provider';
import { readAuth } from '@/lib/authStorage';
import Cookies from 'js-cookie';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { ImpersonationBanner } from '@/components/layout/ImpersonationBanner';

interface AdminLayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: any;
  perm?: string;
  feature?: string;
  // Restricted to the ADMIN role regardless of the `manage_settings` permission
  // string a MANAGER/STAFF might otherwise hold — audit trail visibility is a
  // role guarantee, not a delegable permission.
  adminOnly?: boolean;
}

// Read the last cached /settings response for the current tenant. Used to seed
// state synchronously on first render so feature-gated nav items (Menu, Waitlist,
// Staff Schedule…) don't flash out and re-appear on every refresh/navigation
// while the network /settings request is in flight.
const readTenantSettingsCache = (): any => {
  if (typeof window === 'undefined') return null;
  try {
    // restaurantId lives in localStorage (authStorage), NOT a cookie — reading it
    // via Cookies.get() always returned undefined, so this cache never hit and the
    // dashboard fell back to the default (blue) theme on every hard refresh until
    // /settings returned. readAuth() checks the in-memory/localStorage layers.
    const rid = readAuth('restaurantId');
    if (!rid) return null;
    return JSON.parse(localStorage.getItem(`tenantSettingsCache:${rid}`) || 'null');
  } catch {
    return null;
  }
};

interface NavSection {
  section: string;
  items: NavItem[];
}

// Per-vertical iconography so the shared dashboard chrome doesn't read as
// restaurant-only for salons/clinics/etc. `brand` is the sidebar mark; `catalog`
// and `resource` re-skin the menu/tables nav icons to the vertical's concept.
const VERTICAL_ICONS: Record<string, { brand: any; catalog: any; resource: any }> = {
  RESTAURANT: { brand: ForkKnife, catalog: ForkKnife, resource: GridFour },
  SALON: { brand: Scissors, catalog: Sparkle, resource: Armchair },
  SPORTS: { brand: Trophy, catalog: ClipboardText, resource: GridFour },
  COWORKING: { brand: Buildings, catalog: ClipboardText, resource: DoorOpen },
  CLINIC: { brand: Stethoscope, catalog: Heartbeat, resource: DoorOpen },
  WEDDING: { brand: Confetti, catalog: Package, resource: Buildings },
};

// Permission required to open each dashboard route. Enforced here so a page can't
// be reached just by pasting its URL — the backend rejects the underlying data
// calls too, this is the matching client-side guard. Longest prefix wins; routes
// not listed (profile, scheduling) are open to any authenticated staff member.
const ROUTE_PERMS: { prefix: string; perm: string; exact?: boolean; adminOnly?: boolean }[] = [
  { prefix: '/dashboard', perm: 'view_analytics', exact: true },
  { prefix: '/dashboard/analytics', perm: 'view_analytics' },
  { prefix: '/dashboard/payments', perm: 'view_payments' },
  { prefix: '/dashboard/reviews', perm: 'view_reviews' },
  { prefix: '/dashboard/reservations', perm: 'manage_reservations' },
  { prefix: '/dashboard/host', perm: 'manage_reservations' },
  { prefix: '/dashboard/calendar', perm: 'manage_calendar' },
  { prefix: '/dashboard/tables', perm: 'manage_tables' },
  { prefix: '/dashboard/menus', perm: 'manage_menu' },
  { prefix: '/dashboard/wait-time', perm: 'manage_settings' },
  { prefix: '/dashboard/staff', perm: 'manage_staff' },
  { prefix: '/dashboard/orders', perm: 'manage_orders' },
  { prefix: '/dashboard/customization', perm: 'manage_settings' },
  { prefix: '/dashboard/settings', perm: 'manage_settings' },
  { prefix: '/dashboard/audit', perm: 'manage_settings', adminOnly: true },
];

const requiredPermForPath = (path: string): string | undefined => {
  const matches = ROUTE_PERMS.filter(r =>
    r.exact ? path === r.prefix : (path === r.prefix || path.startsWith(`${r.prefix}/`))
  );
  if (matches.length === 0) return undefined;
  // Longest prefix wins so /dashboard/analytics beats the exact /dashboard rule.
  return matches.sort((a, b) => b.prefix.length - a.prefix.length)[0].perm;
};

// Mirrors requiredPermForPath's longest-prefix match, but for the ADMIN-only
// gate (the audit trail today) — kept as a separate lookup since most routes
// don't carry it.
const requiresAdminOnly = (path: string): boolean => {
  const matches = ROUTE_PERMS.filter(r =>
    r.exact ? path === r.prefix : (path === r.prefix || path.startsWith(`${r.prefix}/`))
  );
  if (matches.length === 0) return false;
  return !!matches.sort((a, b) => b.prefix.length - a.prefix.length)[0].adminOnly;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  // Seed from the per-tenant cache synchronously so the correct set of nav items
  // is present on the very first paint (no flash-out on refresh/navigation).
  const [tenantSettings, setTenantSettings] = useState<any>(() => readTenantSettingsCache());
  // Whether we know the tenant's entitlements yet. True immediately when a cache
  // hit seeded tenantSettings; otherwise it flips once the /settings response
  // lands. Until then, feature-gated nav items stay hidden rather than flashing.
  const [settingsLoaded, setSettingsLoaded] = useState(() => readTenantSettingsCache() != null);
  // Whether we've confirmed *this session* that the platform is reachable and not
  // in maintenance. Unlike settingsLoaded, this is NEVER seeded from cache — the
  // dashboard chrome stays behind a splash until a live /settings request returns,
  // so a hard refresh during maintenance shows the splash → maintenance page and
  // never flashes the (wrong-theme) dashboard first. Fails open on transient
  // errors so a backend hiccup can't trap staff on the splash.
  const [verifiedLive, setVerifiedLive] = useState(false);
  const { t, setLocale } = useTranslation();
  const { term, businessType } = useTerms();
  // Only override the vertical-specific nav labels for non-restaurant tenants, so
  // existing restaurant dashboards render exactly as before.
  const isRestaurant = businessType === 'RESTAURANT';
  const vIcon = VERTICAL_ICONS[businessType] || VERTICAL_ICONS.RESTAURANT;
  // Per-tenant dashboard color theme. The shared store is the single source of
  // truth (seeded from cache so it applies on first paint); it comes from
  // RestaurantSettings so all of this tenant's staff share it. Reading it from the
  // store — instead of deriving it from local state — is what lets the settings
  // page's live preview and save reskin this persistent layout without a refetch,
  // and stops the theme from reverting to blue on navigation.
  const theme = useAdminThemeStore((s) => s.theme);
  const setAdminTheme = useAdminThemeStore((s) => s.setTheme);

  useEffect(() => {
    setIsMounted(true);
    // Only desktop (lg+) auto-opens; tablets keep the sidebar as a closed overlay.
    if (window.innerWidth >= 1024) {
      setIsSidebarOpen(true);
    }

    // tenantSettings is already seeded from the per-tenant cache synchronously via
    // the useState initializers, so feature-gated nav items are correct on first
    // paint. Hydrate the vertical store from that cached value for terminology.
    if (tenantSettings) {
      useTenantStore.getState().setBusinessType(tenantSettings.businessType || 'RESTAURANT');
      // Re-seed the theme store from the cached value in case this layout mounted
      // (e.g. after an SPA login) before the store's own cache read had a tenant.
      setAdminTheme(tenantSettings.dashboardTheme);
    }

    if (isAuthenticated) {
      // Fetch tenant settings to check feature flags
      import('@/lib/api').then(({ default: api }) => {
        api.get('/settings').then((res) => {
          setTenantSettings(res.data.data);
          // Authoritative theme from the server → update the shared store so the
          // whole dashboard reskins immediately (and correctly on refresh).
          setAdminTheme(res.data.data?.dashboardTheme);
          try {
            const id = readAuth('restaurantId');
            if (id) localStorage.setItem(`tenantSettingsCache:${id}`, JSON.stringify(res.data.data));
          } catch { /* quota/serialization — non-fatal */ }
          // Hydrate the platform-wide date/time convention for the whole dashboard.
          useFormatStore.getState().setSystem(res.data.data?.measurementSystem || 'METRIC');
          // Hydrate the tenant's vertical so terminology labels (useTerms) render
          // per business type across the dashboard.
          useTenantStore.getState().setBusinessType(res.data.data?.businessType || 'RESTAURANT');
          // Apply the tenant's default UI language (set by the root admin) for users
          // who haven't explicitly picked one. Only a deliberate LanguageSwitcher
          // choice sets NEXT_LOCALE_EXPLICIT — the plain NEXT_LOCALE cookie is
          // auto-negotiated by proxy.ts from Accept-Language, so it can't count as
          // "the user chose this" or the tenant default would never take effect.
          const def = res.data.data?.defaultLanguage;
          const explicit = Cookies.get('NEXT_LOCALE_EXPLICIT') === '1';
          if (def && !explicit && Cookies.get('NEXT_LOCALE') !== def) {
            setLocale(def);
          }
          // Platform confirmed reachable & not in maintenance → reveal the dashboard.
          setVerifiedLive(true);
        }).catch(err => {
          // In maintenance the response interceptor (lib/api.ts) redirects to
          // /maintenance; leave verifiedLive false so the splash stays up and the
          // dashboard is never revealed. Any other failure fails open.
          const code = err?.response?.data?.code;
          if (!(err?.response?.status === 503 && code === 'errors.maintenance')) {
            setVerifiedLive(true);
          }
          console.error('Failed to fetch settings:', err);
        })
          .finally(() => setSettingsLoaded(true));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // AUTH GUARD - Prevent "ghost" staff login
  useEffect(() => {
    if (isMounted && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isMounted, isAuthenticated, router]);

  const navigation: NavSection[] = [
    { section: t('systemAdmin.globalOverview') || 'Overview', items: [
      { name: t('admin.dashboard'), href: '/dashboard', icon: SquaresFour, perm: 'view_analytics' },
      { name: t('admin.analytics'), href: '/dashboard/analytics', icon: ChartBar, perm: 'view_analytics' },
    ]},
    { section: t('admin.sectionOperations'), items: [
      { name: isRestaurant ? t('admin.reservations') : term('bookingPlural'), href: '/dashboard/reservations', icon: Calendar, perm: 'manage_reservations' },
      { name: t('events.navTitle'), href: '/dashboard/events', icon: Confetti, feature: 'hasEventPipeline' },
      { name: t('vendors.navTitle'), href: '/dashboard/vendors', icon: Handshake, feature: 'hasVendors' },
      { name: t('admin.hostStand'), href: '/dashboard/host', icon: DeviceTablet, perm: 'manage_reservations' },
      { name: t('admin.calendar'), href: '/dashboard/calendar', icon: Calendar, perm: 'manage_calendar' },
      { name: isRestaurant ? t('admin.tablesAndFloor') : term('resourcePlural'), href: '/dashboard/tables', icon: vIcon.resource, perm: 'manage_tables' },
      { name: isRestaurant ? t('admin.menuManagement') : term('catalog'), href: '/dashboard/menus', icon: vIcon.catalog, perm: 'manage_menu', feature: 'hasMenuFeature' },
      { name: t('admin.waitlist'), href: '/dashboard/wait-time', icon: Clock, perm: 'manage_settings', feature: 'hasWaitTimeFeature' },
      { name: t('admin.staffSchedule'), href: '/dashboard/scheduling', icon: Calendar, feature: 'hasShiftFeature' },
      { name: t('admin.orders'), href: '/dashboard/orders', icon: ShoppingBag, perm: 'manage_orders', feature: 'hasOnlineOrdering' },
    ]},
    // Administration used to be one flat, unrelated grab-bag (payments ledger,
    // staff records, reviews, branding, audit log, and settings all side by side).
    // Split by what they actually have in common so "who works here" reads
    // separately from "how the business is configured" and from "compliance record".
    { section: t('admin.sectionPeople'), items: [
      { name: t('admin.staffMembers'), href: '/dashboard/staff', icon: Users, perm: 'manage_staff' },
    ]},
    { section: t('admin.sectionBusiness'), items: [
      { name: t('admin.payments'), href: '/dashboard/payments', icon: CreditCard, feature: 'hasPaymentFeature', perm: 'view_payments' },
      { name: t('admin.reviews'), href: '/dashboard/reviews', icon: Chat, perm: 'view_reviews' },
      { name: t('admin.customization'), href: '/dashboard/customization', icon: Gear, perm: 'manage_settings' },
      { name: t('admin.settings'), href: '/dashboard/settings', icon: Gear, perm: 'manage_settings' },
    ]},
    { section: t('admin.sectionCompliance'), items: [
      { name: t('admin.auditLog'), href: '/dashboard/audit', icon: Scroll, perm: 'manage_settings', feature: 'showAuditLogToTenant', adminOnly: true },
    ]}
  ];

  // Back-office "view_*" permissions that MANAGER always has (mirrors the backend
  // `allowRoles: ['MANAGER']` guards) so existing managers keep access without a
  // permission-string migration.
  const MANAGER_VIEW_PERMS = ['view_analytics', 'view_payments', 'view_reviews'];

  const hasPermission = (perm?: string) => {
    if (!perm) return true;
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return true;
    if (user?.role === 'MANAGER' && MANAGER_VIEW_PERMS.includes(perm)) return true;
    if (user?.role === 'HOST' && (perm === 'manage_reservations' || perm === 'manage_tables')) return true;
    // KITCHEN never actually renders dashboard content (the route guard below
    // bounces it to /order-station before anything mounts), but this mirrors
    // HOST's grant for consistency/defensiveness.
    if (user?.role === 'KITCHEN' && perm === 'manage_orders') return true;
    if (!user?.permissions) return false;
    return user.permissions.includes(perm);
  };

  // Opt-in modules are OFF unless the SysAdmin explicitly enabled them, so they
  // never leak into a vertical that shouldn't have them (e.g. wedding Events /
  // Vendors showing on a RESTAURANT). Every other flag is a legacy default-ON
  // feature that only hides when explicitly false, so a failed /settings request
  // doesn't strip a restaurant's core modules.
  const OPT_IN_FEATURES = ['hasEventPipeline', 'hasVendors', 'hasInstallmentPlans', 'hasGuestList', 'showAuditLogToTenant', 'hasOnlineOrdering'];
  const hasFeature = (feature?: string) => {
    if (!feature) return true;
    // Hide feature-gated items until we actually know the tenant's entitlements,
    // so a revoked module can never flash into view on first paint.
    if (!settingsLoaded) return false;
    const optIn = OPT_IN_FEATURES.includes(feature);
    // settings failed to load → keep default-ON modules, keep opt-in ones hidden.
    if (!tenantSettings) return !optIn;
    return optIn ? tenantSettings[feature] === true : tenantSettings[feature] !== false;
  };

  // Separate from hasPermission: adminOnly items/routes (the audit trail) are
  // gated purely on role, so a MANAGER/STAFF holding the broader `manage_settings`
  // permission string still can't see it — matches the backend's
  // roleMiddleware(['ADMIN']) on GET /api/audit.
  const canAccessItem = (item: NavItem) =>
    hasPermission(item.perm) && hasFeature(item.feature) && (!item.adminOnly || user?.role === 'ADMIN');

  // Route-level authorization: if the current page needs a permission the user
  // lacks, bounce them to the first page they can open (or their profile). This
  // stops direct-URL access to dashboards they aren't assigned.
  useEffect(() => {
    if (!isMounted || !isAuthenticated || !user) return;
    // KITCHEN accounts have zero dashboard access, full stop — unlike HOST
    // (which stays inside AdminLayout for its granted pages), the order
    // station lives entirely outside this layout. Bounce immediately on
    // every /dashboard/* path, including ones with no listed ROUTE_PERMS
    // entry (e.g. a stale bookmark to /dashboard/profile), which the
    // permission check below would otherwise let through.
    if (user.role === 'KITCHEN') {
      router.replace('/order-station');
      return;
    }
    const needed = requiredPermForPath(pathname);
    const blockedByRole = requiresAdminOnly(pathname) && user.role !== 'ADMIN';
    if (blockedByRole || (needed && !hasPermission(needed))) {
      // HOST staff work the host stand — send them there instead of whatever
      // happens to be first in nav order, even on a stale bookmark/deep link.
      if (user.role === 'HOST' && hasPermission('manage_reservations')) {
        router.replace('/dashboard/host');
        return;
      }
      const firstAllowed = navigation
        .flatMap(g => g.items)
        .find(item => canAccessItem(item));
      router.replace(firstAllowed ? firstAllowed.href : '/dashboard/profile');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, isAuthenticated, user, pathname, tenantSettings]);

  const handleLogout = async () => {
    // Await so the local "authenticated" cache is actually cleared before we
    // navigate — otherwise the login page's own redirect-when-authenticated
    // effect could see stale state and bounce straight back to /dashboard.
    await logout();
    router.push('/auth/login');
  };

  if (!isMounted) return null; // Avoid hydration mismatch
  if (!isAuthenticated) return null; // Wait for redirect

  // Hold the dashboard behind a neutral, themed splash until we've confirmed the
  // platform is live (see verifiedLive). This is what stops the wrong-theme /
  // maintenance flash on a hard refresh: nothing tenant-facing renders until the
  // live /settings request resolves (success → dashboard; maintenance → redirect).
  if (!verifiedLive) {
    return (
      <div data-admin-theme={theme} className="flex min-h-dvh items-center justify-center bg-[var(--admin-bg)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400" />
      </div>
    );
  }

  // Don't mount the page (and let it fire its data request → 403) if the user
  // isn't allowed here; the effect above redirects them. Show chrome + spinner.
  const routeRequiredPerm = requiredPermForPath(pathname);
  const routeAuthorized = (!routeRequiredPerm || hasPermission(routeRequiredPerm)) && (!requiresAdminOnly(pathname) || user?.role === 'ADMIN');

  // Same section/permission/feature filtering the sidebar applies, flattened
  // into one searchable list for the command palette (Cmd/Ctrl+K).
  const paletteItems = navigation.flatMap(group =>
    group.items
      .filter(item => canAccessItem(item))
      .map(item => ({ name: item.name, href: item.href, icon: item.icon, section: group.section }))
  );

  return (
    <div data-admin-theme={theme} className="flex min-h-dvh bg-[var(--admin-bg)]">
      <CommandPalette items={paletteItems} />

      {/* Mobile/tablet overlay — clicking anywhere off the sidebar closes it. */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Floating open button — only on mobile/tablet when the sidebar is hidden.
          Bright/colored so it's obviously the way to reveal navigation. */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          aria-label="Open navigation"
          className="lg:hidden fixed top-3 left-3 z-40 w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-95 transition-all"
        >
          <CaretRight className="w-6 h-6 stroke-[2.5]" />
        </button>
      )}

      {/* Sidebar — below lg it fully hides off-canvas and overlays when open (no
          layout push); at lg+ it collapses to a 16-unit icon rail as before. */}
      <aside
        className={cn(
          // h-dvh (dynamic viewport height), not h-screen/100vh: on iOS Safari
          // 100vh extends behind the browser's bottom toolbar, hiding the sidebar
          // footer (logout/language) under Safari's own buttons so they can't be
          // tapped. dvh is the actually-visible height, keeping the footer reachable.
          "bg-[var(--admin-sidebar)] text-stone-700 border-r border-stone-300 transition-all duration-300 ease-in-out flex flex-col z-50 fixed lg:sticky top-0 h-dvh",
          isSidebarOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full lg:w-16 lg:translate-x-0"
        )}
      >
        {/* Sidebar Header — logo + collapse/expand toggle (works on desktop too,
            since there's no top bar anymore). */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-stone-300">
          {isSidebarOpen ? (
            <>
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0">
                  <vIcon.brand className="w-5 h-5 text-white" />
                </div>
                <span className="font-semibold text-sm tracking-tight text-stone-900 whitespace-nowrap">
                  Reserve<span className="text-[var(--admin-accent)]">Pro</span>
                </span>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Collapse navigation"
                className="text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-md w-8 h-8 flex items-center justify-center shrink-0"
              >
                <CaretLeft className="w-5 h-5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Expand navigation"
              title="Expand"
              className="w-full flex items-center justify-center group"
            >
              <div className="w-8 h-8 rounded-lg bg-[#111111] flex items-center justify-center shrink-0 group-hover:hidden">
                <vIcon.brand className="w-5 h-5 text-white" />
              </div>
              <CaretRight className="w-6 h-6 text-[var(--admin-accent)] hidden group-hover:block" />
            </button>
          )}
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 scrollbar-none">
          <div className="px-3 space-y-8">
            {navigation.map((group) => {
              const visibleItems = group.items.filter(item => canAccessItem(item));
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.section}>
                  {isSidebarOpen && (
                    <h3 className="px-3 text-[10px] font-semibold text-stone-400 tracking-[0.18em] mb-3">
                      {group.section}
                    </h3>
                  )}
                  <ul className="space-y-1.5">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                      return (
                        <li key={item.name}>
                          <Link
                            href={item.href}
                            onClick={(e) => {
                              // Below lg the sidebar is an overlay — close it after navigating.
                              if (window.innerWidth < 1024) {
                                setIsSidebarOpen(false);
                              } else if (!isSidebarOpen) {
                                e.preventDefault();
                                setIsSidebarOpen(true);
                              }
                            }}
                            className={cn(
                              "flex items-center justify-between py-2.5 text-sm font-semibold rounded-md transition-all duration-150 group",
                              // Current-page indication is more than a color swap: a
                              // left accent edge + weight bump layer on top of the
                              // filled accent background, so it reads as deliberate
                              // rather than just "this row happens to be blue."
                              isActive
                                ? "bg-[var(--admin-accent-tint)] text-[var(--admin-accent-strong)] font-bold border-l-2 border-[var(--admin-accent)] pl-2.5 pr-3"
                                : "px-3 hover:bg-stone-100 hover:text-stone-900"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <item.icon
                                weight={isActive ? "bold" : "regular"}
                                className={cn(
                                  "w-[18px] h-[18px] shrink-0",
                                  isActive ? "text-[var(--admin-accent-strong)]" : "text-stone-400 group-hover:text-stone-700"
                                )}
                              />
                              {isSidebarOpen && <span>{item.name}</span>}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>

        {/* Sidebar Footer — the account area. All the old top-bar controls
            (profile/user settings, language, logout) live here now. */}
        <div className="border-t border-stone-300 mt-auto">
          {isSidebarOpen ? (
            <div className="p-3 space-y-2">
              <span className="block px-1 text-[9px] font-semibold tracking-[0.18em] text-stone-400">{t('admin.userSettings')}</span>
              <Link
                href="/dashboard/profile"
                onClick={() => { if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                title={t('admin.userSettings')}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-stone-100 transition-colors group"
              >
                <Avatar className="w-9 h-9 border border-stone-300 shrink-0">
                  <AvatarImage src={`https://avatar.iran.liara.run/username?username=${user?.firstName}+${user?.lastName}`} />
                  <AvatarFallback className="bg-[#111111] text-white text-[10px] font-semibold">{user?.firstName?.[0]}{user?.lastName?.[0]}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-semibold text-stone-900 truncate capitalize">{user?.firstName} {user?.lastName}</span>
                  <span className="text-[9px] font-semibold text-[var(--admin-accent)] tracking-tighter">{user?.role}</span>
                </div>
                <Gear className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition-colors shrink-0" />
              </Link>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-300">
                <LanguageSwitcher />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-stone-400 hover:text-red-600 hover:bg-red-50 font-semibold text-xs gap-2 px-2 h-9"
                >
                  <SignOut className="w-4 h-4" /> {t('admin.logout')}
                </Button>
              </div>
            </div>
          ) : (
            /* Collapsed rail: icon-only profile + logout. */
            <div className="py-3 flex flex-col items-center gap-2">
              <Link href="/dashboard/profile" title={t('admin.userSettings')}>
                <Avatar className="w-8 h-8 border border-stone-300">
                  <AvatarImage src={`https://avatar.iran.liara.run/username?username=${user?.firstName}+${user?.lastName}`} />
                  <AvatarFallback className="bg-[#111111] text-white text-[9px] font-semibold">{user?.firstName?.[0]}{user?.lastName?.[0]}</AvatarFallback>
                </Avatar>
              </Link>
              <button
                onClick={handleLogout}
                title={t('admin.logout')}
                className="text-stone-400 hover:text-red-600 hover:bg-red-50 w-8 h-8 flex items-center justify-center rounded-md transition-colors"
              >
                <SignOut className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="px-4 py-2 flex items-center gap-2 border-t border-stone-300 justify-center lg:justify-start">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            {isSidebarOpen && <span className="text-[10px] font-semibold text-stone-400">System Online</span>}
          </div>
        </div>
      </aside>

      {/* Main Content Area — no top bar; all account/nav controls live in the sidebar. */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <ImpersonationBanner />
        {/* Scrollable Content. Mobile/tablet gets minimal padding (and top space for
            the floating menu button) so the dashboard uses the full screen. */}
        <main className="flex-1 p-3 pt-16 sm:p-4 sm:pt-16 lg:p-6 lg:pt-6">
          <div className="mx-auto max-w-full">
            {routeAuthorized ? children : (
              <div className="flex items-center justify-center h-[60vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
