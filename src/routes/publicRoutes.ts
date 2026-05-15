import { Router } from 'express';
import * as publicController from '../controllers/publicController';

const router = Router();

router.get('/restaurant/:slug', publicController.getRestaurantBySlug);
router.post('/restaurant/:slug/waitlist', publicController.joinPublicWaitlist);
router.get('/day-status', publicController.getDayStatus);

export default router;
