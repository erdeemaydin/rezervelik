import { Router } from 'express';
import * as publicController from '../controllers/publicController';

const router = Router();

router.get('/restaurant/:slug', publicController.getRestaurantBySlug);
router.get('/day-status', publicController.getDayStatus);

export default router;
