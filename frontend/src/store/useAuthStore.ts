import { create } from 'zustand';
import Cookies from 'js-cookie';

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
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const savedUser = Cookies.get('user');
  
  return {
    user: savedUser ? JSON.parse(savedUser) : null,
    isAuthenticated: !!Cookies.get('token'),
    
    login: (token, user) => {
      Cookies.set('token', token, { expires: 1 });
      Cookies.set('restaurantId', user.restaurantId, { expires: 1 });
      Cookies.set('user', JSON.stringify(user), { expires: 1 });
      set({ user, isAuthenticated: true });
    },
    
    logout: () => {
      Cookies.remove('token');
      Cookies.remove('restaurantId');
      Cookies.remove('user');
      set({ user: null, isAuthenticated: false });
    },
  };
});
