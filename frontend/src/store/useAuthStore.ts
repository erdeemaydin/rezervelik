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
  login: (token: string, user: User) => void;
  logout: () => void;
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
  const savedToken = readAuth('token');
  const savedUser = parseUser(readAuth('user'));

  return {
    user: savedUser,
    token: savedToken ?? null,
    // In-memory token is the runtime source of truth; persisted storage only
    // needs to survive a reload. Requiring both a token and a user avoids a
    // half-hydrated "ghost" session.
    isAuthenticated: !!savedToken && !!savedUser,

    login: (token, user) => {
      writeAuth('token', token);
      writeAuth('restaurantId', user.restaurantId);
      writeAuth('user', JSON.stringify(user));
      set({ user, token, isAuthenticated: true });
    },

    logout: () => {
      clearAuth();
      set({ user: null, token: null, isAuthenticated: false });
    },
  };
});
