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
import { rateLimitOrNoop } from '../middlewares/rateLimit';

const router = Router();

router.get('/restaurant/:slug', getRestaurantBySlug);
router.post(
  '/restaurant/:slug/waitlist',
  rateLimitOrNoop({ windowMs: 60_000, max: 10, keyPrefix: 'waitlist-join' }),
  joinPublicWaitlist
);
router.get('/day-status', getDayStatus);
router.get('/offer/:token', getOffer);
router.post('/offer/:token/accept', acceptOffer);
router.post('/offer/:token/decline', declineOffer);

// e-davetiye invitation microsite (public, token-keyed)
router.get('/invitation/:token', getInvitation);
router.post(
  '/invitation/:token/rsvp',
  rateLimitOrNoop({ windowMs: 60_000, max: 10, keyPrefix: 'invitation-rsvp' }),
  submitInvitationRsvp
);

// Payments (public: the customer payment page + the gateway's server-to-server callback)
router.post('/payment/callback', paymentCallback);      // PayTR notification (source of truth)
router.post('/payment/mock/complete', mockComplete);    // dev-only simulate
// Unlike every other public endpoint here, this one was unrated-limited despite
// being keyed by a human-typed short code — an unauthenticated caller could
// brute-force codes for reservation PII, and each hit on a valid PENDING
// payment also fires a live call to the payment gateway (free amplification
// against the merchant account).
router.get(
  '/payment/session/:ref',
  rateLimitOrNoop({ windowMs: 60_000, max: 20, keyPrefix: 'payment-session' }),
  getPublicPaymentSession
);

export default router;
