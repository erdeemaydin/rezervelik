import { Router } from 'express';
import * as customerOrderController from '../controllers/customerOrderController';
import { customerAuthMiddleware } from '../middlewares/customerAuth';
import { requireOnlineOrderingAddon, requireOnlineOrderingOpen } from '../middlewares/onlineOrdering';
import { rateLimitOrNoop } from '../middlewares/rateLimit';

const router = Router();

// Public, customer-facing online-ordering surface. Mounted at
// /api/public/order behind tenantMiddleware in app.ts — the frontend already
// resolved req.restaurantId from GET /api/public/restaurant/:slug before
// hitting anything here, same pattern POST /api/reservations (guest path)
// uses. Hidden entirely (404) when the tenant doesn't have the add-on.
router.use(requireOnlineOrderingAddon({ notFoundWhenOff: true }));

// OTP request/verify are fully public, unauthenticated, brute-force-able
// surfaces (a phone number + a 6-digit code) — throttle both by IP the same
// way authRoutes.ts throttles /login and /login/otp. otpService.ts layers a
// per-phone cap + resend cooldown on top of this.
const otpRateLimit = (keyPrefix: string) =>
  rateLimitOrNoop({ windowMs: 15 * 60_000, max: 10, keyPrefix, exemptAuthenticated: false });

router.post('/otp/request', otpRateLimit('order-otp-request'), customerOrderController.requestOtp);
router.post('/otp/verify', otpRateLimit('order-otp-verify'), customerOrderController.verifyOtp);

// Order settings (fulfillment/payment-method flags + open/closed state) are
// deliberately NOT gated by requireOnlineOrderingOpen — the frontend needs to
// read onlineOrderingOpen itself to render a "closed right now" state instead
// of 403ing before it can tell why.
router.get('/settings', customerOrderController.getPublicOrderSettings);

// Menu browsing and price quoting happen before phone identification in the
// flow (spec §5) — no customerAuth required, but both respect the tenant's
// manual "closed for now" kill-switch.
router.get('/menu', requireOnlineOrderingOpen, customerOrderController.getOrderableMenu);
router.get('/zones', requireOnlineOrderingOpen, customerOrderController.listPublicDeliveryZones);
router.post(
  '/quote',
  requireOnlineOrderingOpen,
  rateLimitOrNoop({ windowMs: 60_000, max: 30, keyPrefix: 'order-quote' }),
  customerOrderController.quoteOrder
);

// Delivery-range verdict for a single map pin — same anonymous/rate-limited
// shape as /quote, but usable at the address step before there's a cart.
router.post(
  '/check-address',
  requireOnlineOrderingOpen,
  rateLimitOrNoop({ windowMs: 60_000, max: 30, keyPrefix: 'order-check-address' }),
  customerOrderController.checkAddress
);

// Placing an order requires a verified customer session (or trusted-device
// cookie) and re-validates everything server-side inside its own transaction.
router.post(
  '/',
  customerAuthMiddleware,
  requireOnlineOrderingOpen,
  rateLimitOrNoop({ windowMs: 60_000, max: 10, keyPrefix: 'order-create', exemptAuthenticated: false }),
  customerOrderController.placeOrder
);

// Order history stays reachable even while onlineOrderingOpen is off, so a
// customer can still see past orders.
router.get('/mine', customerAuthMiddleware, customerOrderController.myOrders);

export default router;
