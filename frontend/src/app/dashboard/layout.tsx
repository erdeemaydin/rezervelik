import { ReactNode } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';

// Persistent chrome for the whole /dashboard segment. Next.js keeps a layout
// mounted across client-side navigations between its child routes, so the
// sidebar, tenant settings/theme, and auth state are fetched once and survive
// page-to-page navigation — no remount, no nav-item flash-out, no blue→theme
// color flash. (Previously every page wrapped itself in <AdminLayout>, which
// unmounted and rebuilt the whole shell on every click.)
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
