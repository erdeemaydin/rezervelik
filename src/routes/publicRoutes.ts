import { Router } from 'express';
import {
  getRestaurantBySlug,
  joinPublicWaitlist,
  getDayStatus,
  getOffer,
  acceptOffer,
  declineOffer,
  getInvitation,
  submitInvitationRsvp
} from '../controllers/publicController';
import {
  getPublicPaymentSession,
  paymentCallback,
  mockComplete,
} from '../controllers/paymentController';

const router = Router();

router.get('/restaurant/:slug', getRestaurantBySlug);
router.post('/restaurant/:slug/waitlist', joinPublicWaitlist);
router.get('/day-status', getDayStatus);
router.get('/offer/:token', getOffer);
router.post('/offer/:token/accept', acceptOffer);
router.post('/offer/:token/decline', declineOffer);

// e-davetiye invitation microsite (public, token-keyed)
router.get('/invitation/:token', getInvitation);
router.post('/invitation/:token/rsvp', submitInvitationRsvp);

// Payments (public: the customer payment page + the gateway's server-to-server callback)
router.post('/payment/callback', paymentCallback);      // PayTR notification (source of truth)
router.post('/payment/mock/complete', mockComplete);    // dev-only simulate
router.get('/payment/session/:ref', getPublicPaymentSession);

export default router;
