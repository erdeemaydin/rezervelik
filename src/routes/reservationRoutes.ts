import { Router } from 'express';
import * as reservationController from '../controllers/reservationController';
import { authMiddleware, requirePermission } from '../middlewares/auth';
import { rateLimitOrNoop } from '../middlewares/rateLimit';

const router = Router();

// Allow public to create reservations (assuming tenantMiddleware sets the restaurant ID context).
// Rate-limited for guest (unauthenticated) callers only — staff traffic on
// this same path is unaffected.
router.post(
  '/',
  rateLimitOrNoop({ windowMs: 60_000, max: 10, keyPrefix: 'reservation-create' }),
  reservationController.createReservation
);

// Protect staff/management routes
router.use(authMiddleware);
router.use(requirePermission('manage_reservations'));

router.get('/', reservationController.getReservations);
router.put('/:id', reservationController.updateReservation);
router.patch('/:id/schedule', reservationController.updateReservationSchedule);
router.put('/:id/status', reservationController.updateReservationStatus);
router.delete('/:id', reservationController.deleteReservation);

export default router;
