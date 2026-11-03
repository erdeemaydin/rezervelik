import { Request } from 'express';
import { DEMO_RESTAURANT_ID } from '../config/demo';

// Writes a public demo visitor must not make, because they would lock the next
// visitor out (password, 2FA, staff accounts, tenant 2FA policy in settings),
// deface the public booking page (branding), fill the server's disk (uploads)
// or touch money flows (refunds). Day-to-day operations — reservations, tables,
// menus, shifts, waitlist — stay fully writable; scripts/demo-tenant.ts resets
// the tenant every night.
const BLOCKED_WRITE_PREFIXES = [
  '/api/auth/change-password',
  '/api/auth/2fa',
  '/api/staff',
  '/api/settings',
  '/api/customization',
  '/api/uploads',
  '/api/payments',
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** True when this authenticated request is a blocked write from a demo-tenant session. */
export function isBlockedDemoWrite(req: Request, user: { role: string; restaurantId?: string | null }): boolean {
  if (user.role === 'SUPER_ADMIN' || user.restaurantId !== DEMO_RESTAURANT_ID) return false;
  if (!WRITE_METHODS.has(req.method)) return false;
  const path = req.originalUrl.split('?')[0];
  return BLOCKED_WRITE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}
