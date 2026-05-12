import { Router } from 'express';
import * as restaurantController from '../controllers/restaurantController';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

router.get('/me', authMiddleware, restaurantController.getRestaurant);
router.get('/stats', authMiddleware, restaurantController.getDashboardStats);

export default router;
