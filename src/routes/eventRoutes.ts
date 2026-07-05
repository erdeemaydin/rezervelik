import { Router } from 'express';
import * as eventController from '../controllers/eventController';
import { authMiddleware, requirePermission } from '../middlewares/auth';

const router = Router();

router.use(authMiddleware);

// Reads — any authenticated tenant user.
router.get('/', eventController.getEvents);
router.get('/:id', eventController.getEvent);
router.get('/:eventId/guests', eventController.getGuests);

// Mutations — gated by manage_events (SUPER_ADMIN/ADMIN bypass requirePermission).
router.use(requirePermission('manage_events'));

// Events
router.post('/', eventController.createEvent);
router.put('/:id', eventController.updateEvent);
router.delete('/:id', eventController.deleteEvent);

// Payment plan + installments (nested under an event)
router.put('/:eventId/payment-plan', eventController.upsertPaymentPlan);
router.post('/:eventId/installments', eventController.addInstallment);
router.put('/installments/:installmentId', eventController.updateInstallment);
router.delete('/installments/:installmentId', eventController.deleteInstallment);

// Guests (RSVP + seating)
router.post('/:eventId/guests', eventController.createGuest);
router.put('/guests/:guestId', eventController.updateGuest);
router.delete('/guests/:guestId', eventController.deleteGuest);

export default router;
