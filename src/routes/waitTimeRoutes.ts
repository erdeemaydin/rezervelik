import { Router } from 'express';
import {
  getWaitTimeConfig,
  updateWaitTimeConfig,
  getWaitlist,
  joinWaitlist,
  updateWaitlistStatus,
  sendOffer
} from '../controllers/waitTimeController';
import { authMiddleware, requirePermission } from '../middlewares/auth';
import { requireFeature } from '../middlewares/feature';

const router = Router();

// This router previously had NO auth check at all (only tenantMiddleware,
// mounted in app.ts, which just requires an X-Restaurant-ID header) — every
// endpoint here, including the live waitlist (customer names/phones) and
// sendOffer, was reachable by anyone who knew a tenant's restaurant UUID. The
// UUID isn't secret: GET /api/public/restaurant/:slug returns it to any
// visitor of the public booking page. Gated with auth + the feature flag here;
// the specific permission differs per route group below.
router.use(authMiddleware);
router.use(requireFeature('hasWaitTimeFeature'));

// Wait-time thresholds/config is business configuration (dashboard nav gates
// it behind 'manage_settings' too) — ADMIN/MANAGER territory.
router.get('/config', requirePermission('manage_settings'), getWaitTimeConfig);
router.put('/config', requirePermission('manage_settings'), updateWaitTimeConfig);

// Waitlist entries are day-to-day host-stand operations, not configuration —
// gated the same as reservations so HOST/STAFF (who have 'manage_reservations'
// but not 'manage_settings') can actually run the waitlist. This previously
// required 'manage_settings' for everything in this router, so any HOST/STAFF
// user hit a permanent 403 on GET /entries — the host console calls it on
// every load, so their console never loaded at all (see host/page.tsx).
router.get('/entries', requirePermission('manage_reservations'), getWaitlist);
router.post('/entries', requirePermission('manage_reservations'), joinWaitlist);
router.put('/entries/:entryId/status', requirePermission('manage_reservations'), updateWaitlistStatus);
router.post('/entries/:entryId/offer', requirePermission('manage_reservations'), sendOffer);

export default router;
