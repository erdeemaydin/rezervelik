import { Router } from 'express';
import * as restaurantController from '../controllers/restaurantController';
import * as analyticsController from '../controllers/analyticsController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Managers are back-office by default, so they keep analytics access without the
// explicit permission key; STAFF/HOST must be granted `view_analytics`.
const requireAnalytics = requirePermission('view_analytics', { allowRoles: ['MANAGER'] });

// Base restaurant info is needed by every authenticated user (layout, feature flags).
router.get('/me', authMiddleware, restaurantController.getRestaurant);

// Dashboard/analytics data is gated so it cannot be pulled just by knowing the URL.
router.get('/stats', authMiddleware, requireAnalytics, restaurantController.getDashboardStats);
router.get('/analytics', authMiddleware, requireAnalytics, analyticsController.getAnalytics);
router.get('/today', authMiddleware, requireAnalytics, analyticsController.getTodayStats);

// Widget configuration (for package B)
router.get('/widget-snippets', authMiddleware, restaurantController.getWidgetSnippets);

export default router;
