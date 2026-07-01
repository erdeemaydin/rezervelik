import { Router } from 'express';
import {
  getRestaurantBySlug,
  joinPublicWaitlist,
  getDayStatus,
  getOffer,
  acceptOffer,
  declineOffer
} from '../controllers/publicController';

const router = Router();

router.get('/restaurant/:slug', getRestaurantBySlug);
router.post('/restaurant/:slug/waitlist', joinPublicWaitlist);
router.get('/day-status', getDayStatus);
router.get('/offer/:token', getOffer);
router.post('/offer/:token/accept', acceptOffer);
router.post('/offer/:token/decline', declineOffer);

export default router;
