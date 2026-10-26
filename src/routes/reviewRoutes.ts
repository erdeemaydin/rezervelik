import { Router } from 'express';
import * as reviewController from '../controllers/reviewController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Mounted behind tenantMiddleware in app.ts, so queries are scoped to X-Restaurant-ID.
router.use(authMiddleware);

// Viewing real Google reviews is gated by the reviews module permission.
router.get('/', requirePermission('view_reviews'), reviewController.getGoogleReviews);

// Configuring the review source (the Google Maps link) is a settings action.
router.put('/config', requirePermission('manage_settings'), reviewController.updateReviewConfig);

export default router;
