import { create } from 'zustand';
import { readAuth, writeAuth, clearAuth } from '@/lib/authStorage';
import api from '@/lib/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  restaurantId: string;
  permissions?: string | null;
  // Only meaningful when role === 'SUPER_ADMIN': true/undefined = full
  // platform root, false = a restricted sub-admin (see systemPermissions.ts).
  isRootAdmin?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  // True once startImpersonation() has switched to an impersonated session —
  // drives the "Viewing as X — Return to Admin" banner in AdminLayout.
  isImpersonating: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
  // Switches to the impersonated tenant user's session. The backend has
  // already stashed the SUPER_ADMIN's own token server-side (an httpOnly
  // cookie the SPA never touches) — call this instead of login() for the
  // impersonate action, or there's no way back short of a fresh login.
  startImpersonation: (user: User) => void;
  // Asks the backend to restore the stashed SUPER_ADMIN session. Returns
  // true if a stash existed and was restored; false if there was nothing to
  // restore (e.g. called when not impersonating, or the request failed).
  stopImpersonation: () => Promise<boolean>;
}

const parseUser = (raw?: string): User | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set) => {
  const savedUser = parseUser(readAuth('user'));

  return {
    user: savedUser,
    // The token itself lives in an httpOnly cookie the SPA can't read — this
    // is a UI-only guard against flashing protected content before the
    // backend has a chance to say otherwise. The backend's cookie check is
    // the real source of truth: a missing/expired cookie 401s the next API
    // call, and the axios interceptor clears this cache and redirects.
    isAuthenticated: !!savedUser,
    isImpersonating: readAuth('impersonating') === 'true',

    login: (user) => {
      writeAuth('restaurantId', user.restaurantId);
      writeAuth('user', JSON.stringify(user));
      set({ user, isAuthenticated: true });
    },

    logout: async () => {
      try {
        await api.post('/auth/logout');
      } catch {
        // Clear local state regardless — the cookie is httpOnly, but a failed
        // logout call shouldn't leave the SPA appearing logged in.
      }
      clearAuth();
      set({ user: null, isAuthenticated: false, isImpersonating: false });
    },

    startImpersonation: (user) => {
      writeAuth('restaurantId', user.restaurantId);
      writeAuth('user', JSON.stringify(user));
      writeAuth('impersonating', 'true');
      set({ user, isAuthenticated: true, isImpersonating: true });
    },

    stopImpersonation: async () => {
      try {
        const res = await api.post('/system/stop-impersonation');
        const user = res.data.data.user as User;
        writeAuth('restaurantId', user.restaurantId ?? '');
        writeAuth('user', JSON.stringify(user));
        writeAuth('impersonating', '');
        set({ user, isAuthenticated: true, isImpersonating: false });
        return true;
      } catch {
        return false;
      }
    },
  };
});
