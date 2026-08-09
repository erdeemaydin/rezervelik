import { Router } from 'express';
import * as eventController from '../controllers/eventController';
import { authMiddleware, requirePermission } from '../middlewares/auth';
import { requireFeature } from '../middlewares/feature';

const router = Router();

router.use(authMiddleware);
// The event pipeline is a WEDDING-vertical module — previously gated only by
// the manage_events permission below, with nothing checking the SysAdmin's
// hasEventPipeline entitlement. A tenant whose flag was turned off (e.g.
// downgraded, or any non-WEDDING businessType, which defaults it off) could
// still hit every endpoint here directly; only the dashboard nav link was hidden.
router.use(requireFeature('hasEventPipeline'));

// Reads — any authenticated tenant user.
router.get('/', eventController.getEvents);
router.get('/:id', eventController.getEvent);
router.get('/:eventId/guests', eventController.getGuests);
router.get('/:eventId/vendors', eventController.getEventVendors);

// Mutations — gated by manage_events (SUPER_ADMIN/ADMIN bypass requirePermission).
router.use(requirePermission('manage_events'));

// Events
router.post('/', eventController.createEvent);
router.put('/:id', eventController.updateEvent);
router.delete('/:id', eventController.deleteEvent);

// e-davetiye invitation link (mint/rotate the public token)
router.post('/:id/invitation', eventController.generateInvitation);

// Vendor coordination (link tenant vendors to an event)
router.post('/:eventId/vendors', eventController.addEventVendor);
router.put('/vendors/:linkId', eventController.updateEventVendor);
router.delete('/vendors/:linkId', eventController.removeEventVendor);

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
