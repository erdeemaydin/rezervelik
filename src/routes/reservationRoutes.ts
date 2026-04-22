import { Router } from 'express';
import * as reservationController from '../controllers/reservationController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

// Allow public to create reservations (assuming tenantMiddleware sets the restaurant ID context)
router.post('/', reservationController.createReservation);

// Protect staff/management routes
router.use(authMiddleware);
router.use(requirePermission('manage_reservations'));

router.get('/', reservationController.getReservations);
router.put('/:id', reservationController.updateReservation);
router.put('/:id/status', reservationController.updateReservationStatus);
router.delete('/:id', reservationController.deleteReservation);

export default router;
