import { Router } from 'express';
import * as restaurantController from '../controllers/restaurantController';
import * as analyticsController from '../controllers/analyticsController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.get('/me', authMiddleware, restaurantController.getRestaurant);
router.get('/stats', authMiddleware, restaurantController.getDashboardStats);
router.get('/analytics', authMiddleware, analyticsController.getAnalytics);
router.get('/today', authMiddleware, analyticsController.getTodayStats);

export default router;
