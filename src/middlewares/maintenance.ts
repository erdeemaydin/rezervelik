import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { verifyToken } from '../utils/jwt';
import { errorResponse } from '../utils/response';

// When the SysAdmin flips GlobalSettings.maintenanceMode on, tenant + public API
// traffic is turned away with a 503 so nobody can use the platform mid-work —
// while SUPER_ADMINs (and the auth/system routes they need) keep working so they
// can actually toggle it back off.
//
// The flag is cached in-memory for a few seconds so we don't hit the DB on every
// single request; `bustMaintenanceCache()` clears it the instant the setting is
// updated so the change is effectively immediate.
let cache: { on: boolean; at: number } = { on: false, at: 0 };
const TTL_MS = 10_000;

export const bustMaintenanceCache = () => { cache.at = 0; };

const isMaintenanceOn = async (): Promise<boolean> => {
  const now = Date.now();
  if (now - cache.at < TTL_MS) return cache.on;
  try {
    const s = await prisma.globalSettings.findUnique({
      where: { id: 'global_1' },
      select: { maintenanceMode: true },
    });
    cache = { on: !!s?.maintenanceMode, at: now };
  } catch {
    // If we can't read the flag, fail OPEN — never lock the whole platform out
    // because of a transient DB hiccup.
    cache = { on: false, at: now };
  }
  return cache.on;
};

const isSuperAdmin = (req: Request): boolean => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return false;
  try {
    return verifyToken(header.split(' ')[1]).role === 'SUPER_ADMIN';
  } catch {
    return false;
  }
};

export const maintenanceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await isMaintenanceOn())) return next();
    if (isSuperAdmin(req)) return next();
    return errorResponse(res, 'errors.maintenance', 503);
  } catch {
    // Guard must never take the API down itself.
    return next();
  }
};
