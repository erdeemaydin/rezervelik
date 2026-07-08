import axios from 'axios';
import { readAuth, clearAuth } from '@/lib/authStorage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:3000/api` : 'http://localhost:3000/api');

const api = axios.create({
  baseURL: API_URL,
  // Without a timeout a request to an unreachable backend hangs forever, so the
  // UI just sits there with no error (e.g. a phone that can load the frontend on
  // :3001 but can't reach the API on :3000). Fail fast so the catch blocks show it.
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    // Read straight from authStorage (in-memory cache → localStorage → legacy
    // cookie). No store coupling here, so a Fast Refresh that re-creates the
    // Zustand singleton can't desync the token the interceptor sends.
    const authToken = readAuth('token');
    const restaurantId = readAuth('restaurantId');

    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }

    if (restaurantId) {
      config.headers['X-Restaurant-ID'] = restaurantId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/')) {
        clearAuth(); // wipe storage; the full reload below re-inits the store as logged-out
        window.location.href = '/auth/login';
      }
    }

    // Platform in maintenance mode: the backend 503s tenant/public traffic (but
    // never SUPER_ADMIN or /auth·/system). Send those users to the maintenance
    // screen. The system-admin console and auth pages are exempt so the root
    // admin can still sign in and toggle maintenance back off.
    if (
      error.response?.status === 503 &&
      error.response?.data?.code === 'errors.maintenance' &&
      typeof window !== 'undefined'
    ) {
      const p = window.location.pathname;
      if (!p.startsWith('/maintenance') && !p.startsWith('/system-admin') && !p.startsWith('/auth')) {
        window.location.href = '/maintenance';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
