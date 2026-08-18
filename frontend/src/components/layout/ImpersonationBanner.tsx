'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCog, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from '@/i18n/provider';

// SysAdmin impersonation used to overwrite the admin's own stored session with
// no way back except a fresh login, and nothing on screen indicated the
// session wasn't really the tenant's own admin. This renders whenever
// startImpersonation() left a stashed session behind, and "Return to Admin"
// restores it in place instead of requiring re-authentication. The stash
// itself lives server-side (an httpOnly cookie), so restoring it is a real
// API round trip, not a local state flip.
export function ImpersonationBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const isImpersonating = useAuthStore(state => state.isImpersonating);
  const user = useAuthStore(state => state.user);
  const stopImpersonation = useAuthStore(state => state.stopImpersonation);
  const [returning, setReturning] = useState(false);

  if (!isImpersonating) return null;

  const handleReturn = async () => {
    setReturning(true);
    const ok = await stopImpersonation();
    setReturning(false);
    if (ok) {
      router.push('/system-admin/tenants');
    } else {
      toast.error(t('admin.returnToAdminFailed'));
    }
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950 shadow-md">
      <UserCog className="h-4 w-4 shrink-0" />
      <span className="truncate">
        {t('admin.impersonationBanner').replace('{{name}}', `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || '')}
      </span>
      <button
        onClick={handleReturn}
        disabled={returning}
        className="shrink-0 rounded-md border border-amber-950/30 bg-amber-950/10 px-2.5 py-1 uppercase tracking-wide hover:bg-amber-950/20 transition-colors disabled:opacity-60"
      >
        {returning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('admin.returnToAdmin')}
      </button>
    </div>
  );
}
