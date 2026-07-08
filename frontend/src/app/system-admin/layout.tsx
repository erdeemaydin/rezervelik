import { ReactNode } from 'react';
import SystemAdminLayout from '@/components/layout/SystemAdminLayout';

// Persistent chrome for the whole /system-admin segment — mounted once and kept
// across client-side navigations so the sidebar, theme, and super-admin guard
// don't remount and flash on every page change.
export default function SystemAdminRootLayout({ children }: { children: ReactNode }) {
  return <SystemAdminLayout>{children}</SystemAdminLayout>;
}
