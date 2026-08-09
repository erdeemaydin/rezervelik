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
// visitor of the public booking page. Gated the same way the dashboard nav
// already implies (perm: 'manage_settings', feature: 'hasWaitTimeFeature').
router.use(authMiddleware);
router.use(requireFeature('hasWaitTimeFeature'));
router.use(requirePermission('manage_settings'));

router.get('/config', getWaitTimeConfig);
router.put('/config', updateWaitTimeConfig);

router.get('/entries', getWaitlist);
router.post('/entries', joinWaitlist);
router.put('/entries/:entryId/status', updateWaitlistStatus);
router.post('/entries/:entryId/offer', sendOffer);

export default router;
