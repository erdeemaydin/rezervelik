import supertest from 'supertest';
import app from '../../src/app';

export const api = supertest(app);

/** Build request headers for an authenticated, tenant-scoped call. */
export function auth(token: string, restaurantId?: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (restaurantId) headers['X-Restaurant-ID'] = restaurantId;
  return headers;
}
