'use client';

import { ReactNode } from 'react';
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
  CreditCard,
  MessageSquare
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const navigation = [
    { section: 'Overview', items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, badge: 'New' },
    ]},
    { section: 'Operations', items: [
      { name: 'Reservations', href: '/dashboard/reservations', icon: Calendar, badge: '12', perm: 'manage_reservations' },
      { name: 'Calendar Master', href: '/dashboard/calendar', icon: Calendar, badge: 'New', perm: 'manage_calendar' },
      { name: 'Tables & Floor', href: '/dashboard/tables', icon: Grid, perm: 'manage_tables' },
      { name: 'Menu', href: '/dashboard/menus', icon: UtensilsCrossed, perm: 'manage_menu' },
    ]},
    { section: 'Administration', items: [
      { name: 'Transactions', href: '/dashboard/payments', icon: CreditCard },
      { name: 'Staff Members', href: '/dashboard/staff', icon: Users, perm: 'manage_staff' },
      { name: 'Reviews', href: '/dashboard/reviews', icon: MessageSquare },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings, perm: 'manage_settings' },
    ]}
  ];

  const hasPermission = (perm?: string) => {
    if (!perm) return true;
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') return true;
    if (!user?.permissions) return false;
    return user.permissions.includes(perm);
  };

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  return (
    <div className="flex h-screen bg-[#f4f6f8] font-sans">
      {/* Sidebar - Inspired by Vue-Element-Admin & Tabler */}
      <aside className="w-64 bg-[#1e293b] text-slate-300 flex flex-col shadow-xl z-10 transition-all duration-300">
        
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 bg-[#0f172a] shadow-sm border-b border-slate-800 text-white">
          <div className="w-7 h-7 bg-blue-600 rounded-sm flex items-center justify-center mr-3 shadow-md">
            <span className="font-bold text-lg leading-none">R</span>
          </div>
          <span className="font-bold text-lg tracking-tight">Reser<span className="text-blue-400">Vue</span></span>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6">
          
          {/* User Profile Mini */}
          <div className="px-6 mb-8 flex items-center space-x-3">
            <Avatar className="h-9 w-9 border border-slate-700 rounded-md">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.firstName}`} className="rounded-md" />
              <AvatarFallback className="bg-slate-800 text-slate-300 rounded-md text-xs">{user?.firstName?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">{user?.role?.toLowerCase() || 'Admin'}</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-6">
            {navigation.map((group, idx) => {
              const visibleItems = group.items.filter(item => hasPermission((item as any).perm));
              if (visibleItems.length === 0) return null;

              return (
                <div key={idx}>
                  <h3 className="px-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">
                    {group.section}
                  </h3>
                  <ul className="space-y-0.5 px-2">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
                      return (
                        <li key={item.name}>
                          <Link
                            href={item.href}
                            className={cn(
                              'flex items-center justify-between px-4 py-2 text-xs font-bold rounded-sm transition-all duration-150 group',
                              isActive 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            )}
                          >
                          <div className="flex items-center">
                            <item.icon
                              className={cn(
                                'mr-3 h-4 w-4 transition-colors',
                                isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
                              )}
                              aria-hidden="true"
                            />
                            {item.name}
                          </div>
                          {(item as any).badge && (
                            <Badge variant={isActive ? "secondary" : "default"} className={cn(
                              "text-[9px] px-1.5 py-0 rounded-sm font-black uppercase tracking-tighter",
                              !isActive && (item as any).badge === 'AI' ? "bg-purple-600/20 text-purple-400 border-purple-800" : "",
                              !isActive && (item as any).badge === 'New' ? "bg-emerald-600/20 text-emerald-400 border-emerald-800" : ""
                            )}>
                              {(item as any).badge}
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
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-slate-800 bg-[#0f172a]">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-400 transition-colors"
            onClick={handleLogout}
          >
            <LogOut className="mr-3 h-5 w-5" />
            Logout Securely
          </Button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-0">
          <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
            {navigation.flatMap(g => g.items).find(i => pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(`${i.href}/`)))?.name || 'Dashboard'}
          </h2>
          <div className="flex items-center space-x-4">
             <div className="relative">
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                <Button variant="ghost" size="icon" className="text-slate-500">
                  <Calendar className="h-5 w-5" />
                </Button>
             </div>
             <Button variant="outline" size="sm" className="hidden md:flex">
               Support
             </Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
