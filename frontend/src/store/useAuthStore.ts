import { create } from 'zustand';
import { readAuth, writeAuth, clearAuth } from '@/lib/authStorage';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  restaurantId: string;
  permissions?: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  // True once startImpersonation() has stashed a SUPER_ADMIN session — drives
  // the "Viewing as X — Return to Admin" banner in AdminLayout.
  isImpersonating: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  // Stashes the current (SUPER_ADMIN) session, then switches to the
  // impersonated tenant user's session. Call from the impersonate action —
  // never call login() directly for that, or there's no way back to the
  // admin session short of a fresh login.
  startImpersonation: (token: string, user: User) => void;
  // Restores the stashed SUPER_ADMIN session. Returns true if a stash existed
  // and was restored; false (no-op) if called when not impersonating.
  stopImpersonation: () => boolean;
}

const parseUser = (raw?: string): User | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthState>((set, get) => {
  const savedToken = readAuth('token');
  const savedUser = parseUser(readAuth('user'));
  const savedStashToken = readAuth('adminStashToken');

  return {
    user: savedUser,
    token: savedToken ?? null,
    // In-memory token is the runtime source of truth; persisted storage only
    // needs to survive a reload. Requiring both a token and a user avoids a
    // half-hydrated "ghost" session.
    isAuthenticated: !!savedToken && !!savedUser,
    // A stash surviving a reload means impersonation was still active.
    isImpersonating: !!savedStashToken,

    login: (token, user) => {
      writeAuth('token', token);
      writeAuth('restaurantId', user.restaurantId);
      writeAuth('user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true });
    },

    logout: () => {
      clearAuth();
      set({ user: null, token: null, isAuthenticated: false, isImpersonating: false });
    },

    startImpersonation: (token, user) => {
      const { token: currentToken, user: currentUser } = get();
      if (currentToken && currentUser) {
        writeAuth('adminStashToken', currentToken);
        writeAuth('adminStashUser', JSON.stringify(currentUser));
      }
      writeAuth('token', token);
      writeAuth('restaurantId', user.restaurantId);
      writeAuth('user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true, isImpersonating: true });
    },

    stopImpersonation: () => {
      const stashToken = readAuth('adminStashToken');
      const stashUser = parseUser(readAuth('adminStashUser'));
      if (!stashToken || !stashUser) return false;

      writeAuth('token', stashToken);
      writeAuth('restaurantId', stashUser.restaurantId);
      writeAuth('user', JSON.stringify(stashUser));
      writeAuth('adminStashToken', '');
      writeAuth('adminStashUser', '');
      set({ user: stashUser, token: stashToken, isAuthenticated: true, isImpersonating: false });
      return true;
    },
  };
});
