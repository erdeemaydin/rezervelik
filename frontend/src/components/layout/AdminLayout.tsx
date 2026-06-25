'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  Grid, 
  Settings, 
  LogOut, 
  Calendar,
  UtensilsCrossed,
  BarChart3,
  MessageSquare,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Clock,
  Tablet
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface AdminLayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: any;
  badge?: string;
  perm?: string;
  feature?: string;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [tenantSettings, setTenantSettings] = useState<any>(null);

  useEffect(() => {
    setIsMounted(true);
    if (window.innerWidth >= 768) {
      setIsSidebarOpen(true);
    }
    
    if (isAuthenticated) {
      // Fetch tenant settings to check feature flags
      import('@/lib/api').then(({ default: api }) => {
        api.get('/settings').then((res) => {
          setTenantSettings(res.data.data);
        }).catch(err => console.error('Failed to fetch settings:', err));
      });
    }
  }, [isAuthenticated]);

  // AUTH GUARD - Prevent "ghost" staff login
  useEffect(() => {
    if (isMounted && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [isMounted, isAuthenticated, router]);

  const navigation: NavSection[] = [
    { section: 'Overview', items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, badge: 'New' },
    ]},
    { section: 'Operations', items: [
      { name: 'Reservations', href: '/dashboard/reservations', icon: Calendar, badge: '12', perm: 'manage_reservations' },
      { name: 'Host Console', href: '/dashboard/host', icon: Tablet, badge: 'iPad', perm: 'manage_reservations' },
      { name: 'Calendar Master', href: '/dashboard/calendar', icon: Calendar, badge: 'New', perm: 'manage_calendar' },
      { name: 'Tables & Floor', href: '/dashboard/tables', icon: Grid, perm: 'manage_tables' },
      { name: 'Menu', href: '/dashboard/menus', icon: UtensilsCrossed, perm: 'manage_menu', feature: 'hasMenuFeature' },
      { name: 'Wait Time / Queue', href: '/dashboard/wait-time', icon: Clock, badge: 'Live', perm: 'manage_settings', feature: 'hasWaitTimeFeature' },
      { name: 'Scheduling', href: '/dashboard/scheduling', icon: Calendar, badge: 'New', feature: 'hasShiftFeature' },
    ]},
    { section: 'Administration', items: [
      { name: 'Transactions', href: '/dashboard/payments', icon: CreditCard, feature: 'hasPaymentFeature' },
      { name: 'Staff Members', href: '/dashboard/staff', icon: Users, perm: 'manage_staff' },
      { name: 'Reviews', href: '/dashboard/reviews', icon: MessageSquare },
      { name: 'Customization', href: '/dashboard/customization', icon: Settings, perm: 'manage_settings' },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings, perm: 'manage_settings' },
    ]}
  ];

  const hasPermission = (perm?: string) => {
    if (!perm) return true;
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return true;
    if (user?.role === 'HOST' && (perm === 'manage_reservations' || perm === 'manage_tables')) return true;
    if (!user?.permissions) return false;
    return user.permissions.includes(perm);
  };

  const hasFeature = (feature?: string) => {
    if (!feature) return true;
    if (!tenantSettings) return true; // Show by default until loaded
    return tenantSettings[feature] !== false;
  };

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  if (!isMounted) return null; // Avoid hydration mismatch
  if (!isAuthenticated) return null; // Wait for redirect

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-[#0f172a] text-slate-300 transition-all duration-300 ease-in-out flex flex-col z-50 shadow-xl absolute md:relative inset-y-0 left-0 h-full",
          isSidebarOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full md:w-16 md:translate-x-0"
        )}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-800 bg-[#1e293b]/20">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-5 h-5 text-white" />
            </div>
            {isSidebarOpen && (
              <span className="font-black text-sm tracking-tight text-white uppercase whitespace-nowrap">
                Reserve<span className="text-blue-500">Pro</span>
              </span>
            )}
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 scrollbar-none">
          <div className="px-3 space-y-8">
            {navigation.map((group) => {
              const visibleItems = group.items.filter(item => hasPermission(item.perm) && hasFeature((item as any).feature));
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.section}>
                  {isSidebarOpen && (
                    <h3 className="px-3 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">
                      {group.section}
                    </h3>
                  )}
                  <ul className="space-y-1">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                      return (
                        <li key={item.name}>
                          <Link
                            href={item.href}
                            onClick={(e) => {
                              if (window.innerWidth < 768) {
                                setIsSidebarOpen(false);
                              } else if (!isSidebarOpen) {
                                e.preventDefault();
                                setIsSidebarOpen(true);
                              }
                            }}
                            className={cn(
                              "flex items-center justify-between px-3 py-2 text-xs font-bold rounded-md transition-all duration-150 group",
                              isActive 
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                                : "hover:bg-slate-800/50 hover:text-white"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <item.icon className={cn(
                                "w-4 h-4 shrink-0",
                                isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                              )} />
                              {isSidebarOpen && <span>{item.name}</span>}
                            </div>
                            {isSidebarOpen && item.badge && (
                              <Badge className={cn(
                                "h-4 px-1.5 text-[8px] font-black uppercase tracking-wider",
                                isActive ? "bg-white text-blue-600" : "bg-blue-600/10 text-blue-500"
                              )}>
                                {item.badge}
                              </Badge>
                            )}
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

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#1e293b]/20 mt-auto">
          <div className="flex items-center gap-3 px-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Online</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 md:px-8 shrink-0 z-40 shadow-sm shadow-slate-200/20">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="text-slate-500 hover:bg-slate-50"
            >
              {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            </Button>
            <div className="h-4 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Zone:</span>
              <Badge variant="outline" className="text-[10px] font-black uppercase border-blue-200 text-blue-600 bg-blue-50">
                Main Dining Room
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 pr-4 border-r border-slate-100">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-xs font-black text-slate-800 truncate capitalize">{user?.firstName} {user?.lastName}</span>
                <span className="text-[9px] font-bold text-blue-600 uppercase tracking-tighter">{user?.role}</span>
              </div>
              <Avatar className="w-9 h-9 border-2 border-slate-100 ring-2 ring-blue-50">
                <AvatarImage src={`https://avatar.iran.liara.run/username?username=${user?.firstName}+${user?.lastName}`} />
                <AvatarFallback className="bg-blue-600 text-white text-[10px] font-black uppercase">{user?.firstName?.[0]}{user?.lastName?.[0]}</AvatarFallback>
              </Avatar>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-500 hover:text-red-600 hover:bg-red-50 font-bold text-xs gap-2 px-3 h-9"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
