'use client';

import { ReactNode, useState } from 'react';
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
  MessageSquare,
  Menu,
  X
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
      { name: 'Scheduling', href: '/dashboard/scheduling', icon: Calendar, badge: 'New' },
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
    <div className="flex h-screen bg-[#f4f6f8] font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Inspired by Vue-Element-Admin & Tabler */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-30 bg-[#1e293b] text-slate-300 flex flex-col shadow-xl transition-all duration-300 md:relative",
          isSidebarOpen ? "w-64 translate-x-0" : "w-0 -translate-x-full md:w-16 md:translate-x-0 overflow-hidden"
        )}
      >
        
        {/* Brand Header */}
        <div className="h-16 flex w-64 items-center px-4 bg-[#0f172a] shadow-sm border-b border-slate-800 text-white justify-between">
          <div className="flex items-center cursor-pointer" onClick={() => !isSidebarOpen && setIsSidebarOpen(true)}>
            <div className="w-8 h-8 bg-blue-600 rounded-sm flex items-center justify-center mr-3 shadow-md shrink-0">
              <span className="font-bold text-lg leading-none">R</span>
            </div>
            <span className={cn("font-bold text-lg tracking-tight transition-opacity", !isSidebarOpen && "md:opacity-0 md:hidden")}>Reser<span className="text-blue-400">Vue</span></span>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden text-slate-400 hover:text-white" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 overflow-x-hidden">
          
          {/* User Profile Mini */}
          <div className="px-4 mb-8 flex items-center space-x-3">
            <Avatar className="h-8 w-8 border border-slate-700 rounded-md shrink-0">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.firstName}`} className="rounded-md" />
              <AvatarFallback className="bg-slate-800 text-slate-300 rounded-md text-xs">{user?.firstName?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className={cn("overflow-hidden transition-opacity", !isSidebarOpen && "md:opacity-0 md:hidden")}>
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
                  <h3 className={cn("px-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 transition-opacity", !isSidebarOpen && "md:opacity-0 md:h-0 md:overflow-hidden md:mb-0")}>
                    {group.section}
                  </h3>
                  <ul className="space-y-1 px-2">
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
                                setIsSidebarOpen(true);
                              }
                            }}
                            className={cn(
                              'flex items-center justify-between px-3 py-2 text-xs font-bold rounded-md transition-all duration-150 group',
                              isActive 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                              !isSidebarOpen && "md:justify-center"
                            )}
                            title={!isSidebarOpen ? item.name : undefined}
                          >
                          <div className="flex items-center">
                            <item.icon
                              className={cn(
                                'h-4 w-4 transition-colors shrink-0',
                                isSidebarOpen && 'mr-3',
                                isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
                              )}
                              aria-hidden="true"
                            />
                            <span className={cn("transition-opacity whitespace-nowrap", !isSidebarOpen && "md:opacity-0 md:hidden")}>{item.name}</span>
                          </div>
                          {(item as any).badge && (
                            <Badge variant={isActive ? "secondary" : "default"} className={cn(
                              "text-[9px] px-1.5 py-0 rounded-sm font-black uppercase tracking-tighter",
                              !isActive && (item as any).badge === 'AI' ? "bg-purple-600/20 text-purple-400 border-purple-800" : "",
                              !isActive && (item as any).badge === 'New' ? "bg-emerald-600/20 text-emerald-400 border-emerald-800" : "",
                              !isSidebarOpen && "md:hidden"
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
            className={cn("w-full justify-start text-slate-400 hover:text-white hover:bg-red-500/10 hover:text-red-400 transition-colors", !isSidebarOpen && "px-0 justify-center md:px-0")}
            onClick={handleLogout}
            title={!isSidebarOpen ? "Logout Securely" : undefined}
          >
            <LogOut className={cn("h-5 w-5 shrink-0", isSidebarOpen ? "mr-3" : "mr-0")} />
            <span className={cn("whitespace-nowrap transition-opacity", !isSidebarOpen && "md:opacity-0 md:hidden")}>Logout Securely</span>
          </Button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shadow-sm z-0">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="mr-2" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <Menu className="h-5 w-5 text-slate-600" />
            </Button>
            <h2 className="text-xl font-semibold text-slate-800 tracking-tight">
              {navigation.flatMap(g => g.items).find(i => pathname === i.href || (i.href !== '/dashboard' && pathname.startsWith(`${i.href}/`)))?.name || 'Dashboard'}
            </h2>
          </div>
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
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
