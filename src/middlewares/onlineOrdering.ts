import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { errorResponse } from '../utils/response';

/**
 * Commercial add-on gate for `Restaurant.hasOnlineOrdering` (see Phase 0 of
 * docs/packaging/online-ordering-plan.md — same pattern as
 * `hasHostedFrontend`/`hasReservationWidget`, SysAdmin-toggled, never the
 * tenant). Mount after tenantMiddleware.
 *
 * `notFoundWhenOff` controls what an unentitled tenant sees:
 *   - Public customer routes: 404 ("hidden entirely" per spec §Feature
 *     gating) — don't confirm the module exists at all to an anonymous caller.
 *   - Staff routes: 403 — the tenant's own logged-in staff should see a clear
 *     "not enabled for your account" rather than a bare 404, matching how
 *     requireFeature() (src/middlewares/feature.ts) behaves for other
 *     per-tenant module flags.
 */
export const requireOnlineOrderingAddon = (opts: { notFoundWhenOff?: boolean } = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const restaurantId = req.restaurantId;
    if (!restaurantId) return errorResponse(res, 'errors.validation_error', 400);

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { hasOnlineOrdering: true },
    });

    if (!restaurant || !restaurant.hasOnlineOrdering) {
      return opts.notFoundWhenOff
        ? errorResponse(res, 'errors.route_not_found', 404)
        : errorResponse(res, 'errors.online_ordering_disabled', 403);
    }
    next();
  };
};

/**
 * Manual per-tenant kill-switch (`OrderSettings.onlineOrderingOpen`) — unlike
 * the add-on gate above, this is tenant-controlled and expected to flip on
 * and off during the day (e.g. closing time). Only guards the customer-facing
 * "can actually order right now" surface (menu/quote/place-order); OTP login
 * and order history stay reachable so a customer can still sign in / check
 * past orders while the kitchen is closed. Mount after tenantMiddleware.
 */
export const requireOnlineOrderingOpen = async (req: Request, res: Response, next: NextFunction) => {
  const restaurantId = req.restaurantId;
  if (!restaurantId) return errorResponse(res, 'errors.validation_error', 400);

  const settings = await prisma.orderSettings.findUnique({
    where: { restaurantId },
    select: { onlineOrderingOpen: true },
  });

  // No OrderSettings row yet = tenant never configured it; the schema default
  // is `onlineOrderingOpen: true`, so treat a missing row the same way rather
  // than 403ing a tenant that just turned the add-on on and hasn't saved
  // settings yet.
  if (settings && !settings.onlineOrderingOpen) {
    return errorResponse(res, 'errors.online_ordering_closed', 403);
  }
  next();
};
